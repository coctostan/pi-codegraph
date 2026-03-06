---
id: 1
title: Add TsServerClient request API and lifecycle
status: approved
depends_on: []
no_test: false
files_to_modify: []
files_to_create:
  - src/indexer/tsserver-client.ts
  - test/tsserver-client.test.ts
---

### Task 1: Add `TsServerClient` request API and lifecycle
- Create: `src/indexer/tsserver-client.ts`
- Create: `test/tsserver-client.test.ts`
This task is focused on client lifecycle + transport semantics only (one test file, one implementation file).
It covers: constructor shape, local/global tsserver lookup, queueing, timeouts, crash handling, idle shutdown, respawn, and `shutdown()` cleanup.

---

#### Step 1 — Test (RED)

Create `test/tsserver-client.test.ts`:

```typescript
import { expect, test, beforeEach, afterEach } from "bun:test";
import { mkdirSync, rmSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TsServerClient } from "../src/indexer/tsserver-client.js";
let fakeTsserverPath: string;
let projectRoot: string;

function createProjectFixture(): string {
  const root = join(tmpdir(), `pi-cg-tsserver-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "tsconfig.json"), JSON.stringify({ compilerOptions: { strict: true }, include: ["src/**/*.ts"] }));
  writeFileSync(join(root, "src", "api.ts"), "export function shared(): number { return 42; }\nexport interface IWorker { run(): void; }\n");
  writeFileSync(join(root, "src", "impl.ts"), 'import { shared, IWorker } from "./api";\nexport class Worker implements IWorker {\n  run(): void {\n    shared();\n  }\n}\n');
  return root;
}

function installFakeTsserver(root: string): string {
  const binDir = join(root, "node_modules", ".bin");
  mkdirSync(binDir, { recursive: true });
  const tsserverBin = join(binDir, process.platform === "win32" ? "tsserver.cmd" : "tsserver");

  const fakeServerJsPath = join(root, ".fake-tsserver.js");
  const fakeServerJs = [
    "#!/usr/bin/env node",
    "let inFlight = 0;",
    "let maxInFlight = 0;",
    "function send(msg){ process.stdout.write(JSON.stringify(msg) + '\\n'); }",
    "process.stdin.setEncoding('utf8');",
    "let buffer = '';",
    "process.stdin.on('data', (chunk) => {",
    "  buffer += chunk;",
    "  while (true) {",
    "    const nl = buffer.indexOf('\\n');",
    "    if (nl === -1) break;",
    "    const line = buffer.slice(0, nl).trim();",
    "    buffer = buffer.slice(nl + 1);",
    "    if (!line) continue;",
    "    let msg; try { msg = JSON.parse(line); } catch { continue; }",
    "    if (msg.command === 'open') continue;",
    "    if (msg.command === 'exit') process.exit(0);",
    "    inFlight++; if (inFlight > maxInFlight) maxInFlight = inFlight;",
    "    if (msg.command === 'slowDefinition') continue;",
    "    setTimeout(() => {",
    "      inFlight--;",
    "      if (msg.command === 'definition') send({ type: 'response', request_seq: msg.seq, success: true, body: [{ file: 'src/api.ts', start: { line: 1, offset: 17 } }] });",
    "      else if (msg.command === 'references') send({ type: 'response', request_seq: msg.seq, success: true, body: { refs: [{ file: 'src/impl.ts', start: { line: 4, offset: 5 } }] } });",
    "      else if (msg.command === 'implementation') send({ type: 'response', request_seq: msg.seq, success: true, body: [{ file: 'src/impl.ts', start: { line: 2, offset: 14 } }] });",
    "      else if (msg.command === 'debugMaxInFlight') send({ type: 'response', request_seq: msg.seq, success: true, body: { maxInFlight } });",
    "      else send({ type: 'response', request_seq: msg.seq, success: false, message: 'unknown command' });",
    "    }, 30);",
    "  }",
    "});",
  ].join("\n");

  writeFileSync(fakeServerJsPath, fakeServerJs);

  if (process.platform === "win32") {
    writeFileSync(tsserverBin, `@echo off\nnode "${fakeServerJsPath}"\n`);
  } else {
    writeFileSync(tsserverBin, `#!/usr/bin/env bash\nnode "${fakeServerJsPath}"\n`);
    chmodSync(tsserverBin, 0o755);
  }

  return tsserverBin;
}

