# Plan

### Task 1: Tokenizer: split camelCase, snake_case, and whitespace

### Task 1: Tokenizer: split camelCase, snake_case, and whitespace

**Files:**
- Create: `src/tools/bm25.ts`
- Create: `test/bm25-tokenizer.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/bm25-tokenizer.test.ts
import { expect, test } from "bun:test";
import { tokenize } from "../src/tools/bm25.js";

test("tokenize splits camelCase into lowercase terms", () => {
  expect(tokenize("getNodesByFile")).toEqual(["get", "nodes", "by", "file"]);
});

test("tokenize splits snake_case into lowercase terms", () => {
  expect(tokenize("content_hash")).toEqual(["content", "hash"]);
});

test("tokenize splits whitespace", () => {
  expect(tokenize("graph store")).toEqual(["graph", "store"]);
});

test("tokenize handles mixed camelCase, snake_case, and whitespace", () => {
  expect(tokenize("myFunc_name here")).toEqual(["my", "func", "name", "here"]);
});

test("tokenize lowercases all terms", () => {
  expect(tokenize("GraphStore")).toEqual(["graph", "store"]);
});

test("tokenize returns empty array for empty string", () => {
  expect(tokenize("")).toEqual([]);
});

test("tokenize handles single word", () => {
  expect(tokenize("foo")).toEqual(["foo"]);
});

test("tokenize handles all-uppercase abbreviations", () => {
  expect(tokenize("parseJSON")).toEqual(["parse", "json"]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/bm25-tokenizer.test.ts`
Expected: FAIL — error: Cannot find module "../src/tools/bm25.js"

**Step 3 — Write minimal implementation**

```typescript
// src/tools/bm25.ts
export function tokenize(input: string): string[] {
  if (!input) return [];
  // Split on whitespace first
  const parts = input.split(/\s+/).filter(Boolean);
  const tokens: string[] = [];
  for (const part of parts) {
    // Split on underscores
    const segments = part.split(/_+/).filter(Boolean);
    for (const seg of segments) {
      // Split camelCase: insert boundary before uppercase letters
      // Handle sequences like "parseJSON" -> "parse", "JSON"
      const camelParts = seg.replace(/([a-z])([A-Z])/g, "$1\0$2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1\0$2")
        .split("\0")
        .filter(Boolean);
      for (const cp of camelParts) {
        tokens.push(cp.toLowerCase());
      }
    }
  }
  return tokens;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/bm25-tokenizer.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 2: BM25 index: weighted field scoring and ranked search [depends: 1]

### Task 2: BM25 index: weighted field scoring and ranked search [depends: 1]

**Files:**
- Modify: `src/tools/bm25.ts`
- Create: `test/bm25-index.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/bm25-index.test.ts
import { expect, test } from "bun:test";
import { BM25Index } from "../src/tools/bm25.js";

test("BM25Index scores exact name match highest", () => {
  const index = new BM25Index();
  index.addDocument("doc1", { name: "graphStore", signature: "class GraphStore", file: "src/graph/store.ts" });
  index.addDocument("doc2", { name: "addNode", signature: "addNode(node: GraphNode): void", file: "src/graph/sqlite.ts" });
  index.addDocument("doc3", { name: "getNode", signature: "getNode(id: string): GraphNode | null", file: "src/graph/sqlite.ts" });
  index.build();

  const results = index.search("graphStore");
  expect(results.length).toBeGreaterThan(0);
  expect(results[0]!.id).toBe("doc1");
  expect(results[0]!.score).toBeGreaterThan(0);
});

test("BM25Index returns results sorted by score descending", () => {
  const index = new BM25Index();
  index.addDocument("a", { name: "foo", signature: "", file: "src/a.ts" });
  index.addDocument("b", { name: "fooBar", signature: "function fooBar(): void", file: "src/b.ts" });
  index.addDocument("c", { name: "baz", signature: "", file: "src/c.ts" });
  index.build();

  const results = index.search("foo");
  expect(results.length).toBeGreaterThan(1);
  // Scores should be descending
  for (let i = 1; i < results.length; i++) {
    expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
  }
});

