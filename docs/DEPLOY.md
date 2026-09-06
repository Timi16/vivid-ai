# Deploying the backend

One EC2 instance runs the API, the worker, Postgres, Redis, MinIO and the code
sandbox under docker compose. Pushing to the `prod` branch builds the images on
GitHub's runners, pushes them to GHCR, and tells the box to pull and restart.

The browser service (`vivid-tools`) is **not** on this box. Chromium is the
heaviest and least predictable process in the system, and it renders pages
chosen by users and models, so it runs on its own instance with its own
compose file and Caddy in front. The backend reaches it over https.

- Pipeline: [`.github/workflows/deploy-backend.yml`](../.github/workflows/deploy-backend.yml)
- What runs on the box: [`docker-compose.prod.yml`](../docker-compose.prod.yml)
- What the box executes on deploy: [`.github/scripts/deploy-remote.sh`](../.github/scripts/deploy-remote.sh)

Production secrets live in `/opt/vivid/.env` **on the instance** and never pass
through CI. The pipeline only ever sends a compose file and an image tag.

## One-time setup on the instance

Docker, the compose plugin, and a directory the deploy user owns:

```bash
# Ubuntu
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-plugin curl
sudo usermod -aG docker "$USER"      # log out and back in for this to apply

sudo mkdir -p /opt/vivid
sudo chown "$USER" /opt/vivid
```

`curl` is required: the deploy script uses it to check `/v1/health` before it
declares a release good.

Then write `/opt/vivid/.env`. This file is the production configuration, and
the stack refuses to start if any of the first five are missing:

```ini
# Refuse-to-start secrets. Generate each with: openssl rand -hex 32
POSTGRES_PASSWORD=
JWT_SECRET=
BROWSER_TOKEN=
S3_ACCESS_KEY=
S3_SECRET_KEY=

# Where browsers reach MinIO. Presigned download URLs are signed against this
# address, so it must be what a browser can actually resolve, not localhost.
S3_PUBLIC_ENDPOINT_URL=https://files.your-domain.com
S3_BUCKET=vivid

# Who may call the API from a browser.
CORS_ORIGINS=["https://your-frontend-domain.com"]

# Set to 127.0.0.1 when nginx or Caddy terminates TLS on this box; leave unset
# to publish the API on the instance's own address.
# BACKEND_BIND=127.0.0.1

# Which upstream answers model calls: runpod (the pods below) or openrouter.
# See "Failing over to OpenRouter" further down.
MODEL_PROVIDER=runpod
OPENROUTER_API_KEY=
# LLM_PROVIDER= CODE_LLM_PROVIDER= ASR_PROVIDER= TTS_PROVIDER=   (per-service overrides)
# OPENROUTER_CHAT_MODEL=google/gemma-3-27b-it
# OPENROUTER_CODE_MODEL=mistralai/devstral-2512
# OPENROUTER_STT_MODEL=openai/whisper-large-v3
# OPENROUTER_TTS_MODEL=hexgrad/kokoro-82m

# Model services on RunPod
LLM_BASE_URL=https://<pod>-8000.proxy.runpod.net/v1
LLM_MODEL=RedHatAI/gemma-3-27b-it-quantized.w4a16
LLM_CONTEXT_TOKENS=16384
# The coding model behind /v1 as `vivid-code` (Vivid Code, the VS Code
# extension). Leave empty to serve that alias off the chat pod above.
CODE_LLM_BASE_URL=https://<pod>-8000.proxy.runpod.net/v1
CODE_LLM_MODEL=
CODE_LLM_CONTEXT_TOKENS=100000
MAX_REPLY_TOKENS=6144
HISTORY_TOKEN_BUDGET=8000
ASR_BASE_URL=https://<pod>-8002.proxy.runpod.net
TTS_BASE_URL=https://<pod>-8003.proxy.runpod.net
TRANSLATE_BASE_URL=https://<pod>-8004.proxy.runpod.net
EMBEDDINGS_URL=
RERANKER_URL=

# The browser service on its own box. https is not optional: BROWSER_TOKEN
# is sent as a bearer header, so plain http would put it on the wire in clear
# text. Use the same BROWSER_TOKEN value that box's .env has.
VIVID_TOOLS_URL=https://browser.your-domain.com

# Tools and sign-in
TAVILY_API_KEY=
DECANE_APP_ID=
DECANE_VERIFICATION_KEY=
```

`ALLOW_PASSWORD_AUTH` is not listed on purpose: the compose file pins it off.
Production sign-in is Decane only, Google or an emailed code.

Security group: allow 22 from wherever you deploy, 8000 (or 80/443 if you put a
reverse proxy in front) and 9000 for file downloads. Postgres and Redis publish
no ports at all; reach them with `docker compose exec`.

## GitHub configuration

Repository **secrets**:

| Secret | What it is |
| --- | --- |
| `EC2_HOST` | Public DNS name or IP of the instance |
| `EC2_USER` | SSH user (`ubuntu` on Ubuntu AMIs, `ec2-user` on Amazon Linux) |
| `EC2_SSH_KEY` | Private key with access to that user, whole PEM including the header and footer lines |
| `EC2_HOST_KEY` | Optional. Output of `ssh-keyscan -H <host>`. Set it: without it the runner trusts whatever answers on the address |

Repository **variables** (optional):

| Variable | Default |
| --- | --- |
| `DEPLOY_PATH` | `/opt/vivid` |
| `EC2_PORT` | `22` |

