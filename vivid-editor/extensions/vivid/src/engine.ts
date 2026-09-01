import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

/** One event line from `vivid --json` on stdout. */
export interface Event {
  type: string;
  [k: string]: any;
}

/**
 * Owns the `vivid --json` child process and the NDJSON protocol on its pipes.
 *
 * stdout is the protocol and stderr is not, so panics and tracing from the
 * binary surface as diagnostics instead of corrupting the event stream.
 */
export class Engine implements vscode.Disposable {
  private proc: cp.ChildProcessWithoutNullStreams | undefined;
  private buffer = "";
  private readonly onEventEmitter = new vscode.EventEmitter<Event>();
  readonly onEvent = this.onEventEmitter.event;

  constructor(
    private readonly cwd: string,
    private readonly output: vscode.OutputChannel,
    private readonly extensionPath: string,
  ) {}

  /**
   * Where the engine binary is.
   *
   * An explicit setting always wins. Otherwise, before falling back to PATH,
   * look for a cargo build in the repo, so a fresh clone runs with no
   * configuration at all. Two layouts are checked because this extension is
   * built both ways: standalone next to the crate, and as a built-in inside
   * the editor fork, where it sits two directories deeper. A packaged app
   * matches neither and falls through to PATH, which is where `cargo install`
   * puts it.
   */
  private resolveBinary(configured: string): string {
    if (configured && configured !== "vivid") {
      return configured;
    }
    const built = path.join("vivid-code", "target", "release", "vivid");
    const candidates = [
      path.resolve(this.extensionPath, "..", built),
      path.resolve(this.extensionPath, "..", "..", "..", built),
    ];
    for (const candidate of candidates) {
      if (fs.existsSync(candidate)) {
        this.output.appendLine(`using the repo build at ${candidate}`);
        return candidate;
      }
    }
    return "vivid";
  }

  get running(): boolean {
    return this.proc !== undefined && this.proc.exitCode === null;
  }

  start(): void {
    if (this.running) return;

    const cfg = vscode.workspace.getConfiguration("vivid");
    const bin = this.resolveBinary(cfg.get<string>("binaryPath") || "vivid");
    const args = ["--json", "--dir", this.cwd,
                  "--max-iter", String(cfg.get<number>("maxIterations") ?? 60)];
    const url = cfg.get<string>("engineUrl");
    const model = cfg.get<string>("model");
    if (url) args.push("--url", url);
    if (model) args.push("--model", model);
    if (cfg.get<boolean>("noDesign")) args.push("--no-design");
    // Never pass --yolo. Approval is the extension's job: the binary would
    // otherwise run shell commands with nobody asked.

    this.output.appendLine(`$ ${bin} ${args.join(" ")}`);
    try {
      this.proc = cp.spawn(bin, args, {
        cwd: this.cwd,
        env: { ...process.env },
      });
    } catch (e) {
      this.fail(`could not start ${bin}: ${e}`);
      return;
    }

    this.proc.stdout.setEncoding("utf8");
    this.proc.stdout.on("data", (chunk: string) => this.consume(chunk));
    this.proc.stderr.setEncoding("utf8");
    this.proc.stderr.on("data", (chunk: string) => this.output.append(chunk));

    this.proc.on("error", (e) => {
      // ENOENT here is the common first-run failure: the binary is not built
      // or not on PATH. Say that plainly rather than surfacing errno.
      const msg = (e as NodeJS.ErrnoException).code === "ENOENT"
        ? `\`${bin}\` was not found. Build it with \`cargo build --release\` in vivid-code/, ` +
          `or set vivid.binaryPath to an existing binary.`
        : `engine error: ${e.message}`;
      this.fail(msg);
    });

    this.proc.on("exit", (code, signal) => {
      this.output.appendLine(`engine exited (code ${code}, signal ${signal})`);
      this.onEventEmitter.fire({
        type: "exit",
        code,
        message: code === 0 ? "The engine stopped." : `The engine stopped (exit ${code}). See the Vivid Code output channel.`,
      });
      this.proc = undefined;
    });
  }

  /** Split the stream on newlines; a chunk can end mid-line, or hold several. */
  private consume(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf("\n")) !== -1) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) continue;
      let ev: Event;
      try {
        ev = JSON.parse(line);
      } catch {
        // Not protocol — most likely the binary printed something raw.
        this.output.appendLine(`[unparsed] ${line}`);
        continue;
      }
      this.onEventEmitter.fire(ev);
    }
  }

  private send(frame: object): void {
    if (!this.proc || !this.running) return;
    this.proc.stdin.write(JSON.stringify(frame) + "\n");
  }

  prompt(text: string): void {
    if (!this.running) this.start();
    this.send({ type: "prompt", text });
  }

  approve(id: number, ok: boolean): void {
    this.send({ type: "approval", id, ok });
  }

  cancel(): void {
    this.send({ type: "cancel" });
  }

  private fail(message: string): void {
    this.output.appendLine(message);
    this.onEventEmitter.fire({ type: "error", code: "engine", message });
  }

  dispose(): void {
    if (this.proc) {
      this.send({ type: "quit" });
      // Give it a moment to exit cleanly; a dev server it started is torn
      // down in its own shutdown path, which SIGKILL would skip.
      const proc = this.proc;
      setTimeout(() => proc.kill(), 1000);
      this.proc = undefined;
    }
    this.onEventEmitter.dispose();
  }
}