beforeEach(() => {
  projectRoot = createProjectFixture();
  fakeTsserverPath = installFakeTsserver(projectRoot);
});

afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

test("constructor prefers local node_modules/.bin/tsserver when no override is given", async () => {
  const client = new TsServerClient(projectRoot);
  expect(client.getResolvedTsserverPath()).toContain("node_modules/.bin/tsserver");
  await client.shutdown();
});

test("AC2/AC3: idle shutdown then respawn on next request", async () => {
  const client = new TsServerClient(projectRoot, { idleMs: 50, timeoutMs: 5_000, tsserverPath: fakeTsserverPath });

  await client.definition("src/impl.ts", 4, 5);
  const firstPid = client.getPid();
  expect(firstPid).toBeGreaterThan(0);

  await new Promise((r) => setTimeout(r, 120));
  expect(client.getPid()).toBeNull();

  await client.definition("src/impl.ts", 4, 5);
  const secondPid = client.getPid();
  expect(secondPid).toBeGreaterThan(0);
  expect(secondPid).not.toBe(firstPid);

  await client.shutdown();
});

test("AC5: pending requests are rejected if process crashes", async () => {
  const client = new TsServerClient(projectRoot, { tsserverPath: fakeTsserverPath, timeoutMs: 5_000 });
  await client.definition("src/impl.ts", 4, 5);

  const pid = client.getPid();
  expect(pid).toBeGreaterThan(0);
  const hung = client.rawRequestForTest("slowDefinition", { file: "src/impl.ts", line: 4, offset: 5 });
  process.kill(pid!, "SIGKILL");

  await expect(hung).rejects.toThrow("TsServer process exited unexpectedly");
  await client.shutdown();
});

test("AC6: request timeout rejects without killing process", async () => {
  const client = new TsServerClient(projectRoot, { tsserverPath: fakeTsserverPath, timeoutMs: 80 });

  await expect(client.rawRequestForTest("slowDefinition", { file: "src/impl.ts", line: 4, offset: 5 })).rejects.toThrow(
    "TsServer request timed out: slowDefinition",
  );

  const pidAfterTimeout = client.getPid();
  expect(pidAfterTimeout).toBeGreaterThan(0);

  const loc = await client.definition("src/impl.ts", 4, 5);
  expect(loc?.file).toBe("src/api.ts");
  expect(client.getPid()).toBe(pidAfterTimeout);

  await client.shutdown();
});

test("AC7: concurrent requests are serialized (max in-flight is 1)", async () => {
  const client = new TsServerClient(projectRoot, { tsserverPath: fakeTsserverPath, timeoutMs: 5_000 });

  await Promise.all([
    client.definition("src/impl.ts", 4, 5),
    client.references("src/api.ts", 1, 17),
  ]);

  const stats = await client.rawRequestForTest<{ maxInFlight: number }>("debugMaxInFlight", {});
  expect(stats.maxInFlight).toBe(1);

  await client.shutdown();
});

test("AC8: shutdown() cleans up process and pending timers", async () => {
  const client = new TsServerClient(projectRoot, { tsserverPath: fakeTsserverPath, idleMs: 10_000 });
  await client.definition("src/impl.ts", 4, 5);

  expect(client.getPid()).toBeGreaterThan(0);
  await client.shutdown();
  expect(client.getPid()).toBeNull();
  expect(client.getPendingCountForTest()).toBe(0);
});
```

---

#### Step 2 — Run (FAIL)

```bash
bun test test/tsserver-client.test.ts
```

Expected failure:

```text
error: Cannot find module "../src/indexer/tsserver-client.js" from "test/tsserver-client.test.ts"
```

---

#### Step 3 — Implementation

Create `src/indexer/tsserver-client.ts`:

```typescript
import { spawn } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join, relative, resolve } from "node:path";
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
        const timer = setTimeout(() => {
          this.pending.delete(seq);
          rejectReq(new Error(`TsServer request timed out: ${command}`));
        }, this.timeoutMs);
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
```

---

#### Step 4 — Run (PASS)

```bash
bun test test/tsserver-client.test.ts
```

Expected: all tests in this file pass.

---

#### Step 5 — Full suite

```bash
bun test
```

Expected: all tests pass.
