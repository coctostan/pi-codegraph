# Plan

### Task 1: Add TsServerClient request API and lifecycle

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

### Task 2: Store tree-sitter call-site coordinates in calls evidence

### Task 2: Store tree-sitter call-site coordinates in `calls` evidence
- Modify: `src/indexer/tree-sitter.ts`
- Modify: `test/indexer-extract-file.test.ts`

Append new tests that assert `calls` evidence uses `name:line:col` format, then update
both provenance blocks in `extractFile()` to record the callee identifier coordinates from
the tree-sitter AST node.

---

#### Step 1 — Test (RED)

Append to `test/indexer-extract-file.test.ts`:

```typescript
// ---------- Task 2 additions ----------

test("extractFile records call-site coordinates in calls evidence (bare call)", () => {
  const file = "src/a.ts";
  // line 1: function caller() {
  // line 2:   return foo();     <— 'foo' at col 10 (2 spaces + "return " = 9 chars, then 'f')
  // line 3: }
  const content = "function caller() {\n  return foo();\n}";
  const result = extractFile(file, content);

  const callEdges = result.edges.filter(
    (e) => e.kind === "calls" && !e.target.includes("__unresolved__")
      || (e.kind === "calls" && e.target.includes("__unresolved__")),
  );
  // There should be at least one calls edge for the 'foo' call
  const fooEdge = result.edges.find(
    (e) => e.kind === "calls" && e.provenance.evidence.startsWith("foo:"),
  );
  expect(fooEdge).toBeDefined();
  // Evidence must be "name:line:col" using 1-based positions from the AST.
  // 'foo' is the callee identifier: startPosition.row=1 (+1=2), startPosition.column=9 (+1=10)
  expect(fooEdge!.provenance.evidence).toBe("foo:2:10");
});

test("extractFile records constructor call-site coordinates in calls evidence (new expression)", () => {
  const file = "src/b.ts";
  // line 1: function make() {
  // line 2:   return new Bar();   <— 'Bar' at col 14 (2 spaces + "return new " = 13 chars, then 'B')
  // line 3: }
  const content = "function make() {\n  return new Bar();\n}";
  const result = extractFile(file, content);

  const barEdge = result.edges.find(
    (e) => e.kind === "calls" && e.provenance.evidence.startsWith("Bar:"),
  );
  expect(barEdge).toBeDefined();
  // 'Bar' constructor: startPosition.row=1 (+1=2), startPosition.column=13 (+1=14)
  expect(barEdge!.provenance.evidence).toBe("Bar:2:14");
});
```

---

#### Step 2 — Run (FAIL)

```
bun test test/indexer-extract-file.test.ts
```

Expected failure — current evidence stores only the callee name:
```
error: expect(received).toBe(expected)
Expected: "foo:2:10"
Received: "foo"
```

---

#### Step 3 — Implementation

In `src/indexer/tree-sitter.ts`, update the two provenance `evidence` strings inside
`visitCalls`. The helper function and both changed blocks are shown in full:

```typescript
// Helper — add directly above the visitCalls definition (before line 211 in the current file)
function callEvidence(node: SyntaxNode): string {
  return `${node.text}:${node.startPosition.row + 1}:${node.startPosition.column + 1}`;
}
```

Replace the bare-call provenance block (inside the `n.type === "call_expression"` branch):

```typescript
        if (callee?.type === "identifier") {
          pushEdge({
            source: nextFunctionId,
            target: unresolvedId(callee.text),
            kind: "calls",
            provenance: {
              source: "tree-sitter",
              confidence: 0.5,
              evidence: callEvidence(callee),     // was: callee.text
              content_hash: contentHash,
            },
            created_at: Date.now(),
          });
        }
```

Replace the constructor provenance block (inside the `n.type === "new_expression"` branch):

```typescript
        if (ctor?.type === "identifier") {
          pushEdge({
            source: nextFunctionId,
            target: unresolvedId(ctor.text),
            kind: "calls",
            provenance: {
              source: "tree-sitter",
              confidence: 0.5,
              evidence: callEvidence(ctor),       // was: ctor.text
              content_hash: contentHash,
            },
            created_at: Date.now(),
          });
        }
```

---

#### Step 4 — Run (PASS)

```
bun test test/indexer-extract-file.test.ts
```

Expected: all tests in the file pass.

---

#### Step 5 — Full suite

```
bun test
```

Expected: all tests pass (no regressions).

### Task 3: Extend GraphStore with unresolved-edge queries and targeted edge deletion

### Task 3: Extend `GraphStore` with unresolved-edge queries and targeted edge deletion
- Modify: `src/graph/store.ts`
- Modify: `src/graph/sqlite.ts`
- Modify: `test/graph-store.test.ts`

Append tests for `getUnresolvedEdges()`, `getEdgesBySource()` (ordered by `created_at` ASC),
and `deleteEdge()`, then implement each method in the interface and SQLite backend.

---

#### Step 1 — Test (RED)

Append to `test/graph-store.test.ts`:

```typescript
// ---------- Task 3 additions ----------

test("getUnresolvedEdges returns only edges whose target starts with __unresolved__::", () => {
  const store = new SqliteGraphStore();

  const caller = {
    id: "src/a.ts::caller:1",
    kind: "function" as const,
    name: "caller",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h1",
  };
  const resolved = {
    id: "src/b.ts::helper:1",
    kind: "function" as const,
    name: "helper",
    file: "src/b.ts",
    start_line: 1,
    end_line: 2,
    content_hash: "h2",
  };
  store.addNode(caller);
  store.addNode(resolved);

  store.addEdge({
    source: caller.id,
    target: resolved.id,
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "helper:1:5", content_hash: "h1" },
    created_at: 1000,
  });
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::helper:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "helper:2:5", content_hash: "h1" },
    created_at: 2000,
  });

  const unresolved = store.getUnresolvedEdges();
  expect(unresolved).toHaveLength(1);
  expect(unresolved[0]!.target).toBe("__unresolved__::helper:0");

  store.close();
});

test("getEdgesBySource returns all edges for a source ordered by created_at ASC", () => {
  const store = new SqliteGraphStore();

  const caller = {
    id: "src/a.ts::fn:1",
    kind: "function" as const,
    name: "fn",
    file: "src/a.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "h",
  };
  store.addNode(caller);

  // Insert in reverse order to confirm ORDER BY created_at ASC is enforced.
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::second:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "second:3:5", content_hash: "h" },
    created_at: 2000,
  });
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::first:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "first:2:5", content_hash: "h" },
    created_at: 1000,
  });

  const edges = store.getEdgesBySource(caller.id);
  expect(edges).toHaveLength(2);
  // Must be in created_at ASC order regardless of insertion order.
  expect(edges[0]!.created_at).toBe(1000);
  expect(edges[1]!.created_at).toBe(2000);

  store.close();
});

test("deleteEdge removes only the matching (source, target, kind, provenanceSource) row", () => {
  const store = new SqliteGraphStore();

  const caller = {
    id: "src/a.ts::deltest:1",
    kind: "function" as const,
    name: "deltest",
    file: "src/a.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h",
  };
  store.addNode(caller);

  store.addEdge({
    source: caller.id,
    target: "__unresolved__::foo:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "foo:2:5", content_hash: "h" },
    created_at: 1000,
  });
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::bar:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "bar:3:5", content_hash: "h" },
    created_at: 2000,
  });

  store.deleteEdge(caller.id, "__unresolved__::foo:0", "calls", "tree-sitter");

  const remaining = store.getEdgesBySource(caller.id);
  expect(remaining).toHaveLength(1);
  expect(remaining[0]!.target).toBe("__unresolved__::bar:0");

  store.close();
});
```

---

#### Step 2 — Run (FAIL)

```
bun test test/graph-store.test.ts
```

Expected failure — methods do not exist yet:
```
TypeError: store.getUnresolvedEdges is not a function
```

---

#### Step 3 — Implementation

**In `src/graph/store.ts`**, add three new signatures to the `GraphStore` interface:

```typescript
export interface GraphStore {
  addNode(node: GraphNode): void;
  addEdge(edge: GraphEdge): void;
  getNode(id: string): GraphNode | null;
  findNodes(name: string, file?: string): GraphNode[];
  getNeighbors(nodeId: string, options?: NeighborOptions): NeighborResult[];
  getNodesByFile(file: string): GraphNode[];
  deleteFile(file: string): void;
  listFiles(): string[];
  getFileHash(file: string): string | null;
  setFileHash(file: string, hash: string): void;
  /** Returns all edges whose target begins with "__unresolved__::". */
  getUnresolvedEdges(): GraphEdge[];
  /** Returns all edges whose source equals sourceId, ordered by created_at ASC. */
  getEdgesBySource(sourceId: string): GraphEdge[];
  /** Deletes the single edge identified by (source, target, kind, provenanceSource). */
  deleteEdge(source: string, target: string, kind: string, provenanceSource: string): void;
  close(): void;
}
```

**In `src/graph/sqlite.ts`**, add a private static row-to-edge helper and three public
methods. Insert before the `getNodesByFile` method:

```typescript
  private static edgeFromRow(row: {
    source: string;
    target: string;
    kind: string;
    provenance_source: string;
    confidence: number;
    evidence: string;
    content_hash: string;
    created_at: number;
  }): GraphEdge {
    return {
      source: row.source,
      target: row.target,
      kind: row.kind as GraphEdge["kind"],
      provenance: {
        source: row.provenance_source as GraphEdge["provenance"]["source"],
        confidence: row.confidence,
        evidence: row.evidence,
        content_hash: row.content_hash,
      },
      created_at: row.created_at,
    };
  }

  getUnresolvedEdges(): GraphEdge[] {
    // Use SUBSTR to avoid SQL LIKE treating '_' as a single-char wildcard.
    const rows = this.db
      .query(
        `SELECT source, target, kind, provenance_source, confidence, evidence,
                content_hash, created_at
         FROM edges
         WHERE SUBSTR(target, 1, 16) = '__unresolved__::'
         ORDER BY created_at ASC`,
      )
      .all() as Parameters<typeof SqliteGraphStore.edgeFromRow>[0][];
    return rows.map(SqliteGraphStore.edgeFromRow);
  }

  getEdgesBySource(sourceId: string): GraphEdge[] {
    const rows = this.db
      .query(
        `SELECT source, target, kind, provenance_source, confidence, evidence,
                content_hash, created_at
         FROM edges
         WHERE source = ?
         ORDER BY created_at ASC`,
      )
      .all(sourceId) as Parameters<typeof SqliteGraphStore.edgeFromRow>[0][];
    return rows.map(SqliteGraphStore.edgeFromRow);
  }

  deleteEdge(
    source: string,
    target: string,
    kind: string,
    provenanceSource: string,
  ): void {
    this.db
      .query(
        `DELETE FROM edges
         WHERE source = ? AND target = ? AND kind = ? AND provenance_source = ?`,
      )
      .run(source, target, kind, provenanceSource);
  }
```