test("BM25Index respects field weights: name > signature > file", () => {
  const index = new BM25Index();
  // "store" appears only in name
  index.addDocument("nameHit", { name: "store", signature: "", file: "src/a.ts" });
  // "store" appears only in signature
  index.addDocument("sigHit", { name: "foo", signature: "function foo(store: Store): void", file: "src/b.ts" });
  // "store" appears only in file path
  index.addDocument("fileHit", { name: "bar", signature: "", file: "src/store/bar.ts" });
  index.build();

  const results = index.search("store");
  expect(results.length).toBe(3);
  expect(results[0]!.id).toBe("nameHit");
  expect(results[1]!.id).toBe("sigHit");
  expect(results[2]!.id).toBe("fileHit");
});

test("BM25Index multi-term query scores documents matching more terms higher", () => {
  const index = new BM25Index();
  index.addDocument("both", { name: "graphStore", signature: "", file: "src/a.ts" });
  index.addDocument("one", { name: "graphNode", signature: "", file: "src/b.ts" });
  index.build();

  const results = index.search("graph store");
  expect(results[0]!.id).toBe("both");
});

test("BM25Index returns empty array for query with no matches", () => {
  const index = new BM25Index();
  index.addDocument("a", { name: "foo", signature: "", file: "src/a.ts" });
  index.build();

  const results = index.search("zzzzNotExist");
  expect(results).toEqual([]);
});

test("BM25Index respects limit parameter", () => {
  const index = new BM25Index();
  for (let i = 0; i < 30; i++) {
    index.addDocument(`doc${i}`, { name: `foo${i}`, signature: "function foo", file: `src/${i}.ts` });
  }
  index.build();

  const results = index.search("foo", 5);
  expect(results.length).toBe(5);
});

