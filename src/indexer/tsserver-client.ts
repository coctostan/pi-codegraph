import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export interface LspLocation {
  file: string;
  line: number;
  col: number;
}

export interface TsServerClientOptions {
  idleMs?: number;
  timeoutMs?: number;
  tsserverPath?: string; // optional test override
}

export interface ITsServerClient {
  definition(file: string, line: number, col: number): Promise<LspLocation | null>;
  references(file: string, line: number, col: number): Promise<LspLocation[]>;
  implementations(file: string, line: number, col: number): Promise<LspLocation[]>;
  shutdown(): Promise<void>;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

export class TsServerClient implements ITsServerClient {
  private proc: ChildProcess | null = null;
  private readonly pending = new Map<number, Pending>();
  private readonly idleMs: number;
  private readonly timeoutMs: number;
  private readonly tsserverPath: string;
  private idleTimer: ReturnType<typeof setTimeout> | null = null;
  private seq = 0;
  private startPromise: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private stdoutBuffer = "";
  private lastSpawnAt = 0;
  private readonly startupGraceMs = 250;

  constructor(private readonly projectRoot: string, options: TsServerClientOptions = {}) {
    this.idleMs = options.idleMs ?? 30_000;
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.tsserverPath = options.tsserverPath ?? this.findTsserver(projectRoot);
  }

  getPid(): number | null {
    return this.proc?.pid ?? null;
  }

  getResolvedTsserverPath(): string {
    return this.tsserverPath;
  }

  getPendingCountForTest(): number {
    return this.pending.size;
  }

  rawRequestForTest<T>(command: string, args: unknown): Promise<T> {
    return this.request<T>(command, args);
  }

  private findTsserver(projectRoot: string): string {
    const local = join(projectRoot, "node_modules", ".bin", process.platform === "win32" ? "tsserver.cmd" : "tsserver");
    if (existsSync(local)) return local;
    return "tsserver";
  }

  private toAbsolute(file: string): string {
    return resolve(this.projectRoot, file);
  }

  private toRelative(file: string): string {
    if (!isAbsolute(file)) return file.split("\\").join("/");
    return relative(this.projectRoot, file).split("\\").join("/");
  }

  private async ensureStarted(): Promise<void> {
    if (this.proc && this.proc.stdin?.writable) return;
    if (this.startPromise) return this.startPromise;

    this.startPromise = new Promise<void>((resolveStart, rejectStart) => {
      const proc = spawn(this.tsserverPath, [], { cwd: this.projectRoot, stdio: ["pipe", "pipe", "pipe"] });
      const onError = () => rejectStart(new Error(`TsServer failed to start: ${this.tsserverPath}`));
      const onSpawn = () => {
        proc.removeListener("error", onError);
        this.proc = proc;
        this.lastSpawnAt = Date.now();
        proc.stdout?.setEncoding("utf8");
        proc.stdout?.on("data", (chunk: string) => this.onStdout(chunk));
        proc.once("exit", () => {
          for (const [, p] of this.pending) {
            clearTimeout(p.timer);
            p.reject(new Error("TsServer process exited unexpectedly"));
          }
          this.pending.clear();
          this.proc = null;
        });
        resolveStart();
      };
      proc.once("error", onError);
      proc.once("spawn", onSpawn);
    }).finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  private onStdout(chunk: string): void {
    this.stdoutBuffer += chunk;
    while (true) {
      const headerEnd = this.stdoutBuffer.indexOf("\r\n\r\n");
      if (headerEnd !== -1) {
        const header = this.stdoutBuffer.slice(0, headerEnd);
        const m = /Content-Length:\s*(\d+)/i.exec(header);
        if (!m) {
          this.stdoutBuffer = this.stdoutBuffer.slice(headerEnd + 4);
          continue;
        }
        const len = Number(m[1]);
        const bodyStart = headerEnd + 4;
        if (this.stdoutBuffer.length < bodyStart + len) return;
        const json = this.stdoutBuffer.slice(bodyStart, bodyStart + len);
        this.stdoutBuffer = this.stdoutBuffer.slice(bodyStart + len);
        this.consumeMessage(json);
        continue;
      }

      const newline = this.stdoutBuffer.indexOf("\n");
      if (newline === -1) return;
      const line = this.stdoutBuffer.slice(0, newline).trim();
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      if (!line) continue;
      this.consumeMessage(line);
    }
  }

  private consumeMessage(raw: string): void {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    if (msg?.type !== "response" || typeof msg.request_seq !== "number") return;
    const p = this.pending.get(msg.request_seq);
    if (!p) return;
    this.pending.delete(msg.request_seq);
    clearTimeout(p.timer);

    if (msg.success) {
      this.resetIdleTimer();
      p.resolve(msg.body);
    } else {
      p.reject(new Error(msg.message ?? "tsserver error"));
    }
  }

  private resetIdleTimer(): void {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => {
      void this.shutdown();
    }, this.idleMs);
  }