---

#### Step 4 — Run (PASS)

```
bun test test/graph-store.test.ts
```

Expected: all tests in the file pass.

---

#### Step 5 — Full suite

```
bun test
```

Expected: all tests pass (no regressions).

### Task 4: Add eager LSP resolution stage for unresolved and confirmed call edges [depends: 1, 2, 3]

### Task 4: Add eager LSP resolution stage for unresolved and confirmed call edges [depends: 1, 2, 3]
- Create: `src/indexer/lsp.ts`
- Create: `test/indexer-lsp.test.ts`
This stage resolves both:
1) unresolved tree-sitter calls edges (`__unresolved__`) and
2) already-resolved tree-sitter calls edges (AC20) that should be upgraded to `lsp` provenance.

Use confidence `0.9` for all new `lsp` edges.

---

#### Step 1 — Test (RED)

Create `test/indexer-lsp.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { runLspIndexStage } from "../src/indexer/lsp.js";
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

function mkStore() {
  const store = new SqliteGraphStore();

  const caller = {
    id: "src/a.ts::caller:1",
    kind: "function" as const,
    name: "caller",
    file: "src/a.ts",
    start_line: 1,
    end_line: 5,
    content_hash: "h-a",
  };

  const callee = {
    id: "src/b.ts::target:1",
    kind: "function" as const,
    name: "target",
    file: "src/b.ts",
    start_line: 1,
    end_line: 3,
    content_hash: "h-b",
  };

  store.addNode(caller);
  store.addNode(callee);
  store.setFileHash(caller.file, caller.content_hash);
  store.setFileHash(callee.file, callee.content_hash);
  return { store, caller, callee };
}

test("resolves unresolved calls edge by evidence name + resolved file/line", async () => {
  const { store, caller, callee } = mkStore();

  store.addEdge({
    source: caller.id,
    target: "__unresolved__::target:0",
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: "target:2:5",
      content_hash: "h-a",
    },
    created_at: 1000,
  });

  const client: ITsServerClient = {
    async definition(file, line, col) {
      expect(file).toBe("src/a.ts");
      expect(line).toBe(2);
      expect(col).toBe(5);
      return { file: "src/b.ts", line: 1, col: 17 };
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);

  expect(store.getUnresolvedEdges()).toHaveLength(0);

  const out = store.getEdgesBySource(caller.id).filter((e) => e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(out[0]!.target).toBe(callee.id);
  expect(out[0]!.provenance.confidence).toBe(0.9);

  store.close();
});

test("AC20: upgrades confirmed tree-sitter edge when definition matches existing target node", async () => {
  const { store, caller, callee } = mkStore();

  store.addEdge({
    source: caller.id,
    target: callee.id,
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: "target:2:5",
      content_hash: "h-a",
    },
    created_at: 1000,
  });

  const client: ITsServerClient = {
    async definition(file, line, col) {
      expect(file).toBe("src/a.ts");
      expect(line).toBe(2);
      expect(col).toBe(5);
      return { file: "src/b.ts", line: 1, col: 17 };
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);

  const all = store.getEdgesBySource(caller.id);
  const lsp = all.filter((e) => e.target === callee.id && e.provenance.source === "lsp");
  const ts = all.filter((e) => e.target === callee.id && e.provenance.source === "tree-sitter");

  expect(lsp).toHaveLength(1);
  expect(lsp[0]!.provenance.confidence).toBe(0.9);
  expect(ts).toHaveLength(0);

  store.close();
});

test("partial results are preserved when tsserver crashes mid-stage", async () => {
  const { store, caller } = mkStore();

  const callee2 = {
    id: "src/c.ts::other:1",
    kind: "function" as const,
    name: "other",
    file: "src/c.ts",
    start_line: 1,
    end_line: 2,
    content_hash: "h-c",
  };
  store.addNode(callee2);

  store.addEdge({
    source: caller.id,
    target: "__unresolved__::target:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "target:2:5", content_hash: "h-a" },
    created_at: 1000,
  });
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::other:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "other:3:5", content_hash: "h-a" },
    created_at: 2000,
  });

  let n = 0;
  const client: ITsServerClient = {
    async definition() {
      n++;
      if (n === 1) return { file: "src/b.ts", line: 1, col: 17 };
      throw new Error("TsServer process exited unexpectedly");
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await expect(runLspIndexStage(store, "/project", client)).resolves.toBeUndefined();

  const out = store.getEdgesBySource(caller.id).filter((e) => e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(store.getUnresolvedEdges()).toHaveLength(1);

  store.close();
});

test("AC21: running the LSP stage twice produces no duplicate edges (idempotent)", async () => {
  const { store, caller, callee } = mkStore();

  store.addEdge({
    source: caller.id,
    target: "__unresolved__::target:0",
    kind: "calls",
    provenance: {
      source: "tree-sitter",
      confidence: 0.5,
      evidence: "target:2:5",
      content_hash: "h-a",
    },
    created_at: 1000,
  });

  const client: ITsServerClient = {
    async definition() {
      return { file: "src/b.ts", line: 1, col: 17 };
    },
    async references() { return []; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await runLspIndexStage(store, "/project", client);
  await runLspIndexStage(store, "/project", client); // second run — must be a no-op

  expect(store.getUnresolvedEdges()).toHaveLength(0);
  const out = store.getEdgesBySource(caller.id).filter((e) => e.provenance.source === "lsp");
  expect(out).toHaveLength(1); // exactly 1, not 2
  expect(out[0]!.target).toBe(callee.id);

  store.close();
});
```

