# Deploying vivid-backend to EC2

`.github/workflows/vivid-backend.yml` is the pipeline. On a push to `main` that
touches the backend it runs the test suite, builds three images, pushes them to
GHCR, and rolls them out on the instance over SSH. The instance only ever
pulls: nothing is compiled on the box that is also serving traffic.

```
push to main ──▶ test ──▶ build+push images ──▶ ssh deploy ──▶ /v1/health
                (pytest)   backend, sandbox,     pull, up -d      │
                           vivid-tools → GHCR                     └─ unhealthy? roll back
```

Pull requests run the tests and build the images without pushing them, so a
broken Dockerfile fails review rather than a deploy.

## Why three images

The pipeline is for the backend, but the backend cannot start alone: compose
gates it on a healthy `sandbox` (code execution) and the browse tools call
`vivid-tools` (Playwright). Both are built and tagged with the same commit SHA,
so the whole stack moves together and one tag describes the deployment.

## GitHub secrets

Set these under Settings → Secrets and variables → Actions. `GITHUB_TOKEN` is
provided automatically and is what both the workflow and the instance use to
reach GHCR, so no long-lived registry credential is needed anywhere.

| Secret | Required | What it is |
| --- | --- | --- |
| `EC2_HOST` | yes | Public IP or DNS name of the instance |
| `EC2_USER` | yes | SSH user (`ubuntu` on Ubuntu AMIs, `ec2-user` on Amazon Linux) |
| `EC2_SSH_KEY` | yes | Private half of the deploy keypair, whole PEM including header and footer |
| `EC2_KNOWN_HOSTS` | recommended | `ssh-keyscan` output for the host. Without it the job falls back to trust-on-first-use and warns |
| `EC2_SSH_PORT` | no | Defaults to 22 |

The deploy job targets a `production` GitHub environment. Add required
reviewers there if you want deploys to pause for approval.

## One-time instance setup

Sizing: the Playwright image and its browser contexts dominate. `vivid-tools`
allows 8 concurrent contexts at 150-250MB each, and Postgres, Redis, MinIO,
the backend and the worker sit alongside. **t3.medium (4GB) is the floor,
t3.large (8GB) is comfortable.** Give it at least 30GB of EBS: the Playwright
image alone is about 2GB, and the deploy keeps a week of old images so a
rollback target stays on disk.

Security group: 80 and 443 open, 22 restricted to your own address (or use SSM
Session Manager and skip 22 entirely).

**1. Install Docker and the compose plugin.**

```bash
# Ubuntu 22.04/24.04
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && exit   # log back in for the group to apply
```

```bash
# Amazon Linux 2023
sudo dnf install -y docker docker-compose-plugin
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER" && exit
```

**2. Create the deploy directory.**

```bash
sudo mkdir -p /opt/vivid && sudo chown "$USER:$USER" /opt/vivid
```

**3. Add the deploy key.** On your machine:

```bash
ssh-keygen -t ed25519 -C "github-actions-vivid" -f ~/.ssh/vivid_deploy -N ""
ssh-copy-id -i ~/.ssh/vivid_deploy.pub <user>@<host>
cat ~/.ssh/vivid_deploy        # → EC2_SSH_KEY secret
ssh-keyscan -H <host>          # → EC2_KNOWN_HOSTS secret
```

**4. Write the two env files.** They are not in git and the pipeline never
touches them, so adding a new setting means editing the instance.

```bash
# /opt/vivid/.env      — compose interpolation (see env.example)
# /opt/vivid/app.env   — backend runtime config (see app.env.example)
chmod 600 /opt/vivid/.env /opt/vivid/app.env
```

Two details that will bite otherwise:

- `CORS_ORIGINS` in `app.env` is parsed as JSON, because pydantic-settings
  treats list fields that way. `["https://app.example.com"]` starts;
  `https://app.example.com` fails at boot.
- `JWT_SECRET` must be set. Its default in `app/core/config.py` is
  `change-me-in-prod`, which is public and would sign perfectly valid tokens.
  `deploy.sh` refuses to run without `app.env` for exactly this reason.

**5. Point DNS at the instance before the first deploy.** Caddy requests a
certificate for `DOMAIN` on startup, and issuance fails without an A record.
If you are using the storage host in the Caddyfile, `storage.<domain>` needs
its own record.

