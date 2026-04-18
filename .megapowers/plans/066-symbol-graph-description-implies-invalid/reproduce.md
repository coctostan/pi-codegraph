# Reproduction: `symbol_graph` docs imply invalid `include: ["tests"]`

## Steps to Reproduce
1. Inspect the registered `symbol_graph` tool surface.
   - `src/index.ts` registers `symbol_graph` with description `Return a symbol's callers, callees, tests, and key signals.` and an `include` schema that only allows `"neighborhood"`, `"contract"`, and `"source"`.
   - Runtime check used during reproduction:
     ```bash
     bun -e 'import piCodegraph from "./src/index.ts";
     const tools=[];
     const mockPi={registerTool(tool){tools.push(tool)}, on(){}};
     piCodegraph(mockPi);
     const sg=tools.find(t=>t.name==="symbol_graph");
     console.log(JSON.stringify({
       description: sg.description,
       include: sg.parameters.properties.include
     }, null, 2));'
     ```
2. Observe the registered tool surface:
   ```json
   {
     "description": "Return a symbol's callers, callees, tests, and key signals.\nWhen to use: You need structural context for a named symbol.",
     "include": {
       "description": "Optional extra sections to append to the response",
       "type": "array",
       "items": {
         "anyOf": [
           { "const": "neighborhood", "type": "string" },
           { "const": "contract", "type": "string" },
           { "const": "source", "type": "string" }
         ]
       }
     }
   }
   ```
3. From that wording, make the plausible first call `symbol_graph({ name: "symbolGraph", file: "src/tools/symbol-graph.ts", include: ["tests"] })`.
4. Observe the validation failure.
5. Retry with a valid include such as `include: ["source"]` and observe that the tool succeeds.

## Expected Behavior
The agent-facing `symbol_graph` docs should make the valid `include` values explicit and should not imply that `"tests"` is a valid include section. A first call based on the docs should not be nudged toward an invalid argument.

## Actual Behavior
The registered tool description says `tests`, while the `include` parameter description does not enumerate allowed values. A plausible first call with `include: ["tests"]` fails validation immediately.

Exact validation output:
```text
Validation failed for tool "symbol_graph":
  - include/0: must be equal to constant
  - include/0: must be equal to constant
  - include/0: must be equal to constant
  - include/0: must match a schema in anyOf

Received arguments:
{
  "name": "symbolGraph",
  "file": "src/tools/symbol-graph.ts",
  "include": [
    "tests"
  ]
}
```

The same call with a valid include succeeds, confirming the failure is specifically the invalid literal:
```text
## symbolGraph (function)
src/tools/symbol-graph.ts:171:288e

### Signature
(params: SymbolGraphParams) => string
```

## Evidence
### Source evidence
`src/index.ts`
- `173:c9c|export default function piCodegraph(pi: ExtensionAPI): void {`
- `178:baf|    description: "Return a symbol's callers, callees, tests, and key signals.\nWhen to use: You need structural context for a named symbol.",`
- `23:137|const SymbolGraphParams = Type.Object({`
- `29:36b|        Type.Literal("neighborhood"),`
- `30:0d0|        Type.Literal("contract"),`
- `31:c25|        Type.Literal("source"),`
- `33:096|      { description: "Optional extra sections to append to the response" },`

`README.md`
- `68:3da|#### \`symbol_graph\``
- `69:ef1|Return a symbol's callers, callees, tests, and key signals.`
- `73:5f1|symbol_graph({ name: "validateToken", include: ["neighborhood"] })`
- `74:6ac|symbol_graph({ name: "validateToken", include: ["contract"] })`
- `75:4e7|symbol_graph({ name: "validateToken", include: ["source"] })`
- `76:219|symbol_graph({ name: "validateToken", include: ["neighborhood", "contract", "source"] })`

### Runtime evidence
Registered tool surface from `bun -e` inspection:
```json
{
  "description": "Return a symbol's callers, callees, tests, and key signals.\nWhen to use: You need structural context for a named symbol.",
  "include": {
    "description": "Optional extra sections to append to the response",
    "type": "array",
    "items": {
      "anyOf": [
        { "const": "neighborhood", "type": "string" },
        { "const": "contract", "type": "string" },
        { "const": "source", "type": "string" }
      ]
    }
  }
}
```

Tool call that fails:
```json
{
  "name": "symbolGraph",
  "file": "src/tools/symbol-graph.ts",
  "include": ["tests"]
}
```

### Recent change check
`git log --oneline -20 -- src/index.ts`
- `3fbd3ca5 feat: unify symbol lookup on symbol_graph (#41)`

`git diff 801e702d 3fbd3ca5 -- src/index.ts README.md` shows that commit removed separate `symbol_card`/`symbol_contract` tools, expanded `symbol_graph.include` to `"neighborhood" | "contract" | "source"`, and kept/introduced the current wording `Return a symbol's callers, callees, tests, and key signals.` in both `src/index.ts` and `README.md`.

## Environment
- OS: Darwin 25.3.0 arm64
- Bun: 1.3.11
- Node: v25.8.2
- Project runtime/test stack: Bun + TypeScript (`AGENTS.md`, `package.json`)

## Failing Test
Candidate regression test (not added during reproduce): `test/symbol-graph-docs-clarity.test.ts`

```ts
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import piCodegraph from "../src/index.js";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";

const read = (path: string) => readFileSync(path, "utf8");

test("symbol_graph docs enumerate valid include values and say tests is invalid", () => {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
    on() {},
  } as any;

  piCodegraph(mockPi);
  const tool = tools.find((candidate) => candidate.name === "symbol_graph");
  if (!tool) throw new Error("symbol_graph was not registered");

  expect(tool.description).not.toContain("callers, callees, tests, and key signals");
  expect(tool.parameters.properties.include.description).toContain('"neighborhood"');
  expect(tool.parameters.properties.include.description).toContain('"contract"');
  expect(tool.parameters.properties.include.description).toContain('"source"');
  expect(tool.parameters.properties.include.description).toContain('"tests" is not a valid include value');

  const readme = read("README.md");
  expect(readme).toContain('"neighborhood"');
  expect(readme).toContain('"contract"');
  expect(readme).toContain('"source"');
  expect(readme).toContain('"tests" is not a valid include value');
});
```

This test fails on the current branch because the registered description still says `tests` and the include description does not enumerate the allowed literals or reject `"tests"` explicitly.

## Reproducibility
Always.