---

#### Step 2 — Run (FAIL)

```bash
bun test test/indexer-lsp.test.ts
```

Expected failure:

```text
error: Cannot find module "../src/indexer/lsp.js" from "test/indexer-lsp.test.ts"
```

---

#### Step 3 — Implementation

Create `src/indexer/lsp.ts`:

```typescript
import type { GraphEdge } from "../graph/types.js";
import type { GraphStore } from "../graph/store.js";
import type { ITsServerClient } from "./tsserver-client.js";
function parseEvidence(evidence: string): { name: string; line: number; col: number } | null {
  const parts = evidence.split(":");
  if (parts.length !== 3) return null;
  const [name, lineStr, colStr] = parts;
  const line = Number(lineStr);
  const col = Number(colStr);
  if (!name || !Number.isFinite(line) || !Number.isFinite(col)) return null;
  return { name, line, col };
}

function isStartupError(err: unknown): boolean {
  return err instanceof Error && err.message.startsWith("TsServer failed to start:");
}

function isUnresolvedTarget(target: string): boolean {
  return target.startsWith("__unresolved__::");
}

function makeLspEdge(source: string, target: string, evidence: string, contentHash: string): GraphEdge {
  return {
    source,
    target,
    kind: "calls",
    provenance: {
      source: "lsp",
      confidence: 0.9,
      evidence,
      content_hash: contentHash,
    },
    created_at: Date.now(),
  };
}
export async function runLspIndexStage(
  store: GraphStore,
  _projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  const unresolved = store.getUnresolvedEdges().filter((e) => e.kind === "calls" && e.provenance.source === "tree-sitter");

  const confirmed: GraphEdge[] = [];
  for (const file of store.listFiles()) {
    for (const node of store.getNodesByFile(file)) {
      for (const e of store.getEdgesBySource(node.id)) {
        if (e.kind === "calls" && e.provenance.source === "tree-sitter" && !isUnresolvedTarget(e.target)) {
          confirmed.push(e);
        }
      }
    }
  }

  const work = [...unresolved, ...confirmed];

  for (const edge of work) {
    const sourceNode = store.getNode(edge.source);
    if (!sourceNode) continue;
    const parsed = parseEvidence(edge.provenance.evidence);
    if (!parsed) continue;
    let loc;
    try {
      loc = await client.definition(sourceNode.file, parsed.line, parsed.col);
    } catch (err) {
      if (isStartupError(err)) return;
      continue;
    }

    if (!loc) continue;

    if (isUnresolvedTarget(edge.target)) {
      const targetNode = store
        .getNodesByFile(loc.file)
        .find((n) => n.name === parsed.name && n.start_line === loc.line);
    if (!targetNode) continue;
      store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
      store.addEdge(makeLspEdge(edge.source, targetNode.id, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
      continue;
    }

    const existingTarget = store.getNode(edge.target);
    if (!existingTarget) continue;

    const sameTarget = existingTarget.file === loc.file && existingTarget.start_line === loc.line;
    if (!sameTarget) continue;

    store.deleteEdge(edge.source, edge.target, edge.kind, edge.provenance.source);
    store.addEdge(makeLspEdge(edge.source, edge.target, `${loc.file}:${loc.line}:${loc.col}`, sourceNode.content_hash));
  }
}
```

---

#### Step 4 — Run (PASS)

```bash
bun test test/indexer-lsp.test.ts
```

Expected: all tests in this file pass.

---

#### Step 5 — Full suite

```bash
bun test
```

Expected: full suite passes.

### Task 5: Run the LSP stage from the indexing pipeline and purge stale LSP edges on file changes [depends: 3, 4]

### Task 5: Run the LSP stage from the indexing pipeline and purge stale LSP edges on file changes [depends: 3, 4]
- Modify: `src/indexer/pipeline.ts`
- Modify: `src/index.ts`
- Modify: `test/indexer-index-project.test.ts`
Make `indexProject` async, run the LSP stage after tree-sitter indexing, and update existing tests to await the async API everywhere.