  private notify(command: string, args: unknown): void {
    if (!this.proc?.stdin?.writable) return;
    const payload = JSON.stringify({ seq: ++this.seq, type: "request", command, arguments: args });
    this.proc.stdin.write(payload + "\n");
  }

  private request<T>(command: string, args: unknown): Promise<T> {
    const run = async (): Promise<T> => {
      await this.ensureStarted();

      return new Promise<T>((resolveReq, rejectReq) => {
        const seq = ++this.seq;
        const startupGrace = Date.now() - this.lastSpawnAt < this.startupGraceMs ? this.startupGraceMs : 0;
        const timer = setTimeout(() => {
          this.pending.delete(seq);
          rejectReq(new Error(`TsServer request timed out: ${command}`));
        }, this.timeoutMs + startupGrace);
        this.pending.set(seq, {
          resolve: (v) => resolveReq(v as T),
          reject: rejectReq,
          timer,
        });

        const payload = JSON.stringify({ seq, type: "request", command, arguments: args });
        this.proc!.stdin!.write(payload + "\n");
      });
    };

    const next = this.queue.then(run, run);
    this.queue = next.then(() => undefined, () => undefined);
    return next;
  }

  async definition(file: string, line: number, col: number): Promise<LspLocation | null> {
    const absFile = this.toAbsolute(file);
    this.notify("open", { file: absFile });
    const body = await this.request<Array<{ file: string; start: { line: number; offset: number } }>>("definition", {
      file: absFile,
      line,
      offset: col,
    });
    if (!body || body.length === 0) return null;
    const first = body[0]!;
    return { file: this.toRelative(first.file), line: first.start.line, col: first.start.offset };
  }

  async references(file: string, line: number, col: number): Promise<LspLocation[]> {
    const absFile = this.toAbsolute(file);
    this.notify("open", { file: absFile });
    const body = await this.request<{ refs: Array<{ file: string; start: { line: number; offset: number } }> }>("references", {
      file: absFile,
      line,
      offset: col,
    });
    return (body?.refs ?? []).map((r) => ({ file: this.toRelative(r.file), line: r.start.line, col: r.start.offset }));
  }

  async implementations(file: string, line: number, col: number): Promise<LspLocation[]> {
    const absFile = this.toAbsolute(file);
    this.notify("open", { file: absFile });
    const body = await this.request<Array<{ file: string; start: { line: number; offset: number } }>>("implementation", {
      file: absFile,
      line,
      offset: col,
    });
    return (body ?? []).map((r) => ({ file: this.toRelative(r.file), line: r.start.line, col: r.start.offset }));
  }

  async shutdown(): Promise<void> {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }

    if (!this.proc) return;

    try {
      this.proc.stdin?.write(JSON.stringify({ seq: ++this.seq, type: "request", command: "exit", arguments: {} }) + "\n");
    } catch {
      // ignore
    }

    await new Promise<void>((resolveDone) => {
      const timer = setTimeout(() => {
        this.proc?.kill();
        resolveDone();
      }, 1500);
      this.proc?.once("exit", () => {
        clearTimeout(timer);
        resolveDone();
      });
    });

    this.proc = null;
    for (const [, p] of this.pending) clearTimeout(p.timer);
    this.pending.clear();
  }
}
