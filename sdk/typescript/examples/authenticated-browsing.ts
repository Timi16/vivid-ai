/**
 * Log in once, reuse the session, then hand it to the managed loop.
 *
 *   VIVID_API_KEY=vk_... APP_PASSWORD=... npx tsx examples/authenticated-browsing.ts
 *
 * The pattern to copy: the developer scripts the credential step, and only
 * once authentication is established does the model get to drive.
 */
import { readFile, writeFile } from "node:fs/promises";

import { Vivid, formatStep, secret } from "../src/index.js";

const STATE_FILE = "session-state.json";
const SITE = "example.com";

async function loadState(): Promise<Record<string, unknown> | undefined> {
  try {
    return JSON.parse(await readFile(STATE_FILE, "utf8"));
  } catch {
    return undefined; // first run, or the saved session expired
  }
}

async function main(): Promise<void> {
  const vivid = new Vivid(); // reads VIVID_API_KEY

  // allowedDomains is required whenever the session is authenticated: it holds
  // live cookies, and the controller picks navigation from page text.
  const session = await vivid.browser.session({
    storageState: await loadState(),
    allowedDomains: [SITE],
  });

  try {
    await session.goto(`https://${SITE}/app`);
    let snap = await session.snapshot();

    // Still on the login page? Script the credential step ourselves.
    const needsLogin = snap.findAll("Password", { kind: "input/password" }).length > 0;
    if (needsLogin) {
      await session.type(snap.find("Email"), process.env.APP_EMAIL!);

      // Re-snapshot: typing changes the page, so the earlier refs are stale.
      snap = await session.snapshot();
      await session.type(snap.find("Password"), secret(process.env.APP_PASSWORD!));

      snap = await session.snapshot();
      await session.click(snap.find("Sign in"));
    }

    // Persist the authenticated state so the next run skips the login. Treat
    // this file as a credential: it is one.
    await writeFile(STATE_FILE, JSON.stringify(await session.storageState()));

    // Now the model can drive, inside the session we authenticated.
    const task = vivid.browser.run({
      goal: "find the total on the most recent invoice",
      session,
      maxSteps: 10,
    });
    for await (const step of task) console.log(formatStep(step));

    const { answer, truncated } = await task.result();
    console.log(truncated ? `(ran out of steps) ${answer}` : answer);
  } finally {
    await session.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
