//! Who is calling, and how the engine knows.
//!
//! Vivid Code used to hold a pod address and call it with no credential at
//! all — anyone holding the binary held the whole GPU, and nothing the agent
//! did could be attributed to a person. It talks to the Vivid backend now,
//! which wants a Vivid credential on every request. This module is where that
//! credential is found, and every outbound request goes through
//! [`authorize`].
//!
//! Precedence is `VIVID_TOKEN` first, then `~/.vivid/auth.toml`, so a CI job
//! can hand one in for a single run without disturbing the developer's own
//! login on the same machine.
use anyhow::{anyhow, Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;

const ENV_TOKEN: &str = "VIVID_TOKEN";

#[derive(Serialize, Deserialize, Default)]
struct Stored {
    token: String,
}

fn auth_path() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow!("no home directory to store the login in"))?;
    Ok(home.join(".vivid").join("auth.toml"))
}

fn from_file() -> Option<String> {
    let raw = std::fs::read_to_string(auth_path().ok()?).ok()?;
    let stored: Stored = toml::from_str(&raw).ok()?;
    Some(stored.token).filter(|t| !t.is_empty())
}

/// The credential for this run, or `None` if nobody has signed in.
///
/// Read once: this is consulted on every model call, and the agent makes many
/// per turn.
pub fn token() -> Option<&'static str> {
    static TOKEN: OnceLock<Option<String>> = OnceLock::new();
    TOKEN
        .get_or_init(|| {
            std::env::var(ENV_TOKEN)
                .ok()
                .map(|t| t.trim().to_string())
                .filter(|t| !t.is_empty())
                .or_else(from_file)
        })
        .as_deref()
}

/// Attach the credential, if there is one.
///
/// A missing token is deliberately not an error here. Local deployments run
/// the backend without auth, and failing at the call site with the backend's
/// own 401 says something far more useful than a guess made before sending.
pub fn authorize(req: reqwest::RequestBuilder) -> reqwest::RequestBuilder {
    match token() {
        Some(t) => req.bearer_auth(t),
        None => req,
    }
}

/// A refusal that retrying cannot fix.
///
/// Distinct from every other engine failure because the retry loops treat a
/// bad response as a pod that is still waking up: without a type to recognise,
/// "you are signed out" costs thirty seconds of backoff before it is reported.
#[derive(Debug)]
pub struct AuthError(pub String);

impl std::fmt::Display for AuthError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for AuthError {}

/// True when this error is a rejected credential rather than a flaky hop.
pub fn is_auth_failure(e: &anyhow::Error) -> bool {
    e.downcast_ref::<AuthError>().is_some()
}

/// Turn an authentication failure into the sentence that fixes it.
///
/// The backend's own message ("Invalid API key") is accurate and useless: it
/// does not say that `vivid --login` is the thing to run.
pub fn explain(status: reqwest::StatusCode, body: &str) -> Option<String> {
    if status != reqwest::StatusCode::UNAUTHORIZED && status != reqwest::StatusCode::FORBIDDEN {
        return None;
    }
    Some(if token().is_some() {
        format!(
            "your Vivid login was rejected ({}). Run `vivid --login` with a current key, \
             or unset {ENV_TOKEN} if it is holding a stale one.",
            body.chars().take(200).collect::<String>().trim()
        )
    } else {
        format!("this engine needs a Vivid account. Run `vivid --login` first, or set {ENV_TOKEN}.")
    })
}

/// Store a credential for future runs, and report where it went.
pub fn save(token: &str) -> Result<PathBuf> {
    let token = token.trim();
    if token.is_empty() {
        return Err(anyhow!("no key given"));
    }
    let path = auth_path()?;
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).with_context(|| format!("cannot create {}", dir.display()))?;
    }
    let body = toml::to_string(&Stored { token: token.to_string() })?;
    std::fs::write(&path, body).with_context(|| format!("cannot write {}", path.display()))?;
    restrict(&path);
    Ok(path)
}

/// Forget the stored credential. `false` if there was nothing to forget.
pub fn clear() -> Result<bool> {
    let path = auth_path()?;
    if !path.exists() {
        return Ok(false);
    }
    std::fs::remove_file(&path).with_context(|| format!("cannot remove {}", path.display()))?;
    Ok(true)
}

/// Sign in: take a key, prove it works, then keep it.
///
/// The key is verified against `/auth/me` before being written. Storing an
/// unverified one only moves the failure to the next model call, by which
/// point the user has stopped thinking about logging in.
pub async fn login(base: &str, given: Option<String>) -> Result<()> {
    let key = match given {
        Some(k) => k,
        None => prompt_for_key()?,
    };
    let key = key.trim().to_string();
    if key.is_empty() {
        return Err(anyhow!("no key given"));
    }

    let base = base.trim_end_matches('/');
    let http = reqwest::Client::builder()
        .connect_timeout(std::time::Duration::from_secs(20))
        .timeout(std::time::Duration::from_secs(30))
        .build()?;
    let r = http
        .get(format!("{base}/auth/me"))
        .bearer_auth(&key)
        .send()
        .await
        .with_context(|| format!("cannot reach Vivid at {base}"))?;

    if r.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(anyhow!("that key was rejected. Check it, or mint a new one."));
    }
    if !r.status().is_success() {
        return Err(anyhow!("Vivid answered {} when checking the key", r.status()));
    }

    let who: serde_json::Value = r.json().await.unwrap_or_default();
    let path = save(&key)?;
    let name = who["name"]
        .as_str()
        .filter(|n| !n.is_empty())
        .or_else(|| who["profile_email"].as_str())
        .or_else(|| who["email"].as_str())
        .unwrap_or("your Vivid account");
    crate::ui::info(&format!("signed in as {name} — key stored in {}", path.display()));
    Ok(())
}

pub fn logout() -> Result<()> {
    if clear()? {
        crate::ui::info("signed out of Vivid on this machine");
    } else {
        crate::ui::info("no stored Vivid login to remove");
    }
    if std::env::var(ENV_TOKEN).is_ok() {
        crate::ui::warn(&format!(
            "{ENV_TOKEN} is still set in this shell and takes precedence — unset it too"
        ));
    }
    Ok(())
}

/// Read the key from stdin. Accepts a pipe (`echo vk_… | vivid --login`) as
/// readily as a person typing, because CI has no one to prompt.
fn prompt_for_key() -> Result<String> {
    use std::io::{BufRead, Write};
    let piped = !atty_stdin();
    if !piped {
        print!("  Vivid API key: ");
        std::io::stdout().flush().ok();
    }
    let mut line = String::new();
    std::io::stdin()
        .lock()
        .read_line(&mut line)
        .context("could not read the key")?;
    Ok(line)
}

fn atty_stdin() -> bool {
    // SAFETY: isatty on a borrowed fd; it reads no memory we own.
    unsafe { libc::isatty(libc::STDIN_FILENO) == 1 }
}

/// A long-lived credential is worth the same as a private key: keep it out of
/// other accounts' reach on shared machines. Best-effort — a filesystem that
/// cannot express this (or Windows) is not a reason to refuse the login.
#[cfg(unix)]
fn restrict(path: &PathBuf) {
    use std::os::unix::fs::PermissionsExt;
    let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600));
}

#[cfg(not(unix))]
fn restrict(_path: &PathBuf) {}
