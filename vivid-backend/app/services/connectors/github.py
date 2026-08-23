"""GitHub connector.

Two modes:
- authenticated (personal access token): private + public data via /user
- public (just a username): that account's public data, no token needed

Every tool returns a compact text observation for the prompt.
"""
import base64

from app.services.models_gateway import http
from app.services.tools import Tool

API = "https://api.github.com"


def _headers(token: str) -> dict:
    h = {"Accept": "application/vnd.github+json",
         "User-Agent": "VividAI-connector",
         "X-GitHub-Api-Version": "2022-11-28"}
    if token:
        h["Authorization"] = f"Bearer {token}"
    return h


async def _get(token: str, path: str, params: dict | None = None):
    r = await http.client().get(f"{API}{path}", params=params,
                                headers=_headers(token), timeout=20)
    r.raise_for_status()
    return r.json()


async def verify(token: str, config: dict) -> dict:
    """Returns {"login", "name", "mode", "config"} or raises."""
    if token:
        user = await _get(token, "/user")
        login = user["login"]
        mode = "authenticated"
    else:
        login = (config or {}).get("username") or ""
        if not login:
            raise ValueError("public mode needs a username")
        user = await _get("", f"/users/{login}")
        login = user["login"]
        mode = "public"
    return {"login": login, "name": user.get("name") or login,
            "mode": mode, "config": {"username": login, "mode": mode}}


def build_tools(connector) -> dict[str, Tool]:
    token = connector.token or ""
    cfg = connector.config_json or {}
    login = cfg.get("username", "")

    def _full_repo(repo: str) -> str:
        repo = repo.strip().strip("/")
        return repo if "/" in repo else f"{login}/{repo}"

    async def repos(args: dict) -> str:
        if token:
            items = await _get(token, "/user/repos",
                               {"sort": "pushed", "per_page": 15,
                                "affiliation": "owner"})
        else:
            items = await _get("", f"/users/{login}/repos",
                               {"sort": "pushed", "per_page": 15})
        if not items:
            return "no repositories found"
        lines = []
        for r in items:
            priv = " (private)" if r.get("private") else ""
            desc = f" — {r['description'][:60]}" if r.get("description") else ""
            lines.append(f"- {r['full_name']}{priv} ⭐{r['stargazers_count']} "
                         f"[{r.get('language') or '—'}] "
                         f"pushed {r['pushed_at'][:10]}{desc}")
        return f"GitHub repositories for {login} (most recently pushed first):\n" + "\n".join(lines)

    async def issues(args: dict) -> str:
        repo = _full_repo(str(args.get("repo", "")))
        if not repo or repo == login:
            return "error: which repo? pass repo (e.g. owner/name)"
        items = await _get(token, f"/repos/{repo}/issues",
                           {"state": str(args.get("state", "open")),
                            "per_page": 10})
        if not items:
            return f"no open issues or PRs in {repo}"
        lines = [f"- #{i['number']} {'[PR] ' if 'pull_request' in i else ''}"
                 f"{i['title'][:80]} (by {i['user']['login']}, {i['state']})"
                 for i in items]
        return f"Issues/PRs in {repo}:\n" + "\n".join(lines)

    async def read_file(args: dict) -> str:
        repo = _full_repo(str(args.get("repo", "")))
        path = str(args.get("path", "")).lstrip("/")
        if not repo or not path:
            return "error: pass repo and path"
        data = await _get(token, f"/repos/{repo}/contents/{path}")
        if isinstance(data, list):
            names = ", ".join(x["name"] for x in data[:40])
            return f"{path} in {repo} is a directory: {names}"
        content = base64.b64decode(data.get("content", "")).decode(errors="replace")
        return f"{repo}/{path}:\n{content[:3000]}"

    label = f"({login}, {'private+public' if token else 'public only'})"
    tools = {
        "github_repos": Tool(
            name="github_repos", fn=repos, args="",
            desc=f"list the user's GitHub repositories {label}",
            status="Checking GitHub…"),
        "github_issues": Tool(
            name="github_issues", fn=issues, args="repo, state",
            desc="list open issues and pull requests in one of the user's GitHub repos",
            status="Checking GitHub issues…"),
        "github_file": Tool(
            name="github_file", fn=read_file, args="repo, path",
            desc="read a file (or list a directory) from one of the user's GitHub repos",
            status="Reading from GitHub…"),
    }

    if token:
        async def search_code(args: dict) -> str:
            q = str(args.get("query", ""))
            repo = str(args.get("repo", "")).strip()
            if repo:
                q += f" repo:{_full_repo(repo)}"
            data = await _get(token, "/search/code", {"q": q, "per_page": 8})
            items = data.get("items") or []
            if not items:
                return f"no code matches for '{q}'"
            lines = [f"- {i['repository']['full_name']}/{i['path']}" for i in items]
            return f"Code matches for '{q}':\n" + "\n".join(lines)

        tools["github_search_code"] = Tool(
            name="github_search_code", fn=search_code, args="query, repo",
            desc="search code across the user's GitHub repositories",
            status="Searching GitHub code…")

    return tools
