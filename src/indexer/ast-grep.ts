import { existsSync, readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { isAbsolute, join, relative } from "node:path";
import type { GraphStore } from "../graph/store.js";
import type { GraphNode } from "../graph/types.js";

export interface AstGrepRule {
  name: string;
  pattern: string;
  lang: string;
  produces: {
    edge_kind: "routes_to" | "renders";
    from_capture?: string;
    from_context?: "enclosing_function";
    to_capture?: string;
    to_template?: string;
    confidence: number;
  };
}

export interface LoadRulesOptions {
  bundledDir: string;
  projectRoot: string;
}

function listRuleFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => name.endsWith(".yaml") || name.endsWith(".yml"))
    .map((name) => join(dir, name));
}

function validateRuleFile(filePath: string, raw: unknown): AstGrepRule[] {
  if (!Array.isArray(raw)) throw new Error(`Invalid rule file ${filePath}: expected YAML array`);
  return raw.map((entry) => {
    if (!entry || typeof entry !== "object") throw new Error(`Invalid rule file ${filePath}: expected object item`);
    const rule = entry as any;
    if (!rule.name) throw new Error(`Invalid rule file ${filePath}: missing name`);
    if (!rule.pattern) throw new Error(`Invalid rule file ${filePath}: missing pattern`);
    if (!rule.lang) throw new Error(`Invalid rule file ${filePath}: missing lang`);
    if (!rule.produces?.edge_kind) throw new Error(`Invalid rule file ${filePath}: missing produces.edge_kind`);
    const allowedEdgeKinds = ["routes_to", "renders"];
    if (!allowedEdgeKinds.includes(rule.produces.edge_kind)) {
      throw new Error(`Invalid rule file ${filePath}: unsupported produces.edge_kind ${rule.produces.edge_kind}`);
    }
    if (typeof rule.produces?.confidence !== "number") throw new Error(`Invalid rule file ${filePath}: missing produces.confidence`);
    const hasFromCapture = typeof rule.produces.from_capture === "string";
    const hasFromContext = typeof rule.produces.from_context === "string";
    if (hasFromCapture === hasFromContext) {
      throw new Error(`Invalid rule file ${filePath}: specify exactly one of produces.from_capture or produces.from_context`);
    }
    const hasToCapture = typeof rule.produces.to_capture === "string";
    const hasToTemplate = typeof rule.produces.to_template === "string";
    if (hasToCapture === hasToTemplate) {
      throw new Error(`Invalid rule file ${filePath}: specify exactly one of produces.to_capture or produces.to_template`);
    }
    if (hasFromContext && rule.produces.from_context !== "enclosing_function") {
      throw new Error(`Invalid rule file ${filePath}: unsupported produces.from_context ${rule.produces.from_context}`);
    }
    return rule as AstGrepRule;
  });
}

function readRuleFile(filePath: string): AstGrepRule[] {
  if (typeof (Bun as any).YAML?.parse !== "function") {
    throw new Error("Bun.YAML.parse is unavailable in this runtime");
  }
  let raw: unknown;
  try {
    raw = (Bun as any).YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid rule file ${filePath}: ${message}`);
  }
  return validateRuleFile(filePath, raw);
}

export function loadRules(options: LoadRulesOptions): AstGrepRule[] {
  const userDir = join(options.projectRoot, ".codegraph", "rules");
  const files = [...listRuleFiles(options.bundledDir), ...listRuleFiles(userDir)];
  return files.flatMap(readRuleFile).sort((a, b) => a.name.localeCompare(b.name));
}

interface RawSgMatch {
  file: string;
  range: { start: { line: number; column: number } };
  metaVariables?: {
    single?: Record<string, { text: string }>;
    multi?: Record<string, Array<{ text: string }>>;
  };
}

export interface SgMatch {
  file: string;
  line: number;
  column: number;
  metaVariables: Record<string, string | string[]>;
}

export type ExecFn = (cmd: string[], opts: { cwd: string }) => Promise<string>;

async function defaultExec(cmd: string[], opts: { cwd: string }): Promise<string> {
  let proc: ReturnType<typeof Bun.spawn>;
  try {
    proc = Bun.spawn(cmd, { cwd: opts.cwd, stdout: "pipe", stderr: "pipe" });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to launch sg. Is ast-grep installed? ${message}`);
  }
  const stdout = await new Response(proc.stdout as ReadableStream<Uint8Array>).text();
  const stderr = await new Response(proc.stderr as ReadableStream<Uint8Array>).text();
  const code = await proc.exited;
  // sg exits 1 when no matches found (like grep) — treat 0 and 1 as success
  if (code > 1) throw new Error(`sg failed (${code}): ${stderr.trim() || stdout.trim()}`);
  return stdout;
}

function toProjectRelative(projectRoot: string, file: string): string {
  if (!isAbsolute(file)) return file;
  return relative(projectRoot, file).split("\\").join("/");
}

function normalizeSgMatch(projectRoot: string, raw: RawSgMatch): SgMatch {
  if (!raw.range?.start) throw new Error("Invalid sg JSON output: missing range.start");
  const metaVariables: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(raw.metaVariables?.single ?? {})) metaVariables[k] = v.text;
  for (const [k, v] of Object.entries(raw.metaVariables?.multi ?? {})) metaVariables[k] = v.map((x) => x.text);
  return {
    file: toProjectRelative(projectRoot, raw.file),
    line: raw.range.start.line + 1,
    column: raw.range.start.column + 1,
    metaVariables,
  };
}

