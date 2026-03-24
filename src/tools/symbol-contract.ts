import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { GraphStore } from "../graph/store.js";
import { computeAnchor } from "../output/anchoring.js";
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

  // Strip leading type params (respecting nested angle brackets)
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

  // Strip parens
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

export function symbolContract(params: SymbolContractParams): string {
  const { name, file, store, projectRoot } = params;
  const stats = store.getStatistics(projectRoot);
  const nodes = store.findNodes(name, file);

  if (nodes.length === 0) {
    return prependTrustHeader(`Symbol "${name}" not found`, { stats });
  }

  if (nodes.length > 1) {
    const lines: string[] = [`Multiple matches for "${name}":\n`];
    for (const node of nodes) {
      const anchor = computeAnchor(node, projectRoot);
      const staleMarker = anchor.stale ? " [stale]" : "";
      lines.push(`  ${anchor.anchor}  ${node.name} (${node.kind})  ${node.file}${staleMarker}`);
    }
    const body = `${lines.join("\n")}\n`;
    const hasLocalExceptions = lines.some((line) => line.includes("[stale]"));
    return prependTrustHeader(body, { stats, hasLocalExceptions });
  }

  const node = nodes[0]!;
  const anchor = computeAnchor(node, projectRoot);
  const lines: string[] = [];

  // Header
  lines.push(`## Contract: ${node.name}`);
  lines.push(anchor.anchor);

  // Takes / Returns from signature
  if (node.signature) {
    const { params: sigParams, returnType } = parseSignatureParams(node.signature);
    if (sigParams.length > 0) {
      lines.push("");
      lines.push("### Takes");
      for (const p of sigParams) {
        lines.push(`  ${p}`);
      }
    }
    if (returnType) {
      lines.push("");
      lines.push("### Returns");
      lines.push(`  ${returnType}`);
    }
  }

  // Throws and Guards from function body
  const fullPath = join(projectRoot, node.file);
  if (existsSync(fullPath) && node.start_line && node.end_line) {
    try {
      const fileContent = readFileSync(fullPath, "utf-8");
      const throws = extractThrows(fileContent, node.start_line, node.end_line);
      if (throws.length > 0) {
        lines.push("");
        lines.push("### Throws / Error paths");
        for (const t of throws) {
          lines.push(`  - ${t}`);
        }
      }

      const guards = extractGuards(fileContent, node.start_line, node.end_line);
      if (guards.length > 0) {
        lines.push("");
        lines.push("### Guards / Preconditions");
        for (const g of guards) {
          lines.push(`  - ${g}`);
        }
      }
    } catch {
      // File unreadable — skip throws/guards
    }
  }

  // Test-evidenced behaviors
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
          if (b.testName === testNode.name) {
            allBehaviors.push(b);
          }
        }
      } catch {
        // Test file unreadable — skip
      }
    }

    if (allBehaviors.length > 0) {
      lines.push("");
      lines.push(`### Test-evidenced behaviors (from ${testEdges.length} tests)`);
      for (const b of allBehaviors) {
        lines.push(`  \u2713 ${b.testName}`);
        for (const a of b.assertions) {
          lines.push(`    ${a}`);
        }
      }
    }
  }

  const body = lines.join("\n") + "\n";
  return prependTrustHeader(body, { stats, hasLocalExceptions: anchor.stale });
}
