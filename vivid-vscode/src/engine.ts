import * as cp from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

import { Account } from "./account";

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
  /** In flight while the credential is being fetched, so two prompts arriving
   * together start one engine rather than racing to write to a missing pipe. */
  private starting: Promise<void> | undefined;
  private readonly onEventEmitter = new vscode.EventEmitter<Event>();
  readonly onEvent = this.onEventEmitter.event;

  constructor(
    private readonly cwd: string,
    private readonly output: vscode.OutputChannel,
    private readonly extensionPath: string,
    private readonly account: Account,
  ) {}

  /**
   * Where the engine binary is.
   *
   * An explicit setting always wins. Otherwise, before falling back to PATH,
   * look for the sibling cargo build — in this repo the extension and the Rust
   * crate live next to each other, and `cargo build --release` is the only
   * thing anyone does to get a binary. Finding it means a fresh clone runs
   * with no configuration at all.
   */
  private resolveBinary(configured: string): string {
    if (configured && configured !== "vivid") {
      return configured;
    }
    const sibling = path.resolve(
      this.extensionPath, "..", "vivid-code", "target", "release", "vivid");
    if (fs.existsSync(sibling)) {
      this.output.appendLine(`using the sibling build at ${sibling}`);
      return sibling;
    }
    return "vivid";
  }

  get running(): boolean {
    return this.proc !== undefined && this.proc.exitCode === null;
  }

  start(): Promise<void> {
    if (this.running) return Promise.resolve();
    if (this.starting) return this.starting;
    this.starting = this.launch().finally(() => { this.starting = undefined; });
    return this.starting;
  }

  private async launch(): Promise<void> {
    const token = await this.account.token();
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
        // The key goes in the environment rather than on the command line:
        // argv is world-readable in `ps`, and this is a long-lived credential.
        // A key stored here wins over the binary's own ~/.vivid/auth.toml,
        // which is what makes signing in from the editor mean anything.
        env: token ? { ...process.env, VIVID_TOKEN: token } : { ...process.env },
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

  async prompt(text: string): Promise<void> {
    if (!this.running) await this.start();
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