No domain yet? Delete the `caddy` service from `docker-compose.prod.yml`, set
`BACKEND_BIND=0.0.0.0`, and reach the backend on `:8000` over plain HTTP. Note
that a browser on an HTTPS page will refuse the `ws://` chat connection.

**6. Push to main.** The first run creates the GHCR packages and deploys.

## Deploying onto a VPS that already runs Caddy

The default setup assumes a dedicated box. If the target already terminates
TLS for other sites — as `tsionark.io` does for `neutv` and friends — its
Caddy owns :80 and :443 and the bundled one must stay out of the way. It
does: `caddy` sits behind the `edge` compose profile, so a plain
`docker compose up -d` (which is what `deploy.sh` runs) never starts it.

**1. Check the ports are free.** The stack binds `8000` (backend) and `9000`
(MinIO) on loopback. Postgres and Redis are not published at all, so they
cannot collide with anything the host already runs.

```bash
sudo ss -lntp | grep -E ':(8000|9000)\b' || echo "both free"
```

**2. Add the DNS records.** Both names need an A record pointing at the VPS
*before* the first reload, or certificate issuance fails:

```
vivid.tsionark.io           A   <vps ip>
storage.vivid.tsionark.io   A   <vps ip>
```

The second is not optional while MinIO is the object store. Presigned URLs
are signed over the host and path, so MinIO cannot be served under a path
prefix on the first name — the signature would not match and every
attachment would 403.

**3. Set the two env files** as in the one-time setup above, with:

```
BACKEND_BIND=127.0.0.1
MINIO_BIND=127.0.0.1
DOMAIN=                                                  # unused here
S3_PUBLIC_ENDPOINT_URL=https://storage.vivid.tsionark.io
```

and `CORS_ORIGINS` in `app.env` listing whatever origin the frontend serves
from — remembering it is parsed as JSON.

**4. Append `deploy/Caddyfile.host` to `/etc/caddy/Caddyfile`**, then:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile   # never reload unvalidated
sudo systemctl reload caddy
```

**5. Deploy as normal.** The GitHub workflow is unchanged; point `EC2_HOST` at
this VPS.

### Sizing

Worth checking before you commit to this box. The stack wants **4GB free as a
floor and 8GB to be comfortable**, and `vivid-tools` dominates: Playwright
allows 8 concurrent browser contexts at 150-250MB each, on top of Postgres,
Redis, MinIO, the backend, the worker and the sandbox. A VPS already running
MediaMTX and two or three app servers may not have that headroom.

```bash
free -h && docker stats --no-stream
```

If it is tight, the honest fix is a second box for the model-adjacent
services rather than shaving Playwright's pool down until browsing breaks.

## Rollback

Tags are commit SHAs. Actions → vivid-backend → Run workflow, and give the SHA
you want in `image_tag`: the test and build jobs are skipped and that tag is
redeployed straight away.

A deploy that fails its health check rolls itself back. `deploy.sh` records the
serving tag in `/opt/vivid/.image_tag`, restores it if the new image does not
answer `/v1/health` within 90 seconds, and still exits non-zero so the run goes
red.

## Operating the instance

```bash
cd /opt/vivid
cat .image_tag                                          # what is serving
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f backend
IMAGE_REPO=ghcr.io/<owner>/<repo> ./deploy.sh "$(cat .image_tag)"   # restart in place
curl -s localhost:8000/v1/health/models | python3 -m json.tool      # RunPod reachability
```

## Known limits

- **Schema changes.** There is no migration step, by design: `init_db()` runs
  at startup and is idempotent. But `create_all` never alters an existing
  table, so a new column on an existing model needs an explicit
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` in `db/session.py`, which is the
  pattern already there. Adding a field to a model and deploying is not enough.
- **Single instance, brief downtime.** `compose up -d` replaces containers in
  place, so there are a few seconds where the backend is not answering. Fine
  for one box. Real zero-downtime needs a load balancer and two instances.
- **Postgres and MinIO are on the instance.** Data lives in Docker volumes on
  one EBS disk, backed up by nothing. Before this carries anything you care
  about, move to RDS and S3, or at minimum schedule EBS snapshots.
- **Registry auth expires with the job.** The instance logs in to GHCR with the
  workflow's short-lived token, so it cannot pull on its own afterwards.
  `restart: unless-stopped` means a reboot restarts the images already on disk,
  which covers the normal case. If you need the box to pull unattended, make
  the packages public or leave a read-only PAT in its docker config.
