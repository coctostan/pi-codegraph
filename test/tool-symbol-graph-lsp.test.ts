import { expect, test } from "bun:test";
import { chmodSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { nodeId } from "../src/graph/types.js";
import { resolveMissingCallers, resolveImplementations } from "../src/indexer/lsp-resolver.js";
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
    async definition() {
      return null;
    },
    async implementations() {
      return [];
    },
    async shutdown() {},
  };

  await resolveMissingCallers(target, store, "/project", client);
  await resolveMissingCallers(target, store, "/project", client);

  const out = store
    .getEdgesBySource(caller.id)
    .filter((e) => e.kind === "calls" && e.target === target.id && e.provenance.source === "lsp");
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
    async definition() {
      return null;
    },
    async implementations() {
      return [];
    },
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
    async definition() {
      return null;
    },
    async implementations() {
      return [];
    },
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
  expect(calls).toBe(2); // must NOT be blocked by stale marker

  store.close();
});

test("tool wiring: symbol_graph invokes resolver and persists lsp caller edge before render", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-tool-lsp-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  // impl.ts: shared() called at line 2, col 24 ("export function run(){ shared(); }")
  writeFileSync(join(projectRoot, "src", "api.ts"), "export function shared(){return 1;}\n");
  writeFileSync(join(projectRoot, "src", "impl.ts"), 'import { shared } from "./api";\nexport function run(){ shared(); }\n');
  // Install a fake tsserver so the test is hermetic and doesn't rely on a real tsserver
  // or the removed name-match fallback.  The fake returns the call-site of shared() in
  // impl.ts (line 2, offset 24) for any references query.
  const binDir = join(projectRoot, "node_modules", ".bin");
  mkdirSync(binDir, { recursive: true });
  const tsserverBin = join(binDir, process.platform === "win32" ? "tsserver.cmd" : "tsserver");
  const fakeJs = join(projectRoot, ".fake-ts.js");
  writeFileSync(fakeJs, [
    "function send(m){ process.stdout.write(JSON.stringify(m) + '\\n'); }",
    "process.stdin.setEncoding('utf8'); let buf = '';",
    "process.stdin.on('data', c => {",
    "  buf += c;",
    "  while (true) { const nl = buf.indexOf('\\n'); if (nl === -1) break;",
    "    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;",
    "    let msg; try { msg = JSON.parse(line); } catch { continue; }",
    "    if (msg.command === 'open') continue;",
    "    if (msg.command === 'exit') process.exit(0);",
    "    setTimeout(() => {",
    "      if (msg.command === 'references') send({ type:'response', request_seq:msg.seq, success:true, body:{ refs:[{ file:'src/impl.ts', start:{ line:2, offset:24 } }] } });",
    "      else send({ type:'response', request_seq:msg.seq, success:true, body:[] });",
    "    }, 10);",
    "  }",
    "});",
  ].join("\n"));
  if (process.platform === "win32") {
    writeFileSync(tsserverBin, `@echo off\nnode "${fakeJs}"\n`);
  } else {
    writeFileSync(tsserverBin, `#!/usr/bin/env bash\nnode "${fakeJs}"\n`);
    chmodSync(tsserverBin, 0o755);
  }

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
    const store = mod.getSharedStoreForTesting()!;
    const target = store.findNodes("shared", "src/api.ts")[0]!;
    const inbound = store.getNeighbors(target.id, { direction: "in", kind: "calls" }).filter((n) => n.edge.provenance.source === "lsp");
    expect(inbound.length).toBeGreaterThan(0);
    expect(result.content[0].text).toContain("Callers");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});


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
    async definition() {
      return null;
    },
    async references() {
      return [];
    },
    async shutdown() {},
  };

  await resolveImplementations(iface, store, "/project", client);
  await resolveImplementations(iface, store, "/project", client);

  const out = store
    .getEdgesBySource(impl.id)
    .filter((e) => e.kind === "implements" && e.target === iface.id && e.provenance.source === "lsp");
  expect(out).toHaveLength(1);
  expect(out[0]!.provenance.confidence).toBe(0.9);
  expect(calls).toBe(1);

  store.close();
});