Nothing else is needed. Images are pushed to GHCR with the run's own
`GITHUB_TOKEN`, and the box logs in with that same short-lived token and logs
out again when the deploy finishes, so no registry credential is stored
anywhere.

If the `production` environment has required reviewers configured in GitHub,
deploys wait for approval; the workflow already targets that environment.

## Deploying

```bash
git switch -c prod        # first time only
git push -u origin prod

# after that, every release is:
git switch prod && git merge main && git push
```

`workflow_dispatch` on the Actions tab redeploys the current `prod` commit,
which is what to use after rebuilding the instance.

## What a deploy does

1. Compiles every Python file and validates the compose file. A syntax error
   never reaches the box.
2. Builds `vivid-backend` and `vivid-sandbox` and pushes them to GHCR tagged
   with the commit sha (and `prod` for convenience).
3. Copies `docker-compose.prod.yml` to the box, pulls the new images, and
   restarts the stack.
4. Polls `/v1/health` for up to five minutes.

If the new release never answers, the script prints the backend's last 60 log
lines and **rolls the box back** to the previously deployed sha, which it
records in `/opt/vivid/.deployed_tag`. The job still fails, so a red run means
"production is on the old release", not "production is broken".

## Rolling back by hand

```bash
ssh <user>@<host>
cd /opt/vivid
IMAGE_PREFIX=ghcr.io/worldstreet-web-services IMAGE_TAG=<good-sha> \
  docker compose -f docker-compose.prod.yml up -d
```

Or re-run the workflow on a commit you trust.

## Day to day

```bash
cd /opt/vivid
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
docker compose -f docker-compose.prod.yml exec postgres psql -U vivid vivid
curl -s localhost:8000/v1/health/models | python3 -m json.tool   # RunPod services
```

## Failing over to OpenRouter

When the GPU pods are down, move the models to OpenRouter without touching any
client. In `/opt/vivid/app.env`:

```bash
MODEL_PROVIDER=openrouter
OPENROUTER_API_KEY=sk-or-...
```

then restart the containers that read it:

```bash
cd /opt/vivid
docker compose -f docker-compose.prod.yml up -d backend worker
curl -s localhost:8000/v1/health/models | python3 -m json.tool   # each entry reports its provider
curl -s localhost:8000/v1/health/code | python3 -m json.tool     # tool_calling should be true
```

The first report also carries an `openrouter` entry: the account balance,
`audio_ready` (OpenRouter serves LLM calls on an empty balance but refuses
transcription below $0.50, so voice input needs a top-up even when chat
works), and `key_expires_at` — an outage switch whose key has quietly expired
is no switch at all.

What moves: the chat assistant (and its planner and title generation), the
coding agent behind `/ws/code`, the `/v1` proxy that Vivid Code and the editor
use, speech-to-text and text-to-speech. The `vivid-chat` and `vivid-code`
aliases keep working; only the upstream behind them changes. Conversation
history, prompts and token budgets never left the backend; the history clamp
simply uses the live model's window (`OPENROUTER_*_CONTEXT_TOKENS`) instead of
the pod's. Voice replies still reach the clients as WAV — OpenRouter's PCM is
wrapped in the backend.

What does not move: translation for yo/ig runs on the ASR pod, so those replies
fall back to English (spoken in the fallback voice) while it is down, exactly
as they do today when MADLAD fails. Embeddings and the reranker stay where
they are. And OpenRouter has no Nigerian voice: `hexgrad/kokoro-82m` /
`af_heart` is a clear English voice, not Vivid's. It is an outage mode.

Per-service overrides move one thing at a time: `CODE_LLM_PROVIDER=openrouter`
if only the coding pod died, or `ASR_PROVIDER=runpod TTS_PROVIDER=runpod` on
top of `MODEL_PROVIDER=openrouter` to keep the Nigerian voices while only the
LLM pod is out. Models default to OpenRouter's ids for what the pods serve
(`google/gemma-3-27b-it`, `mistralai/devstral-2512`, `openai/whisper-large-v3`,
`hexgrad/kokoro-82m`); override with the `OPENROUTER_*_MODEL` variables, and
keep `OPENROUTER_TTS_SAMPLE_RATE` in step with the TTS model (24 kHz for the
defaults). A misspelt provider name refuses to start rather than failing on the
first turn. Set `MODEL_PROVIDER=runpod` and restart again to come home.

## The browser service

`vivid-tools` is deployed by hand from its own directory, on its own instance:

```bash
cd vivid-tools           # on that box
docker compose up -d --build
```

Its compose file gives Chromium 3GB, 2 CPUs and a 1GB `/dev/shm` (the Docker
default of 64MB crashes it on media-heavy pages), and binds it to loopback
behind Caddy. Point that box's firewall at the API instance only, and keep
`BROWSER_TOKEN` identical in both `.env` files.

If it is down or `VIVID_TOOLS_URL` is wrong, the backend keeps working: the
`browse` and `browse_page` tools drop out of the tool registry and the model
answers without them.

## Known gaps

- **Backups.** Postgres and MinIO live on docker volumes on one instance. There
  is no snapshot schedule yet; add one before real users depend on this.
- **TLS.** The compose file publishes plain HTTP. Put nginx or Caddy in front,
  or an ALB, and set `BACKEND_BIND=127.0.0.1`.
- **Downtime.** `compose up -d` recreates the API container, so a deploy drops
  connections for a few seconds. One box cannot do zero-downtime without a
  second replica behind a proxy.
