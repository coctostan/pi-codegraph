# Implement Task 007

Completed Task 7: Document the normalized tool surface.

## Changes
- Added `docs/tool-descriptions.md` as the source-of-truth style guide for terse tool descriptions and `When to use:` blocks.
- Updated `README.md` to describe the 11 registered tools in code order, add examples for `graph_overview`, `dead_code`, and `symbol_search`, and reconcile install/project-structure text with the current tool surface.
- Updated `ARCHITECTURE.md` to list all 11 registered tools in the system overview, point the output layer to the new style guide, and refresh the file-layout inventory to the current tool modules.

## Verification Log
- DOC CHECK: `bun -e 'import { readFileSync } from "node:fs"; const read = (path) => readFileSync(path, "utf8"); const tools = ["symbol_graph", "resolve_edge", "delete_edge", "impact", "trace", "graph_query", "symbol_card", "symbol_contract", "graph_overview", "dead_code", "symbol_search"]; const readme = read("README.md"); const architecture = read("ARCHITECTURE.md"); const guide = read("docs/tool-descriptions.md"); for (const tool of tools) { if (!readme.includes(`### \`${tool}\``)) throw new Error(`README.md missing ${tool}`); if (!architecture.includes(tool)) throw new Error(`ARCHITECTURE.md missing ${tool}`); } if (!architecture.includes("docs/tool-descriptions.md")) throw new Error("ARCHITECTURE.md missing tool description guide pointer"); if (!guide.includes("When to use:")) throw new Error("docs/tool-descriptions.md missing style-guide rule text");'` passed.
- REGRESSION: `bun test && bun run check` passed (`422 pass, 0 fail`; `tsc --noEmit` clean).
