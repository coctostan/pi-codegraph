import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { GraphStore } from "../graph/store.js";
import { computeAnchor, formatAnchorLocation } from "../output/anchoring.js";
import { prependTrustHeader } from "../output/trust.js";
import { extractThrows, extractGuards, extractTestAssertions } from "../indexer/contract-extractor.js";

export interface SymbolContractParams {
  name: string;
  file?: string;
  store: GraphStore;
  projectRoot: string;
}
function parseSignatureParams(signature: string): { params: string[]; returnType: string | null } {
  let s = signature;
  if (s.startsWith("<")) {
    let depth = 0;
    for (let i = 0; i < s.length; i++) {
      if (s[i] === "<") depth++;
      else if (s[i] === ">") {
        depth--;
        if (depth === 0) {
          s = s.slice(i + 1);
          break;
        }
      }
    }
  }
  const arrowIdx = s.indexOf(" => ");
  const returnType = arrowIdx >= 0 ? s.slice(arrowIdx + 4).trim() : null;
  const paramsPart = arrowIdx >= 0 ? s.slice(0, arrowIdx).trim() : s.trim();
  const inner = paramsPart.startsWith("(") && paramsPart.endsWith(")")
    ? paramsPart.slice(1, -1).trim()
    : paramsPart;
  if (!inner) return { params: [], returnType };
  // Split params respecting nested generics
  const params: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of inner) {
    if (ch === "<" || ch === "(") depth++;
    else if (ch === ">" || ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      params.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) params.push(current.trim());

  return { params, returnType };
}

interface InterfaceContractSections {
  methods: string[];
  fields: string[];
}

function splitInterfaceMembers(body: string): string[] {
  const members: string[] = [];
  let current = "";
  let braceDepth = 0;
  let parenDepth = 0;
  let bracketDepth = 0;
  let angleDepth = 0;

  for (const ch of body) {
    if (ch === "{") braceDepth++;
    else if (ch === "}") braceDepth = Math.max(0, braceDepth - 1);
    else if (ch === "(") parenDepth++;
    else if (ch === ")") parenDepth = Math.max(0, parenDepth - 1);
    else if (ch === "[") bracketDepth++;
    else if (ch === "]") bracketDepth = Math.max(0, bracketDepth - 1);
    else if (ch === "<") angleDepth++;
    else if (ch === ">") angleDepth = Math.max(0, angleDepth - 1);

    if (
      ch === ";" &&
      braceDepth === 0 &&
      parenDepth === 0 &&
      bracketDepth === 0 &&
      angleDepth === 0
    ) {
      const member = current.trim();
      if (member) members.push(member.replace(/\s+/g, " ").trim());
      current = "";
      continue;
    }
    current += ch;
  }

  const trailing = current.trim();
  if (trailing) members.push(trailing.replace(/\s+/g, " ").trim());
  return members.filter(Boolean);
}

function extractInterfaceSectionsFromSource(
  fileContent: string,
  startLine: number,
  endLine: number,
): InterfaceContractSections {
  const snippet = fileContent.split(/\r?\n/).slice(startLine - 1, endLine).join("\n");
  const bodyStart = snippet.indexOf("{");
  const bodyEnd = snippet.lastIndexOf("}");
  if (bodyStart === -1 || bodyEnd === -1 || bodyEnd <= bodyStart) {
    return { methods: [], fields: [] };
  }

  const members = splitInterfaceMembers(snippet.slice(bodyStart + 1, bodyEnd));
  return {
    methods: members.filter((member) => member.includes("(")),
    fields: members.filter((member) => !member.includes("(")),
  };
}

function extractInterfaceSectionsFromSignature(signature: string): InterfaceContractSections {
  const members = signature
    .split("\n")
    .slice(1)
    .map((line) => line.trim())
    .filter(Boolean);

  return {
    methods: members.filter((member) => member.includes("(")),
    fields: members.filter((member) => !member.includes("(")),
  };
}