test("tool path: interface symbol_graph resolves implementations, persists edge, and renders Implementations section", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-interface-lsp-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src", "api.ts"), "export interface IWorker { run(): void }\n");
  writeFileSync(join(projectRoot, "src", "impl.ts"), "import type { IWorker } from './api';\nexport class Worker implements IWorker { run(): void {} }\n");

  // Install a fake tsserver so this test is hermetic and does not depend on
  // global tsserver availability/timing in CI.
  const binDir = join(projectRoot, "node_modules", ".bin");
  mkdirSync(binDir, { recursive: true });
  const tsserverBin = join(binDir, process.platform === "win32" ? "tsserver.cmd" : "tsserver");
  const fakeJs = join(projectRoot, ".fake-ts-interface.js");
  writeFileSync(fakeJs, [
    "function send(m){ process.stdout.write(JSON.stringify(m) + '\\n'); }",
    "process.stdin.setEncoding('utf8'); let buf = '';",
    "process.stdin.on('data', c => {",
    "  buf += c;",
    "  while (true) { const nl = buf.indexOf('\\n'); if (nl === -1) break;",
    "    const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!line) continue;",
    "    let msg; try { msg = JSON.parse(line); } catch { continue; }",
    "    if (msg.command === 'open') continue;",
    "    if (msg.command === 'exit') process.exit(0);",
    "    setTimeout(() => {",
    "      if (msg.command === 'implementation') send({ type:'response', request_seq:msg.seq, success:true, body:[{ file:'src/impl.ts', start:{ line:2, offset:14 } }] });",
    "      else if (msg.command === 'references') send({ type:'response', request_seq:msg.seq, success:true, body:{ refs:[] } });",
    "      else send({ type:'response', request_seq:msg.seq, success:true, body:[] });",
    "    }, 10);",
    "  }",
    "});",
  ].join("\n"));
  if (process.platform === "win32") {
    writeFileSync(tsserverBin, `@echo off\nnode "${fakeJs}"\n`);
  } else {
    writeFileSync(tsserverBin, `#!/usr/bin/env bash\nnode "${fakeJs}"\n`);
    chmodSync(tsserverBin, 0o755);
  }

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
    const store = mod.getSharedStoreForTesting()!;
    const ifaceNode = store.findNodes("IWorker", "src/api.ts")[0]!;
    const implIn = store
      .getNeighbors(ifaceNode.id, { direction: "in", kind: "implements" })
      .filter((n) => n.edge.provenance.source === "lsp");
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

// ──────────────────────────────────────────────────────────────────────────────
// Bug-regression tests (added during code review)
// ──────────────────────────────────────────────────────────────────────────────

test("resolveMissingCallers: transient error does NOT set marker — next call retries", async () => {
  // When references() throws a non-startup error (transient crash / timeout),
  // the marker must NOT be set so the next symbol_graph call can retry.
  const store = new SqliteGraphStore();
  const target = {
    id: nodeId("src/api.ts", "shared", 1),
    kind: "function" as const,
    name: "shared",
    file: "src/api.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h",
  };
  store.addNode(target);

  let calls = 0;
  const client: ITsServerClient = {
    async references(): Promise<LspLocation[]> {
      calls++;
      throw new Error("TsServer process exited unexpectedly");
    },
    async definition() { return null; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await resolveMissingCallers(target, store, "/project", client);
  await resolveMissingCallers(target, store, "/project", client);

  expect(calls).toBe(2); // both calls should reach references() — marker was NOT set
  store.close();
});

test("resolveMissingCallers: startup error DOES set marker — second call is skipped", async () => {
  // When references() throws a 'TsServer failed to start:' error (permanent),
  // the marker IS set so we don't retry infinitely on a system without tsserver.
  const store = new SqliteGraphStore();
  const target = {
    id: nodeId("src/api.ts", "shared", 1),
    kind: "function" as const,
    name: "shared",
    file: "src/api.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h",
  };
  store.addNode(target);

  let calls = 0;
  const client: ITsServerClient = {
    async references(): Promise<LspLocation[]> {
      calls++;
      throw new Error("TsServer failed to start: /no/such/tsserver");
    },
    async definition() { return null; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await resolveMissingCallers(target, store, "/project", client);
  await resolveMissingCallers(target, store, "/project", client);

  expect(calls).toBe(1); // marker set after startup error → second call short-circuits
  store.close();
});

test("resolveMissingCallers: error catch block does NOT create fake lsp-provenance edges", async () => {
  // The old catch block created edges with source:'lsp' confidence:0.9 even when
  // references() threw — that's wrong provenance for a name-match fallback.
  const store = new SqliteGraphStore();
  const target = {
    id: nodeId("src/api.ts", "shared", 1),
    kind: "function" as const,
    name: "shared",
    file: "src/api.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h",
  };
  const caller = {
    id: nodeId("src/impl.ts", "run", 3),
    kind: "function" as const,
    name: "run",
    file: "src/impl.ts",
    start_line: 3,
    end_line: 6,
    content_hash: "h2",
  };
  store.addNode(target);
  store.addNode(caller);
  // Unresolved edge whose name matches the target
  store.addEdge({
    source: caller.id,
    target: "__unresolved__::shared:0",
    kind: "calls",
    provenance: { source: "tree-sitter", confidence: 0.5, evidence: "shared:4:5", content_hash: "h2" },
    created_at: 1000,
  });

  const client: ITsServerClient = {
    async references(): Promise<LspLocation[]> {
      throw new Error("TsServer process exited unexpectedly");
    },
    async definition() { return null; },
    async implementations() { return []; },
    async shutdown() {},
  };

  await resolveMissingCallers(target, store, "/project", client);

  // No lsp-provenance edges should exist — the graph should stay honest
  const lspEdges = store.getEdgesBySource(caller.id).filter((e) => e.provenance.source === "lsp");
  expect(lspEdges).toHaveLength(0);
  store.close();
});

test("symbol_graph Implementations section includes agent-provenance implements edges", async () => {
  // renderImplementationsSuffix used to filter to lsp-only, hiding agent-written edges.
  // After the fix it must show all implements edges regardless of provenance.
  const projectRoot = join(tmpdir(), `pi-cg-agent-impl-${Date.now()}`);
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
    // First call — indexes the project and runs resolveImplementations (sets marker).
    await exec!("tc-a1", { name: "IWorker", file: "src/api.ts" }, undefined, undefined, { cwd: projectRoot });

    const store = mod.getSharedStoreForTesting()!
    const ifaceNode = store.findNodes("IWorker", "src/api.ts")[0]!;
    const implNode = store.findNodes("Worker", "src/impl.ts")[0]!;
    expect(ifaceNode).toBeDefined();
    expect(implNode).toBeDefined();

    // Remove any lsp implements edges so only the agent edge remains
    const existing = store.getNeighbors(ifaceNode.id, { direction: "in", kind: "implements" });
    for (const n of existing) {
      store.deleteEdge(n.edge.source, n.edge.target, n.edge.kind, n.edge.provenance.source);
    }

    // Add an agent-provenance implements edge
    store.addEdge({
      source: implNode.id,
      target: ifaceNode.id,
      kind: "implements",
      provenance: { source: "agent", confidence: 1.0, evidence: "manually confirmed", content_hash: implNode.content_hash },
      created_at: Date.now(),
    });

    // Second call — marker is already set so resolveImplementations is skipped.
    // The suffix is rendered from whatever implements edges are in the store.
    const result2 = await exec!("tc-a2", { name: "IWorker", file: "src/api.ts" }, undefined, undefined, { cwd: projectRoot });
    expect(result2.content[0].text).toContain("Implementations");
    expect(result2.content[0].text).toContain("Worker");
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
