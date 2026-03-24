# Learnings — #052 PTC metadata

- Spreading `as any` into a TypeScript object literal poisons the entire object's type inference — `execute` params become `unknown` under strict mode. A wrapper function with post-creation mutation (`(tool as any).ptc = ...`) preserves generic inference while still smuggling in untyped properties.
- `ToolDefinition` from pi-coding-agent is a closed interface with no index signature. Module augmentation would work but is heavier than needed for a single extra property. Runtime mutation via `as any` on one line is the right trade-off.
- Deriving `pythonName` from `tool.name` inside the helper eliminates a category of copy-paste bugs vs. passing the name as a separate argument.
- Mock-based registration tests (capturing `registerTool` calls) are a clean way to verify metadata without needing a full pi runtime or extension loader.