---

#### Step 1 — Test (RED)

Update `test/indexer-index-project.test.ts`.

1) Convert all synchronous `indexProject(...)` assertions to async forms.

Replace:

```typescript
const result = indexProject(root, store);
expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });
```

with:

```typescript
const result = await indexProject(root, store);
expect(result).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 0 });
```

Replace:

```typescript
expect(indexProject(root, store)).toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 1 });
```

with:

```typescript
await expect(indexProject(root, store)).resolves.toEqual({ indexed: 2, skipped: 0, removed: 0, errors: 1 });
```

Apply this throughout the file (all three existing tests).

2) Append this integration test proving the LSP stage runs after tree-sitter and upgrades an unresolved call edge:

```typescript
import type { ITsServerClient } from "../src/indexer/tsserver-client.js";

test("indexProject runs LSP stage and upgrades unresolved call edge to lsp provenance", async () => {
  const root = join(tmpdir(), `pi-codegraph-lsp-stage-${Date.now()}`);
  const dbPath = join(root, "graph.sqlite");
  mkdirSync(join(root, "src"), { recursive: true });
  writeFileSync(join(root, "src", "api.ts"), "export function shared() { return 1; }\n");
  writeFileSync(join(root, "src", "impl.ts"), 'import { shared } from "./api";\nexport function run(){ shared(); }\n');
  const store = new SqliteGraphStore(dbPath);
  try {
    const fakeClient: ITsServerClient = {
      async definition(file, line, col) {
        if (file === "src/impl.ts" && line === 2 && col === 24) {
          return { file: "src/api.ts", line: 1, col: 17 };
        }
        return null;
      },
      async references() { return []; },
      async implementations() { return []; },
      async shutdown() {},
    };

    const result = await indexProject(root, store, {
      lspClientFactory: () => fakeClient,
    });

    expect(result.errors).toBe(0);

    const runNode = store.findNodes("run", "src/impl.ts")[0]!;
    const out = store.getEdgesBySource(runNode.id);
    expect(out.some((e) => e.kind === "calls" && e.provenance.source === "lsp")).toBe(true);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
```

---

#### Step 2 — Run (FAIL)

```bash
bun test test/indexer-index-project.test.ts
```

Expected failure before implementation:

```text
TS2345: Argument of type 'IndexResult' is not assignable to parameter of type 'Promise<unknown>'
```

and for the new test hook:

```text
TS2554: Expected 2 arguments, but got 3.
```

---

#### Step 3 — Implementation

1) Modify `src/indexer/pipeline.ts`.

- Change signature to async and accept optional LSP factory:

```typescript
import { runLspIndexStage } from "./lsp.js";
import { TsServerClient } from "./tsserver-client.js";
import type { ITsServerClient } from "./tsserver-client.js";

export interface IndexProjectOptions {
  lspClientFactory?: (projectRoot: string) => ITsServerClient;
}
export async function indexProject(
  projectRoot: string,
  store: GraphStore,
  options: IndexProjectOptions = {},
): Promise<IndexResult> {
  // existing tree-sitter indexing logic unchanged
  // ...

  const client = options.lspClientFactory
    ? options.lspClientFactory(projectRoot)
    : new TsServerClient(projectRoot);

  try {
    await runLspIndexStage(store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
  return { indexed, skipped, removed, errors };
}
```

2) Modify `src/index.ts` to await indexing and to use Task-1 constructor API:

```typescript
async function ensureIndexed(projectRoot: string, store: GraphStore): Promise<void> {
  if (store.listFiles().length === 0) {
    await indexProject(projectRoot, store);
  }
}
```

And in both tool handlers:

```typescript
await ensureIndexed(projectRoot, store);
```

3) Update all existing tests in `test/indexer-index-project.test.ts`:
- change each test callback to `async`
- change every `indexProject(...)` assertion to `await`/`resolves` form.

---

#### Step 4 — Run (PASS)

```bash
bun test test/indexer-index-project.test.ts
```

Expected: all tests in this file pass.

---

#### Step 5 — Full suite

```bash
bun test
```

Expected: full suite passes.

### Task 6: Persist missing caller edges from LSP references when symbol_graph is invoked [depends: 1, 3, 5]

### Task 6: Persist missing caller edges from LSP references when `symbol_graph` is invoked [depends: 1, 3, 5]
- Create: `src/indexer/lsp-resolver.ts`
- Modify: `src/index.ts`
- Create: `test/tool-symbol-graph-lsp.test.ts`
Use a persisted resolution marker (not “any inbound lsp edge exists”) keyed by `symbolId + resolverKind` so eager indexing and lazy tool resolution can coexist.

---

#### Step 1 — Test (RED)

Create `test/tool-symbol-graph-lsp.test.ts`:

