---
id: 2
title: "BM25 index: weighted field scoring and ranked search"
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/tools/bm25.ts
files_to_create:
  - test/bm25-index.test.ts
---

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
