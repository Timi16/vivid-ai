import * as vscode from "vscode";

/**
 * The Vivid credential this window runs the agent under.
 *
 * The engine binary reads `~/.vivid/auth.toml`, so a developer who has run
 * `vivid --login` in a terminal is already signed in here. This exists for
 * everyone else: signing in from inside the editor, into SecretStorage (the
 * OS keychain) rather than a dotfile, and handed to the child process as
 * `VIVID_TOKEN` — which the binary reads ahead of its own file.
 */
export class Account {
  private static readonly KEY = "vivid.token";

  /** The endpoint a key is checked against, and the agent later talks to. */
  static readonly DEFAULT_URL = "http://localhost:8000/v1";

  constructor(
    private readonly secrets: vscode.SecretStorage,
    private readonly output: vscode.OutputChannel,
  ) {}

  static endpoint(): string {
    const configured = vscode.workspace.getConfiguration("vivid").get<string>("engineUrl");
    return (configured || Account.DEFAULT_URL).replace(/\/+$/, "");
  }

  token(): Thenable<string | undefined> {
    return this.secrets.get(Account.KEY);
  }

  async signedIn(): Promise<boolean> {
    // The env var is the CI path and outranks stored state, exactly as it does
    // in the binary; a window started with one is signed in whatever the
    // keychain holds.
    return Boolean(process.env.VIVID_TOKEN || (await this.token()));
  }

  /**
   * Ask for a key, check it, keep it. Returns false if the user backed out or
   * the key was refused — callers use that to avoid starting an engine that
   * would only fail on its first call.
   */
  async signIn(): Promise<boolean> {
    const endpoint = Account.endpoint();
    const key = await vscode.window.showInputBox({
      title: "Sign in with Vivid",
      prompt: `Paste a Vivid API key. It is checked against ${endpoint} and stored in your keychain.`,
      placeHolder: "vk_…",
      password: true,
      ignoreFocusOut: true,
    });
    if (!key) return false;

    const who = await this.verify(endpoint, key.trim());
    if (!who) return false;

    await this.secrets.store(Account.KEY, key.trim());
    vscode.window.showInformationMessage(`Signed in to Vivid as ${who}.`);
    return true;
  }

  async signOut(): Promise<void> {
    await this.secrets.delete(Account.KEY);
    if (process.env.VIVID_TOKEN) {
      // Deleting the stored key would look like it did nothing otherwise: the
      // env var still signs every request this window makes.
      vscode.window.showWarningMessage(
        "Signed out, but VIVID_TOKEN is set in this window's environment and still applies. " +
        "Restart VS Code from a shell without it to take effect.");
      return;
    }
    vscode.window.showInformationMessage("Signed out of Vivid.");
  }

  /** The account a key belongs to, or undefined if it is not a valid one. */
  private async verify(endpoint: string, key: string): Promise<string | undefined> {
    try {
      const r = await fetch(`${endpoint}/auth/me`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (r.status === 401) {
        vscode.window.showErrorMessage("That key was rejected. Check it, or mint a new one.");
        return undefined;
      }
      if (!r.ok) {
        vscode.window.showErrorMessage(`Vivid answered ${r.status} when checking the key.`);
        return undefined;
      }
      const who = (await r.json()) as { name?: string; profile_email?: string; email?: string };
      return who.name || who.profile_email || who.email || "your Vivid account";
    } catch (e) {
      // Almost always the backend not running, which is worth saying plainly:
      // the endpoint defaults to localhost.
      this.output.appendLine(`sign-in check failed: ${e}`);
      vscode.window.showErrorMessage(
        `Could not reach Vivid at ${endpoint}. Is the backend running, or should vivid.engineUrl point elsewhere?`);
      return undefined;
    }
  }
}