test("BM25Index search returns empty for empty query", () => {
  const index = new BM25Index();
  index.addDocument("a", { name: "foo", signature: "", file: "src/a.ts" });
  index.build();

  expect(index.search("")).toEqual([]);
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/bm25-index.test.ts`
Expected: FAIL — error: BM25Index is not a constructor (or similar import error since it doesn't exist yet)

**Step 3 — Write minimal implementation**

```typescript
// src/tools/bm25.ts  (append to existing file from Task 1)

export interface BM25Document {
  name: string;
  signature: string;
  file: string;
}

export interface BM25Result {
  id: string;
  score: number;
}

interface DocEntry {
  id: string;
  fieldTokens: { name: string[]; signature: string[]; file: string[] };
  fieldLengths: { name: number; signature: number; file: number };
}

const FIELD_WEIGHTS = { name: 3, signature: 2, file: 1 };
const K1 = 1.2;
const B = 0.75;

export class BM25Index {
  private docs: DocEntry[] = [];
  private docFreq: Map<string, { name: number; signature: number; file: number }> = new Map();
  private avgFieldLen = { name: 0, signature: 0, file: 0 };
  private built = false;

  addDocument(id: string, doc: BM25Document): void {
    const nameTokens = tokenize(doc.name);
    const sigTokens = tokenize(doc.signature);
    const fileTokens = tokenize(doc.file.replace(/[/\\.]/g, " "));
    this.docs.push({
      id,
      fieldTokens: { name: nameTokens, signature: sigTokens, file: fileTokens },
      fieldLengths: { name: nameTokens.length, signature: sigTokens.length, file: fileTokens.length },
    });
  }

  build(): void {
    const n = this.docs.length;
    if (n === 0) { this.built = true; return; }

    let totalName = 0, totalSig = 0, totalFile = 0;
    // Collect unique terms per field per doc for document frequency
    for (const doc of this.docs) {
      totalName += doc.fieldLengths.name;
      totalSig += doc.fieldLengths.signature;
      totalFile += doc.fieldLengths.file;

      const seenFields = { name: new Set<string>(), signature: new Set<string>(), file: new Set<string>() };
      for (const t of doc.fieldTokens.name) seenFields.name.add(t);
      for (const t of doc.fieldTokens.signature) seenFields.signature.add(t);
      for (const t of doc.fieldTokens.file) seenFields.file.add(t);

      const allTerms = new Set([...seenFields.name, ...seenFields.signature, ...seenFields.file]);
      for (const term of allTerms) {
        let entry = this.docFreq.get(term);
        if (!entry) { entry = { name: 0, signature: 0, file: 0 }; this.docFreq.set(term, entry); }
        if (seenFields.name.has(term)) entry.name++;
        if (seenFields.signature.has(term)) entry.signature++;
        if (seenFields.file.has(term)) entry.file++;
      }
    }

    this.avgFieldLen = { name: totalName / n, signature: totalSig / n, file: totalFile / n };
    this.built = true;
  }

  search(query: string, limit: number = 20): BM25Result[] {
    if (!this.built) throw new Error("Call build() before search()");
    const terms = tokenize(query);
    if (terms.length === 0) return [];

    const n = this.docs.length;
    const scores: { id: string; score: number }[] = [];

    for (const doc of this.docs) {
      let totalScore = 0;
      for (const term of terms) {
        const df = this.docFreq.get(term);
        if (!df) continue;

        for (const field of ["name", "signature", "file"] as const) {
          const fieldDf = df[field];
          if (fieldDf === 0) continue;

          const tf = doc.fieldTokens[field].filter((t) => t === term).length;
          if (tf === 0) continue;

          const idf = Math.log((n - fieldDf + 0.5) / (fieldDf + 0.5) + 1);
          const fieldLen = doc.fieldLengths[field];
          const avgLen = this.avgFieldLen[field] || 1;
          const tfNorm = (tf * (K1 + 1)) / (tf + K1 * (1 - B + B * (fieldLen / avgLen)));
          totalScore += FIELD_WEIGHTS[field] * idf * tfNorm;
        }
      }
      if (totalScore > 0) scores.push({ id: doc.id, score: totalScore });
    }

    scores.sort((a, b) => b.score - a.score);
    return scores.slice(0, limit).map((s) => ({ id: s.id, score: Math.round(s.score * 1000) / 1000 }));
  }
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/bm25-index.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 3: symbolSearch tool function with lazy index and cache [depends: 2]

### Task 3: symbolSearch tool function with lazy index and cache [depends: 2]

**Files:**
- Create: `src/tools/symbol-search.ts`
- Create: `test/tool-symbol-search.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-search.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolSearch, resetSearchCacheForTesting } from "../src/tools/symbol-search.js";
import type { GraphNode } from "../src/graph/types.js";

function addTestNode(store: SqliteGraphStore, overrides: Partial<GraphNode> & { id: string; name: string; file: string }): void {
  store.addNode({
    kind: "function",
    start_line: 1,
    end_line: 10,
    content_hash: "abc123",
    is_exported: true,
    ...overrides,
  });
  store.setFileHash(overrides.file, "hash1");
}

test("symbolSearch returns ranked results for a partial name match", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::graphStore:1", name: "graphStore", file: "src/a.ts", signature: "class GraphStore" });
    addTestNode(store, { id: "src/b.ts::addNode:1", name: "addNode", file: "src/b.ts", signature: "addNode(node: GraphNode): void" });
    addTestNode(store, { id: "src/c.ts::getNode:1", name: "getNode", file: "src/c.ts", signature: "getNode(id: string): GraphNode" });

    const output = symbolSearch({ query: "graph store", store, projectRoot: "/tmp/test" });
    expect(output).toContain("graphStore");
    expect(output).toContain("src/a.ts");
    expect(output).toContain("function");
  } finally {
    store.close();
  }
});

test("symbolSearch returns empty for no matches", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts" });

    const output = symbolSearch({ query: "zzzzNotExist", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});

test("symbolSearch returns empty for empty query", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts" });

    const output = symbolSearch({ query: "", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});

test("symbolSearch includes signature when present", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:5", name: "foo", file: "src/a.ts", signature: "function foo(x: number): string" });

    const output = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test" });
    expect(output).toContain("function foo(x: number): string");
  } finally {
    store.close();
  }
});

test("symbolSearch respects limit parameter", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    for (let i = 0; i < 10; i++) {
      addTestNode(store, { id: `src/${i}.ts::foo${i}:1`, name: `foo${i}`, file: `src/${i}.ts` });
    }

    const output = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test", limit: 3 });
    // Count result lines (each result has the name in it)
    const matches = output.split("\n").filter((line) => /^\d+\./.test(line.trim()));
    expect(matches.length).toBe(3);
  } finally {
    store.close();
  }
});

test("symbolSearch default limit is 20", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    for (let i = 0; i < 30; i++) {
      addTestNode(store, { id: `src/${i}.ts::foo${i}:1`, name: `foo${i}`, file: `src/${i}.ts` });
    }

    const output = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test" });
    const matches = output.split("\n").filter((line) => /^\d+\./.test(line.trim()));
    expect(matches.length).toBe(20);
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-search.test.ts`
Expected: FAIL — error: Cannot find module "../src/tools/symbol-search.js"

**Step 3 — Write minimal implementation**

```typescript
// src/tools/symbol-search.ts
import type { GraphStore } from "../graph/store.js";
import type { NodeKind } from "../graph/types.js";
import { BM25Index } from "./bm25.js";

export interface SymbolSearchParams {
  query: string;
  kind?: NodeKind;
  file?: string;
  limit?: number;
  store: GraphStore;
  projectRoot: string;
}

interface CachedIndex {
  index: BM25Index;
  nodeMap: Map<string, { name: string; kind: string; file: string; startLine: number; signature?: string }>;
  fingerprint: string;
}

let cachedIndex: CachedIndex | null = null;

export function resetSearchCacheForTesting(): void {
  cachedIndex = null;
}

function computeFingerprint(store: GraphStore): string {
  const stats = store.getStatistics();
  const totalNodes = Object.values(stats.nodes).reduce((a, b) => a + b, 0);
  const totalFiles = stats.files.total;
  return `${totalNodes}:${totalFiles}`;
}

function getOrBuildIndex(store: GraphStore): CachedIndex {
  const fingerprint = computeFingerprint(store);
  if (cachedIndex && cachedIndex.fingerprint === fingerprint) {
    return cachedIndex;
  }

  const rows = store.queryRows<{
    id: string; name: string; kind: string; file: string;
    start_line: number; signature: string | null;
  }>("SELECT id, name, kind, file, start_line, signature FROM nodes ORDER BY id");

  const index = new BM25Index();
  const nodeMap = new Map<string, { name: string; kind: string; file: string; startLine: number; signature?: string }>();

  for (const row of rows) {
    index.addDocument(row.id, {
      name: row.name,
      signature: row.signature ?? "",
      file: row.file,
    });
    nodeMap.set(row.id, {
      name: row.name,
      kind: row.kind,
      file: row.file,
      startLine: row.start_line,
      ...(row.signature ? { signature: row.signature } : {}),
    });
  }

  index.build();
  cachedIndex = { index, nodeMap, fingerprint };
  return cachedIndex;
}

export function symbolSearch(params: SymbolSearchParams): string {
  const { query, limit = 20, store, projectRoot } = params;
  const { index, nodeMap } = getOrBuildIndex(store);

  const rawResults = index.search(query, limit);

  if (rawResults.length === 0) {
    return "No results found.\n";
  }

  const lines: string[] = [];
  lines.push(`## Search Results (${rawResults.length})\n`);

  let rank = 0;
  for (const result of rawResults) {
    const meta = nodeMap.get(result.id);
    if (!meta) continue;
    rank++;
    lines.push(`${rank}. **${meta.name}** (${meta.kind})  score: ${result.score}`);
    lines.push(`   ${meta.file}:${meta.startLine}`);
    if (meta.signature) {
      lines.push(`   ${meta.signature}`);
    }
  }

  return lines.join("\n") + "\n";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 4: Filters: kind and file glob [depends: 3]

### Task 4: Filters: kind and file glob [depends: 3]

**Files:**
- Modify: `src/tools/symbol-search.ts`
- Create: `test/tool-symbol-search-filters.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-search-filters.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolSearch, resetSearchCacheForTesting } from "../src/tools/symbol-search.js";
import type { GraphNode } from "../src/graph/types.js";

function addTestNode(store: SqliteGraphStore, overrides: Partial<GraphNode> & { id: string; name: string; file: string }): void {
  store.addNode({
    kind: "function",
    start_line: 1,
    end_line: 10,
    content_hash: "abc123",
    is_exported: true,
    ...overrides,
  });
  store.setFileHash(overrides.file, "hash1");
}

test("symbolSearch kind filter excludes non-matching kinds", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::graphStore:1", name: "graphStore", file: "src/a.ts", kind: "class" });
    addTestNode(store, { id: "src/b.ts::graphNode:1", name: "graphNode", file: "src/b.ts", kind: "interface" });
    addTestNode(store, { id: "src/c.ts::getGraph:1", name: "getGraph", file: "src/c.ts", kind: "function" });

    const output = symbolSearch({ query: "graph", kind: "class", store, projectRoot: "/tmp/test" });
    expect(output).toContain("graphStore");
    expect(output).not.toContain("graphNode");
    expect(output).not.toContain("getGraph");
  } finally {
    store.close();
  }
});

test("symbolSearch file glob filter narrows results", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/graph/store.ts::graphStore:1", name: "graphStore", file: "src/graph/store.ts" });
    addTestNode(store, { id: "src/tools/foo.ts::graphQuery:1", name: "graphQuery", file: "src/tools/foo.ts" });

    const output = symbolSearch({ query: "graph", file: "src/graph/**", store, projectRoot: "/tmp/test" });
    expect(output).toContain("graphStore");
    expect(output).not.toContain("graphQuery");
  } finally {
    store.close();
  }
});

test("symbolSearch kind filter with no matches returns empty", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts", kind: "function" });

    const output = symbolSearch({ query: "foo", kind: "class", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});

test("symbolSearch file glob filter with no matches returns empty", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts" });

    const output = symbolSearch({ query: "foo", file: "lib/**", store, projectRoot: "/tmp/test" });
    expect(output).toContain("No results");
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-search-filters.test.ts`
Expected: FAIL — the kind and file filters are not yet applied, so excluded symbols will appear in output (assertions like `expect(output).not.toContain("graphNode")` will fail)

**Step 3 — Write minimal implementation**

Update `src/tools/symbol-search.ts` — modify the `symbolSearch` function to apply filters post-scoring:

```typescript
// src/tools/symbol-search.ts — replace the symbolSearch function

function matchGlob(filePath: string, pattern: string): boolean {
  // Convert glob to regex: ** -> match anything, * -> match non-slash
  const regexStr = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "\0")
    .replace(/\*/g, "[^/]*")
    .replace(/\0/g, ".*")
    + "$";
  return new RegExp(regexStr).test(filePath);
}

export function symbolSearch(params: SymbolSearchParams): string {
  const { query, kind, file, limit = 20, store, projectRoot } = params;
  const { index, nodeMap } = getOrBuildIndex(store);

  // Get more results than limit to account for post-filtering
  const fetchLimit = (kind || file) ? Math.max(limit * 5, 200) : limit;
  const rawResults = index.search(query, fetchLimit);

  // Apply post-scoring filters
  const filtered = rawResults.filter((result) => {
    const meta = nodeMap.get(result.id);
    if (!meta) return false;
    if (kind && meta.kind !== kind) return false;
    if (file && !matchGlob(meta.file, file)) return false;
    return true;
  });

  const limited = filtered.slice(0, limit);

  if (limited.length === 0) {
    return "No results found.\n";
  }

  const lines: string[] = [];
  lines.push(`## Search Results (${limited.length})\n`);

  let rank = 0;
  for (const result of limited) {
    const meta = nodeMap.get(result.id)!;
    rank++;
    lines.push(`${rank}. **${meta.name}** (${meta.kind})  score: ${result.score}`);
    lines.push(`   ${meta.file}:${meta.startLine}`);
    if (meta.signature) {
      lines.push(`   ${meta.signature}`);
    }
  }

  return lines.join("\n") + "\n";
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-search-filters.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 5: Cache invalidation on graph re-index [depends: 3]

### Task 5: Cache invalidation on graph re-index [depends: 3]

**Files:**
- Modify: `src/tools/symbol-search.ts` (only if fingerprint logic needs adjustment)
- Create: `test/tool-symbol-search-cache.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/tool-symbol-search-cache.test.ts
import { expect, test } from "bun:test";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolSearch, resetSearchCacheForTesting } from "../src/tools/symbol-search.js";
import type { GraphNode } from "../src/graph/types.js";

function addTestNode(store: SqliteGraphStore, overrides: Partial<GraphNode> & { id: string; name: string; file: string }): void {
  store.addNode({
    kind: "function",
    start_line: 1,
    end_line: 10,
    content_hash: "abc123",
    is_exported: true,
    ...overrides,
  });
  store.setFileHash(overrides.file, "hash1");
}

test("symbolSearch cache invalidates when graph changes", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::foo:1", name: "foo", file: "src/a.ts" });

    // First search — builds index
    const output1 = symbolSearch({ query: "foo", store, projectRoot: "/tmp/test" });
    expect(output1).toContain("foo");

    // "bar" should not exist yet
    const output2 = symbolSearch({ query: "bar", store, projectRoot: "/tmp/test" });
    expect(output2).toContain("No results");

    // Now add a new node — graph has changed
    addTestNode(store, { id: "src/b.ts::bar:1", name: "bar", file: "src/b.ts" });

    // Search again — cache should be invalidated due to new node
    const output3 = symbolSearch({ query: "bar", store, projectRoot: "/tmp/test" });
    expect(output3).toContain("bar");
    expect(output3).toContain("src/b.ts");
  } finally {
    store.close();
  }
});

test("symbolSearch cache reuses index when graph unchanged", () => {
  resetSearchCacheForTesting();
  const store = new SqliteGraphStore();
  try {
    addTestNode(store, { id: "src/a.ts::alpha:1", name: "alpha", file: "src/a.ts" });
    addTestNode(store, { id: "src/b.ts::beta:1", name: "beta", file: "src/b.ts" });

    // First search — builds index
    const output1 = symbolSearch({ query: "alpha", store, projectRoot: "/tmp/test" });
    expect(output1).toContain("alpha");

    // Second search — should reuse cache (same store, no changes)
    const output2 = symbolSearch({ query: "beta", store, projectRoot: "/tmp/test" });
    expect(output2).toContain("beta");
  } finally {
    store.close();
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/tool-symbol-search-cache.test.ts`
Expected: PASS (the fingerprint logic from Task 3 should already handle this based on node count + file count changes). If it fails, the error would be: `expect(received).toContain(expected) — Expected "No results found.\n" to contain "bar"` meaning the cache wasn't invalidated.

Note: This task exists to **verify and lock in** the cache invalidation behavior with a dedicated test, even though the implementation was part of Task 3. If the test passes immediately, that confirms the design is correct.

**Step 3 — Write minimal implementation**

No changes needed if the fingerprint logic from Task 3 (`${totalNodes}:${totalFiles}`) already detects the new node. The `computeFingerprint` function counts total nodes and total files, so adding a node changes the count and invalidates the cache.

If the test unexpectedly fails (e.g. because `getStatistics` doesn't count new unfiled nodes), update `computeFingerprint` in `src/tools/symbol-search.ts`:

```typescript
function computeFingerprint(store: GraphStore): string {
  const rows = store.queryRows<{ cnt: number }>("SELECT COUNT(*) as cnt FROM nodes");
  const fileRows = store.queryRows<{ cnt: number }>("SELECT COUNT(*) as cnt FROM file_hashes");
  return `${rows[0]?.cnt ?? 0}:${fileRows[0]?.cnt ?? 0}`;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/tool-symbol-search-cache.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing

### Task 6: Register symbol_search tool in pi extension [depends: 4]

### Task 6: Register symbol_search tool in pi extension [depends: 4]

**Files:**
- Modify: `src/index.ts`
- Create: `test/extension-symbol-search.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/extension-symbol-search.test.ts
import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import piCodegraph, { resetStoreForTesting } from "../src/index.js";
import type { ExtensionAPI, ToolDefinition } from "@mariozechner/pi-coding-agent";
import { resetSearchCacheForTesting } from "../src/tools/symbol-search.js";

test("symbol_search tool is registered in the extension", () => {
  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;

  resetStoreForTesting();
  resetSearchCacheForTesting();
  piCodegraph(mockPi);

  const searchTool = tools.find((t) => t.name === "symbol_search");
  expect(searchTool).toBeDefined();
  expect(searchTool!.name).toBe("symbol_search");
  expect(searchTool!.description).toContain("search");
});

test("symbol_search tool executes and returns results", async () => {
  const projectRoot = join(tmpdir(), `pi-cg-ext-search-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });
  writeFileSync(join(projectRoot, "src/hello.ts"), "export function helloWorld() { return 1; }\n");

  const tools: ToolDefinition<any>[] = [];
  const mockPi: ExtensionAPI = {
    registerTool(tool: ToolDefinition<any>) {
      tools.push(tool);
    },
  } as any;

  resetStoreForTesting();
  resetSearchCacheForTesting();
  piCodegraph(mockPi);

  const searchTool = tools.find((t) => t.name === "symbol_search")!;

  try {
    const result = await searchTool.execute("call-1", { query: "hello world" }, undefined as any, () => {}, { cwd: projectRoot } as any);
    const text = result.content[0].text as string;
    expect(text).toContain("helloWorld");
  } finally {
    resetStoreForTesting();
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/extension-symbol-search.test.ts`
Expected: FAIL — `expect(searchTool).toBeDefined()` fails because `symbol_search` is not yet registered

**Step 3 — Write minimal implementation**

Add to `src/index.ts`:

1. Add import at top:
```typescript
import { symbolSearch, resetSearchCacheForTesting as _resetSearchCache } from "./tools/symbol-search.js";
```

2. Add params schema after `DeadCodeParams`:
```typescript
const SymbolSearchParams = Type.Object({
  query: Type.String({ description: "Search query (free text, supports partial names)" }),
  kind: Type.Optional(Type.String({ description: "Filter by symbol kind (function, class, interface, etc.)" })),
  file: Type.Optional(Type.String({ description: "Filter by file glob pattern (e.g. src/tools/*)" })),
  limit: Type.Optional(Type.Number({ description: "Maximum results to return (default: 20)" })),
});
```

3. Add `_resetSearchCache()` call inside `resetStoreForTesting()`.

4. Register the tool inside `piCodegraph()`, before the closing `}`:
```typescript
  registerReadOnlyTool(pi, {
    name: "symbol_search",
    label: "Symbol Search",
    description: "Search symbols by approximate name using BM25 ranked scoring. Tokenizes camelCase/snake_case queries and scores against symbol name, signature, and file path.",
    parameters: SymbolSearchParams,
    async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
      const projectRoot = ctx.cwd;
      const store = getOrCreateStore(projectRoot);
      await ensureIndexed(projectRoot, store);
      let output = symbolSearch({
        query: params.query,
        kind: params.kind as any,
        file: params.file,
        limit: params.limit,
        store,
        projectRoot,
      });
      output = indexingFailedNote() + output;
      output = appendTokenMeta("symbol_search", { query: params.query }, output, store, projectRoot);
      return { content: [{ type: "text", text: output }], details: undefined };
    },
  });
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/extension-symbol-search.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
