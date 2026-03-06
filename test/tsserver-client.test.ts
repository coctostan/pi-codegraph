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
