import * as vscode from "vscode";
import { Engine, Event } from "./engine";

/**
 * Serves the "before" side of a diff so VS Code can show a real diff editor.
 *
 * The agent has already written the file by the time the diff event arrives,
 * so the old text exists nowhere on disk. It is held here, keyed by the URI
 * the diff command opens.
 */
class BeforeProvider implements vscode.TextDocumentContentProvider {
  static readonly scheme = "vivid-before";
  private readonly contents = new Map<string, string>();
  private readonly changed = new vscode.EventEmitter<vscode.Uri>();
  readonly onDidChange = this.changed.event;

  put(path: string, seq: number, text: string): vscode.Uri {
    const uri = vscode.Uri.parse(`${BeforeProvider.scheme}:${path}?${seq}`);
    this.contents.set(uri.toString(), text);
    this.changed.fire(uri);
    return uri;
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return this.contents.get(uri.toString()) ?? "";
  }
}

export function activate(context: vscode.ExtensionContext) {
  const folder = vscode.workspace.workspaceFolders?.[0];
  const output = vscode.window.createOutputChannel("Vivid Code");
  const before = new BeforeProvider();

  context.subscriptions.push(
    output,
    vscode.workspace.registerTextDocumentContentProvider(BeforeProvider.scheme, before),
  );

  if (!folder) {
    // Nothing to point the agent at. Registering the view anyway would give
    // the user a panel whose every action fails.
    output.appendLine("Vivid Code needs an open folder.");
    return;
  }

  const engine = new Engine(folder.uri.fsPath, output, context.extensionPath);
  const provider = new AgentView(context.extensionUri, engine, before, output);
  context.subscriptions.push(
    engine,
    vscode.window.registerWebviewViewProvider("vivid.agent", provider),
    vscode.commands.registerCommand("vivid.focus", () =>
      vscode.commands.executeCommand("vivid.agent.focus")),
    vscode.commands.registerCommand("vivid.cancel", () => engine.cancel()),
    vscode.commands.registerCommand("vivid.restart", () => provider.restart()),
    vscode.commands.registerCommand("vivid.askAboutSelection", async () => {
      const ed = vscode.window.activeTextEditor;
      if (!ed || ed.selection.isEmpty) return;
      const rel = vscode.workspace.asRelativePath(ed.document.uri);
      const start = ed.selection.start.line + 1;
      const end = ed.selection.end.line + 1;
      await vscode.commands.executeCommand("vivid.agent.focus");
      provider.seed(`In ${rel} lines ${start}-${end}:\n\n` +
                    "```\n" + ed.document.getText(ed.selection) + "\n```\n\n");
    }),
  );
}

class AgentView implements vscode.WebviewViewProvider {
  private view: vscode.WebviewView | undefined;
  private diffSeq = 0;
  private started = false;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly engine: Engine,
    private readonly before: BeforeProvider,
    private readonly output: vscode.OutputChannel,
  ) {
    this.engine.onEvent((ev) => this.handle(ev));
  }

  resolveWebviewView(view: vscode.WebviewView) {
    this.view = view;
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.extensionUri, "media")],
    };
    view.webview.html = this.html(view.webview);

    view.webview.onDidReceiveMessage((m) => {
      switch (m.type) {
        case "prompt":
          this.engine.prompt(m.text);
          break;
        case "approval":
          this.engine.approve(m.id, m.ok);
          break;
        case "cancel":
          this.engine.cancel();
          break;
        case "openDiff":
          this.openDiff(m.path, m.seq);
          break;
      }
    });

    if (!this.started) {
      this.started = true;
      this.engine.start();
    }
  }

  restart() {
    this.engine.dispose();
    this.post({ type: "info", message: "Restarting the engine…" });
    setTimeout(() => this.engine.start(), 1200);
  }

  seed(text: string) {
    this.post({ type: "seed", text });
  }

  private readonly diffs = new Map<number, { path: string; uri: vscode.Uri }>();

  private handle(ev: Event) {
    if (ev.type === "diff") {
      // Stash both sides now; the user may click through to the diff later.
      const seq = ++this.diffSeq;
      const uri = this.before.put(ev.path, seq, ev.old ?? "");
      this.diffs.set(seq, { path: ev.path, uri });
      const oldLines = (ev.old ?? "").split("\n").length;
      const newLines = (ev.new ?? "").split("\n").length;
      this.post({ type: "diff", path: ev.path, seq, delta: newLines - oldLines });
      return;
    }

    if (ev.type === "approval_request") {
      const auto = vscode.workspace.getConfiguration("vivid").get<boolean>("autoApprove");
      if (auto) {
        this.engine.approve(ev.id, true);
        this.post({ type: "info", message: `auto-approved: ${ev.question}` });
        return;
      }
      // An approval the user cannot see is an approval they cannot give, and
      // the engine blocks until one arrives.
      this.view?.show?.(true);
    }

    this.post(ev);
  }

  private async openDiff(path: string, seq: number) {
    const entry = this.diffs.get(seq);
    const folder = vscode.workspace.workspaceFolders?.[0];
    if (!entry || !folder) return;
    const after = vscode.Uri.joinPath(folder.uri, path);
    await vscode.commands.executeCommand(
      "vscode.diff", entry.uri, after, `${path} — Vivid Code`);
  }

  private post(message: object) {
    this.view?.webview.postMessage(message);
  }

  private html(webview: vscode.Webview): string {
    const uri = (f: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, "media", f));
    const nonce = String(Math.random()).slice(2);
    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none';
  style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
<link rel="stylesheet" href="${uri("main.css")}">
</head>
<body>
  <div id="log" role="log" aria-live="polite"></div>
  <div id="composer">
    <textarea id="input" rows="2" placeholder="Ask Vivid to build or change something…"></textarea>
    <div class="row">
      <button id="send">Send</button>
      <button id="cancel" class="ghost">Cancel</button>
    </div>
  </div>
  <script nonce="${nonce}" src="${uri("main.js")}"></script>
</body>
</html>`;
  }
}

export function deactivate() {}