```typescript
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";
import { resolveMissingCallers } from "../src/indexer/lsp-resolver.js";
import type { ITsServerClient, LspLocation } from "../src/indexer/tsserver-client.js";
test("resolveMissingCallers persists callers and writes marker; second run skips references()", async () => {
  const store = new SqliteGraphStore();

  const target = {
    id: nodeId("src/api.ts", "shared", 1),
    kind: "function" as const,
    name: "shared",
    file: "src/api.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h-api",
  };
  const caller = {
    id: nodeId("src/impl.ts", "run", 3),
    kind: "function" as const,
    name: "run",
    file: "src/impl.ts",
    start_line: 3,
    end_line: 6,
    content_hash: "h-impl",
  };
  store.addNode(target);
  store.addNode(caller);

  let calls = 0;
  const client: ITsServerClient = {
    async references(): Promise<LspLocation[]> {
      calls++;
      return [{ file: "src/impl.ts", line: 4, col: 5 }];
    },
    async definition() { return null; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await resolveMissingCallers(target, store, "/project", client);
  await resolveMissingCallers(target, store, "/project", client);

  const out = store.getEdgesBySource(caller.id).filter((e) => e.kind === "calls" && e.target === target.id && e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(out[0]!.provenance.confidence).toBe(0.9);
  expect(calls).toBe(1);

  store.close();
});

test("resolveMissingCallers ignores self-reference at declaration location", async () => {
  const store = new SqliteGraphStore();
  const target = {
    id: nodeId("src/api.ts", "shared", 1),
    kind: "function" as const,
    name: "shared",
    file: "src/api.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h-api",
  };
  store.addNode(target);

  const client: ITsServerClient = {
    async references(): Promise<LspLocation[]> {
      return [{ file: "src/api.ts", line: 1, col: 17 }];
    },
    async definition() { return null; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await resolveMissingCallers(target, store, "/project", client);

  const inEdges = store.getNeighbors(target.id, { direction: "in", kind: "calls" });
  expect(inEdges).toHaveLength(0);

  store.close();
});

test("resolveMissingCallers re-resolves after file re-index (stale marker edge cleared)", async () => {
  const store = new SqliteGraphStore();

  const target = {
    id: nodeId("src/api.ts", "shared", 1),
    kind: "function" as const,
    name: "shared",
    file: "src/api.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h-api",
  };
  const caller = {
    id: nodeId("src/impl.ts", "run", 3),
    kind: "function" as const,
    name: "run",
    file: "src/impl.ts",
    start_line: 3,
    end_line: 6,
    content_hash: "h-impl",
  };
  store.addNode(target);
  store.addNode(caller);

  let calls = 0;
  const client: ITsServerClient = {
    async references(): Promise<LspLocation[]> {
      calls++;
      return [{ file: "src/impl.ts", line: 4, col: 5 }];
    },
    async definition() { return null; },
    async implementations() { return []; },
    async shutdown() {},
  };

  // First resolution — sets marker
  await resolveMissingCallers(target, store, "/project", client);
  expect(calls).toBe(1);

  // Simulate file re-index: deleteFile removes symbol node and all non-agent edges
  // (including the marker→symbol edge), then re-adds the symbol.
  store.deleteFile("src/api.ts");
  store.addNode(target);
  store.addNode(caller);

  // Second resolution — marker node exists but edge was deleted → should re-resolve
  await resolveMissingCallers(target, store, "/project", client);
  expect(calls).toBe(2);  // must NOT be blocked by stale marker

  store.close();
});

test("tool wiring: symbol_graph invokes resolver and persists lsp caller edge before render", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-tool-lsp-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "api.ts"), "export function shared(){return 1;}\n");
  writeFileSync(join(projectRoot, "src", "impl.ts"), 'import { shared } from "./api";\nexport function run(){ shared(); }\n');

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    let exec: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") exec = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const result = await exec!("tc1", { name: "shared", file: "src/api.ts" }, undefined, undefined, { cwd: projectRoot });

    const store = mod.getSharedStoreForTesting();
    const target = store.findNodes("shared", "src/api.ts")[0];
    const inbound = store.getNeighbors(target.id, { direction: "in", kind: "calls" }).filter((n) => n.edge.provenance.source === "lsp");

    expect(inbound.length).toBeGreaterThan(0);
    expect(result.content[0].text).toContain("Callers");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

---

#### Step 2 — Run (FAIL)

```bash
bun test test/tool-symbol-graph-lsp.test.ts
```

Expected failure:

```text
error: Cannot find module "../src/indexer/lsp-resolver.js" from "test/tool-symbol-graph-lsp.test.ts"
```

---

#### Step 3 — Implementation

1) Create `src/indexer/lsp-resolver.ts`:

```typescript
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { GraphNode } from "../graph/types.js";
import type { GraphStore } from "../graph/store.js";
import type { ITsServerClient } from "./tsserver-client.js";
function markerNodeId(kind: "callers" | "implementations", symbolId: string): string {
  return `__meta__::resolver::${kind}::${symbolId}`;
}

function hasMarker(store: GraphStore, kind: "callers" | "implementations", symbol: GraphNode): boolean {
  const id = markerNodeId(kind, symbol.id);
  if (store.getNode(id) === null) return false;
  // After a file re-index the marker node survives but its outbound edge is deleted.
  // Only treat the marker as valid when the edge still points to the symbol.
  return store.getEdgesBySource(id).some((e) => e.target === symbol.id);
}

