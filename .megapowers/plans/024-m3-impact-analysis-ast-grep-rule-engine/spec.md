## Goal
Build two M3 capabilities for the TypeScript symbol graph: an `impact` tool that reports downstream dependents of changed symbols with depth-aware classifications, and a Stage 3 ast-grep indexer that adds framework-aware graph relationships from bundled and project-local YAML rules. This gives agents a testable way to answer “what breaks if this changes?” and enriches the graph with endpoint and render relationships that tree-sitter alone does not capture.

## Acceptance Criteria
1. The `impact` tool accepts one or more changed symbols, a caller-specified `changeType`, and an optional `maxDepth`.
2. The `impact` tool traverses inbound `calls` edges from each changed symbol and returns only dependent symbols reachable within `maxDepth`.
3. The `impact` tool includes the traversal depth for every returned dependent symbol.
4. For `changeType = "signature_change"`, direct dependents at depth 1 are classified as `breaking`.
5. For `changeType = "signature_change"`, dependents at depth greater than 1 are classified as `behavioral`.
6. For `changeType = "removal"`, direct dependents at depth 1 are classified as `breaking`.
7. For `changeType = "removal"`, dependents at depth greater than 1 are classified as `behavioral`.
8. For `changeType = "behavior_change"`, all returned dependents are classified as `behavioral` regardless of depth.
9. For `changeType = "addition"`, the `impact` tool returns no dependents and performs no graph traversal.
10. The `impact` tool terminates on cyclic dependency graphs without returning duplicate dependents for the same source symbol.
11. Every `impact` result is anchored to the current file content using the existing output anchoring format.
12. The graph schema supports `endpoint` nodes.
13. The graph schema supports `routes_to` edges.
14. The graph schema supports `renders` edges.
15. The graph schema supports `ast-grep` as an edge provenance source.
16. The Stage 3 indexer loads bundled rule files from `src/rules/`.
17. The Stage 3 indexer loads additional user-defined rule files from `.codegraph/rules/*.yaml` when present.
18. A valid rule can declare an edge source using `from_capture`.
19. A valid rule can declare an edge source using `from_context: enclosing_function`.
20. A valid rule can declare an edge target using `to_capture`.
21. A valid rule can declare an edge target using `to_template`.
22. Invalid rule files are rejected with a specific validation error that identifies the offending file.
23. The Stage 3 indexer invokes ast-grep through the `sg` subprocess boundary rather than a native library binding.
24. The Stage 3 indexer can scan only the files whose content hashes changed in the current indexing run.
25. Before rescanning a changed file, the Stage 3 indexer removes existing `ast-grep`-sourced edges associated with that file.
26. Re-indexing an unchanged file set does not create duplicate `ast-grep`-sourced edges.
27. A bundled Express route rule creates an `endpoint` node for a matched route.
28. Express endpoint node IDs use the format `endpoint:{METHOD}:{path}`.
29. A bundled Express route rule creates a `routes_to` edge from each matched handler to the derived endpoint node.
30. A bundled React render rule creates a `renders` edge from the enclosing function component to the matched rendered component.
31. `from_context: enclosing_function` resolves by finding a graph node in the same file whose line range contains the ast-grep match line.
32. Stage 3 indexer outputs are persisted in the same graph store used by the existing indexing pipeline.
33. The indexing pipeline runs the ast-grep Stage 3 indexer after tree-sitter indexing.
34. A unit test covers the `impact` classification matrix across `signature_change`, `removal`, `behavior_change`, and `addition`.
35. A unit test verifies the `impact` tool respects `maxDepth`.
36. A unit test verifies the `impact` tool handles call-graph cycles without hanging.
37. A unit test verifies rule loading merges bundled rules with project-local rules.
38. A unit test verifies rule validation fails on missing required fields.
39. A unit test verifies match processing can create edges from fixture ast-grep JSON without invoking the subprocess.
40. An integration test with a TypeScript Express fixture produces the expected `endpoint` node and `routes_to` edge.
41. An integration test with a TSX React fixture produces the expected `renders` edge.
42. An integration test verifies changing a previously indexed file removes stale `ast-grep` edges for that file and replaces them with current matches.

## Out of Scope
- Automatic signature diffing from stored type metadata.
- Non-TypeScript or non-TSX framework support.
- Additional bundled framework rules beyond Express routes and React renders.
- Graph query, trace, or test coverage features from later milestones.
- Live file watching or background re-indexing.
- Using `@ast-grep/napi` or any other in-process ast-grep binding.
- Human-oriented prose output formats for `impact`; this remains structured, anchored output.

## Open Questions
