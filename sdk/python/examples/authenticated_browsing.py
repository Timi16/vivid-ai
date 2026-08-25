"""Log in once, reuse the session, then hand it to the managed loop.

    VIVID_API_KEY=vk_... APP_PASSWORD=... python examples/authenticated_browsing.py

The pattern to copy: the developer scripts the credential step, and only once
authentication is established does the model get to drive.
"""
import json
import os
import pathlib

from vivid_ai import Vivid, secret

STATE_FILE = pathlib.Path("session-state.json")
SITE = "example.com"


def load_state() -> dict | None:
    try:
        return json.loads(STATE_FILE.read_text())
    except (OSError, json.JSONDecodeError):
        return None            # first run, or the saved session expired


def main() -> None:
    vivid = Vivid()            # reads VIVID_API_KEY

    # allowed_domains is required whenever the session is authenticated: it
    # holds live cookies, and the controller picks navigation from page text.
    with vivid.browser.session(storage_state=load_state(),
                               allowed_domains=[SITE]) as session:
        session.goto(f"https://{SITE}/app")
        snap = session.snapshot()

        # Still on the login page? Script the credential step ourselves.
        if snap.find_all("Password", kind="input/password"):
            session.type(snap.find("Email"), os.environ["APP_EMAIL"])

            # Re-snapshot: typing changes the page, so earlier refs are stale.
            snap = session.snapshot()
            session.type(snap.find("Password"), secret(os.environ["APP_PASSWORD"]))

            snap = session.snapshot()
            session.click(snap.find("Sign in"))

        # Persist the authenticated state so the next run skips the login.
        # Treat this file as a credential: it is one.
        STATE_FILE.write_text(json.dumps(session.storage_state()))

        # Now the model can drive, inside the session we authenticated.
        task = vivid.browser.run(
            goal="find the total on the most recent invoice",
            session=session, max_steps=10)
        for step in task:
            print(step)

        result = task.result()
        print(f"(ran out of steps) {result.answer}" if result.truncated
              else result.answer)


if __name__ == "__main__":
    main()