function pushInterfaceContractSections(lines: string[], sections: InterfaceContractSections): void {
  if (sections.methods.length > 0) {
    lines.push("");
    lines.push("### Methods");
    for (const method of sections.methods) lines.push(`  ${method}`);
  }

  if (sections.fields.length > 0) {
    lines.push("");
    lines.push("### Fields");
    for (const field of sections.fields) lines.push(`  ${field}`);
  }
}
export interface RenderedSymbolContract {
  body: string;
  hasLocalExceptions: boolean;
}
export function renderSymbolContractBody(params: SymbolContractParams): RenderedSymbolContract {
  const { name, file, store, projectRoot } = params;
  const nodes = store.findNodes(name, file);
  if (nodes.length === 0) {
    return { body: `Symbol "${name}" not found`, hasLocalExceptions: false };
  }
  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${formatAnchorLocation(anchor)}  ${node.name} (${node.kind})${staleMarker}`);
    }
    const body = `${lines.join("\n")}\n`;
    const hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
    return { body, hasLocalExceptions };
  }
  const node = nodes[0]!;
  const anchor = computeAnchor(node, projectRoot);
  const lines: string[] = [];
  lines.push(`## Contract: ${node.name}`);
  lines.push(formatAnchorLocation(anchor));

  const fullPath = join(projectRoot, node.file);
  let fileContent: string | null = null;
  if (existsSync(fullPath)) {
    try {
      fileContent = readFileSync(fullPath, "utf-8");
    } catch {
      fileContent = null;
    }
  }

  let interfaceSections: InterfaceContractSections | null = null;
  if (node.kind === "interface" && node.signature) {
    const fromSignature = extractInterfaceSectionsFromSignature(node.signature);
    if (fromSignature.methods.length > 0 || fromSignature.fields.length > 0) {
      interfaceSections = fromSignature;
    }
  }
  if (!interfaceSections && node.kind === "interface" && fileContent && node.start_line && node.end_line) {
    const fromSource = extractInterfaceSectionsFromSource(fileContent, node.start_line, node.end_line);
    if (fromSource.methods.length > 0 || fromSource.fields.length > 0) {
      interfaceSections = fromSource;
    }
  }

  if (interfaceSections) {
    pushInterfaceContractSections(lines, interfaceSections);
  } else if (node.signature) {
    const { params: sigParams, returnType } = parseSignatureParams(node.signature);
    if (sigParams.length > 0) {
      lines.push("");
      lines.push("### Takes");
      for (const p of sigParams) lines.push(`  ${p}`);
    }
    if (returnType) {
      lines.push("");
      lines.push("### Returns");
      lines.push(`  ${returnType}`);
    }
  }

  if (fileContent && node.start_line && node.end_line) {
    try {
      const throws = extractThrows(fileContent, node.start_line, node.end_line);
      if (throws.length > 0) {
        lines.push("");
        lines.push("### Throws / Error paths");
        for (const t of throws) lines.push(`  - ${t}`);
      }
      const guards = extractGuards(fileContent, node.start_line, node.end_line);
      if (guards.length > 0) {
        lines.push("");
        lines.push("### Guards / Preconditions");
        for (const g of guards) lines.push(`  - ${g}`);
      }
    } catch {
      // File unreadable — skip throws/guards
    }
  }
  const allNeighbors = store.getNeighbors(node.id);
  const testEdges = allNeighbors.filter(
    (nr) => nr.edge.kind === "tested_by" && nr.edge.source === node.id,
  );
  if (testEdges.length > 0) {
    const allBehaviors: Array<{ testName: string; assertions: string[] }> = [];
    for (const te of testEdges) {
      const testNode = te.node;
      const testPath = join(projectRoot, testNode.file);
      if (!existsSync(testPath)) continue;
      try {
        const testContent = readFileSync(testPath, "utf-8");
        const behaviors = extractTestAssertions(testContent);
        for (const b of behaviors) {
          if (b.testName === testNode.name) allBehaviors.push(b);
        }
      } catch {
        // Test file unreadable — skip
      }
    }
    if (allBehaviors.length > 0) {
      lines.push("");
      lines.push(`### Test-evidenced behaviors (from ${testEdges.length} tests)`);
      for (const b of allBehaviors) {
        lines.push(`  ✓ ${b.testName}`);
        for (const a of b.assertions) lines.push(`    ${a}`);
      }
    }
  }
  return {
    body: lines.join("\n") + "\n",
    hasLocalExceptions: anchor.stale,
  };
}
export function symbolContract(params: SymbolContractParams): string {
  const stats = params.store.getStatistics(params.projectRoot);
  const rendered = renderSymbolContractBody(params);
  return prependTrustHeader(rendered.body, { stats, hasLocalExceptions: rendered.hasLocalExceptions });
}