function setMarker(store: GraphStore, kind: "callers" | "implementations", symbol: GraphNode): void {
  const id = markerNodeId(kind, symbol.id);
  store.addNode({
    id,
    kind: "module",
    name: id,
    file: "__meta__/resolver",
    start_line: 1,
    end_line: 1,
    content_hash: "meta",
  });
  store.addEdge({
    source: id,
    target: symbol.id,
    kind: "imports",
    provenance: { source: "agent", confidence: 1, evidence: `resolved:${kind}`, content_hash: "meta" },
    created_at: Date.now(),
  });
}

function findSymbolColumn(projectRoot: string, file: string, line: number, symbolName: string): number {
  try {
    const lines = readFileSync(join(projectRoot, file), "utf8").split(/\r?\n/);
    const idx = (lines[line - 1] ?? "").indexOf(symbolName);
    return idx >= 0 ? idx + 1 : 1;
  } catch {
    return 1;
  }
}
export async function resolveMissingCallers(
  node: GraphNode,
  store: GraphStore,
  projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  if (hasMarker(store, "callers", node)) return;

  const col = findSymbolColumn(projectRoot, node.file, node.start_line, node.name);
  let refs;
  try {
    refs = await client.references(node.file, node.start_line, col);
  } catch {
    return;
  }
  for (const ref of refs) {
    const callerNode = store
      .getNodesByFile(ref.file)
      .find((n) => n.kind !== "module" && n.start_line <= ref.line && (n.end_line === null || n.end_line >= ref.line));
    if (!callerNode) continue;
    if (callerNode.id === node.id) continue; // self reference/declaration

    const exists = store.getEdgesBySource(callerNode.id).some((e) => e.kind === "calls" && e.target === node.id);
    if (exists) continue;
    store.addEdge({
      source: callerNode.id,
      target: node.id,
      kind: "calls",
      provenance: {
        source: "lsp",
        confidence: 0.9,
        evidence: `${ref.file}:${ref.line}:${ref.col}`,
        content_hash: callerNode.content_hash,
      },
      created_at: Date.now(),
    });
  }

  setMarker(store, "callers", node);
}
```

2) Modify `src/index.ts` in `symbol_graph` handler to call resolver before rendering:

```typescript
import { resolveMissingCallers } from "./indexer/lsp-resolver.js";
import { TsServerClient } from "./indexer/tsserver-client.js";
// inside symbol_graph execute
const nodes = store.findNodes(params.name, params.file);
if (nodes.length === 1) {
  const client = new TsServerClient(projectRoot);
  try {
    await resolveMissingCallers(nodes[0]!, store, projectRoot, client);
  } finally {
    await client.shutdown().catch(() => {});
  }
}
```

---

#### Step 4 — Run (PASS)

```bash
bun test test/tool-symbol-graph-lsp.test.ts
```

Expected: all tests in this file pass.

---

#### Step 5 — Full suite

```bash
bun test
```

Expected: full suite passes.

### Task 7: Persist interface implementation edges from LSP and avoid repeat tool-time queries [depends: 1, 3, 5, 6]

### Task 7: Persist interface implementation edges from LSP and avoid repeat tool-time queries [depends: 1, 3, 5, 6]
- Modify: `src/indexer/lsp-resolver.ts`
- Modify: `src/index.ts`
- Modify: `test/tool-symbol-graph-lsp.test.ts`
Use the same persisted marker strategy as Task 6 (symbol id + resolver kind), set confidence to `0.9`, and add tool-path coverage for interface output.

---

#### Step 1 — Test (RED)

First, update the existing import at the top of `test/tool-symbol-graph-lsp.test.ts`:

```typescript
// Replace existing import line:
import { resolveMissingCallers } from "../src/indexer/lsp-resolver.js";
// With:
import { resolveMissingCallers, resolveImplementations } from "../src/indexer/lsp-resolver.js";
```

Then append the following tests to the end of the file:

```typescript
test("resolveImplementations persists implements edges and marker; second run skips implementations()", async () => {
  const store = new SqliteGraphStore();

  const iface = {
    id: nodeId("src/api.ts", "IWorker", 2),
    kind: "interface" as const,
    name: "IWorker",
    file: "src/api.ts",
    start_line: 2,
    end_line: 3,
    content_hash: "h-api",
  };
  const impl = {
    id: nodeId("src/impl.ts", "Worker", 1),
    kind: "class" as const,
    name: "Worker",
    file: "src/impl.ts",
    start_line: 1,
    end_line: 4,
    content_hash: "h-impl",
  };
  store.addNode(iface);
  store.addNode(impl);

  let calls = 0;
  const client: ITsServerClient = {
    async implementations(): Promise<LspLocation[]> {
      calls++;
      return [{ file: "src/impl.ts", line: 1, col: 14 }];
    },
    async definition() { return null; },
    async references() { return []; },
    async shutdown() {},
  };

  await resolveImplementations(iface, store, "/project", client);
  await resolveImplementations(iface, store, "/project", client);

  const out = store.getEdgesBySource(impl.id).filter((e) => e.kind === "implements" && e.target === iface.id && e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(out[0]!.provenance.confidence).toBe(0.9);
  expect(calls).toBe(1);

  store.close();
});

test("tool path: interface symbol_graph resolves implementations, persists edge, and renders Implementations section", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-interface-lsp-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "api.ts"), "export interface IWorker { run(): void }\n");
  writeFileSync(join(projectRoot, "src", "impl.ts"), "export class Worker implements IWorker { run(): void {} }\n");

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    let exec: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") exec = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const result = await exec!("tc-intf", { name: "IWorker", file: "src/api.ts" }, undefined, undefined, { cwd: projectRoot });

    const store = mod.getSharedStoreForTesting();
    const ifaceNode = store.findNodes("IWorker", "src/api.ts")[0]!;
    const implIn = store.getNeighbors(ifaceNode.id, { direction: "in", kind: "implements" }).filter((n) => n.edge.provenance.source === "lsp");

    expect(implIn.length).toBeGreaterThan(0);
    expect(result.content[0].text).toContain("Implementations");
    expect(result.content[0].text).toContain("Worker");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});