export async function runScan(
  projectRoot: string,
  rule: AstGrepRule,
  files: string[],
  execFn: ExecFn = defaultExec,
): Promise<SgMatch[]> {
  if (files.length === 0) return [];
  const cmd = ["sg", "run", "--json", "--lang", rule.lang, "--pattern", rule.pattern, ...files];
  let stdout: string;
  try {
    stdout = await execFn(cmd, { cwd: projectRoot });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`sg invocation failed: ${message}`);
  }
  // sg outputs empty string (not "[]") when no matches found — treat as empty result
  if (!stdout.trim()) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid sg JSON output: ${message}`);
  }
  if (!Array.isArray(parsed)) throw new Error("Invalid sg JSON output: expected array");
  return (parsed as RawSgMatch[]).map((raw) => normalizeSgMatch(projectRoot, raw));
}

function metaValue(meta: Record<string, string | string[]>, key: string): string | null {
  const value = meta[key];
  if (typeof value === "string") return value;
  if (Array.isArray(value) && value.length > 0) return String(value[0]);
  return null;
}

function metaValues(meta: Record<string, string | string[]>, key: string): string[] {
  const value = meta[key];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.map(String);
  return [];
}

function renderTemplate(template: string, meta: Record<string, string | string[]>): string {
  return template.replace(/\{([A-Z_]+)\}/g, (_, key: string) => {
    const value = meta[key];
    if (typeof value === "string") return value;
    if (Array.isArray(value) && value.length > 0) return String(value[0]);
    return "";
  });
}

function applyRoutesToMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  for (const match of matches) {
    const rawMethod = metaValue(match.metaVariables, "METHOD");
    const rawPath = metaValue(match.metaVariables, "PATH");
    if (!rawMethod || !rawPath) continue;
    const method = rawMethod.toUpperCase();
    const path = rawPath.replace(/^['"]|['"]$/g, "");
    const endpointId = renderTemplate(rule.produces.to_template!, { ...match.metaVariables, METHOD: method, PATH: path });

    for (const handlerName of metaValues(match.metaVariables, rule.produces.from_capture ?? "")) {
      const handlerNode = store.findNodes(handlerName, match.file)[0];
      if (!handlerNode) continue;
      const endpointNode: GraphNode = {
        id: endpointId,
        kind: "endpoint",
        name: endpointId,
        file: match.file,
        start_line: match.line,
        end_line: match.line,
        content_hash: handlerNode.content_hash,
      };
      store.addNode(endpointNode);
      store.addEdge({
        source: handlerNode.id,
        target: endpointId,
        kind: "routes_to",
        provenance: {
          source: "ast-grep",
          confidence: rule.produces.confidence,
          evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`,
          content_hash: handlerNode.content_hash,
        },
        created_at: Date.now(),
      });
    }
  }
}

function smallestContainingFunction(nodes: import("../graph/types.js").GraphNode[], line: number): import("../graph/types.js").GraphNode | null {
  const candidates = nodes.filter(
    (n) => n.kind === "function" && n.start_line <= line && (n.end_line ?? n.start_line) >= line,
  );
  if (candidates.length === 0) return null;
  const span = (n: GraphNode) => (n.end_line ?? n.start_line) - n.start_line;
  return candidates.sort(
    (a, b) => span(a) - span(b) || a.start_line - b.start_line || a.id.localeCompare(b.id),
  )[0]!;
}

function applyRendersMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  for (const match of matches) {
    const targetName = metaValue(match.metaVariables, rule.produces.to_capture ?? "");
    if (!targetName) continue;
    const sourceNode = smallestContainingFunction(store.getNodesByFile(match.file), match.line);
    if (!sourceNode) continue;
    const targetNode = store.findNodes(targetName, match.file)[0];
    if (!targetNode) continue;
    store.addEdge({
      source: sourceNode.id,
      target: targetNode.id,
      kind: "renders",
      provenance: {
        source: "ast-grep",
        confidence: rule.produces.confidence,
        evidence: `${rule.name}@${match.file}:${match.line}:${match.column}`,
        content_hash: sourceNode.content_hash,
      },
      created_at: Date.now(),
    });
  }
}
export function applyRuleMatches(store: GraphStore, rule: AstGrepRule, matches: SgMatch[]): void {
  if (rule.produces.edge_kind === "routes_to") return applyRoutesToMatches(store, rule, matches);
  if (rule.produces.edge_kind === "renders") return applyRendersMatches(store, rule, matches);
}

export async function runAstGrepIndexStage(
  store: GraphStore,
  projectRoot: string,
  files: string[],
  scanFn: typeof runScan = runScan,
): Promise<void> {
  if (files.length === 0) return;
  const bundledDir = fileURLToPath(new URL("../rules/", import.meta.url));
  const rules = loadRules({ bundledDir, projectRoot });
  for (const rule of rules) {
    const matches = await scanFn(projectRoot, rule, files);
    applyRuleMatches(store, rule, matches);
  }
}