test("non-interface symbol_graph output remains unchanged (no Implementations section)", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-non-interface-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "x.ts"), "export function hello(){ return 1; }\n");

  try {
    const mod = await import("../src/index.js");
    if (typeof mod.resetStoreForTesting === "function") mod.resetStoreForTesting();

    let exec: Function | undefined;
    const mockPi = {
      registerTool(tool: { name: string; execute: Function }) {
        if (tool.name === "symbol_graph") exec = tool.execute;
      },
      on() {},
    };

    mod.default(mockPi as any);
    const result = await exec!("tc-fn", { name: "hello", file: "src/x.ts" }, undefined, undefined, { cwd: projectRoot });

    expect(result.content[0].text).not.toContain("Implementations");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

---

#### Step 2 — Run (FAIL)

```bash
bun test test/tool-symbol-graph-lsp.test.ts
```

Expected failure:

```text
error: Export named 'resolveImplementations' not found in module '../src/indexer/lsp-resolver.js'
```

---

#### Step 3 — Implementation

1) Modify `src/indexer/lsp-resolver.ts`:

```typescript
export async function resolveImplementations(
  node: GraphNode,
  store: GraphStore,
  projectRoot: string,
  client: ITsServerClient,
): Promise<void> {
  if (hasMarker(store, "implementations", node)) return;

  const col = findSymbolColumn(projectRoot, node.file, node.start_line, node.name);
  let impls;
  try {
    impls = await client.implementations(node.file, node.start_line, col);
  } catch {
    return;
  }

  for (const implLoc of impls) {
    const implNode = store
      .getNodesByFile(implLoc.file)
      .find((n) => n.kind === "class" && n.start_line <= implLoc.line && (n.end_line === null || n.end_line >= implLoc.line));

    if (!implNode) continue;

    const exists = store.getEdgesBySource(implNode.id).some((e) => e.kind === "implements" && e.target === node.id);
    if (exists) continue;
    store.addEdge({
      source: implNode.id,
      target: node.id,
      kind: "implements",
      provenance: {
        source: "lsp",
        confidence: 0.9,
        evidence: `${implLoc.file}:${implLoc.line}:${implLoc.col}`,
        content_hash: implNode.content_hash,
      },
      created_at: Date.now(),
    });
  }

  setMarker(store, "implementations", node);
}
```

2) Modify `src/index.ts` `symbol_graph` handler:

```typescript
import { computeAnchor } from "./output/anchoring.js";
import { resolveMissingCallers, resolveImplementations } from "./indexer/lsp-resolver.js";
function renderImplementationsSuffix(store: GraphStore, node: any, projectRoot: string): string {
  if (node.kind !== "interface") return "";

  const impl = store
    .getNeighbors(node.id, { direction: "in", kind: "implements" })
    .filter((n) => n.edge.provenance.source === "lsp");

  if (impl.length === 0) return "";

  const lines = ["", "### Implementations"];
  for (const it of impl) {
    const anchor = computeAnchor(it.node, projectRoot);
    lines.push(`  ${anchor.anchor}  ${it.node.name}  implements  confidence:${it.edge.provenance.confidence}  ${it.edge.provenance.source}`);
  }
  return lines.join("\n") + "\n";
}

// inside symbol_graph execute
let resolvedNode: any | null = null;
const nodes = store.findNodes(params.name, params.file);
if (nodes.length === 1) {
  resolvedNode = nodes[0]!;
  const client = new TsServerClient(projectRoot);
  try {
    await resolveMissingCallers(resolvedNode, store, projectRoot, client);
    if (resolvedNode.kind === "interface") {
      await resolveImplementations(resolvedNode, store, projectRoot, client);
    }
  } finally {
    await client.shutdown().catch(() => {});
  }
}

let output = symbolGraph({ name: params.name, file: params.file, store, projectRoot });
if (resolvedNode) {
  output += renderImplementationsSuffix(store, resolvedNode, projectRoot);
}
```

This keeps non-interface output identical unless the queried symbol is an interface with resolved implementations.

---

#### Step 4 — Run (PASS)

```bash
bun test test/tool-symbol-graph-lsp.test.ts
```

Expected: all tests in this file pass.

---

#### Step 5 — Full suite

```bash
bun test
```

Expected: full suite passes.
