---
id: 3
title: Contract extractor — test assertion mining
status: approved
depends_on:
  - 1
no_test: false
files_to_modify:
  - src/indexer/contract-extractor.ts
files_to_create:
  - test/contract-extractor-assertions.test.ts
---

**Files:**
- Modify: `src/indexer/contract-extractor.ts`
- Create: `test/contract-extractor-assertions.test.ts`

**Step 1 — Write the failing test**

```typescript
// test/contract-extractor-assertions.test.ts
import { expect, test } from "bun:test";
import { extractTestAssertions, type TestBehavior } from "../src/indexer/contract-extractor.js";

test("extractTestAssertions extracts expect().toBe()", () => {
  const code = `test("returns hello", () => {
  const result = greet("world");
  expect(result).toBe("hello world");
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.testName).toBe("returns hello");
  expect(result[0]!.assertions).toHaveLength(1);
  expect(result[0]!.assertions[0]).toContain("toBe");
});

test("extractTestAssertions extracts expect().toThrow()", () => {
  const code = `test("throws on bad input", () => {
  expect(() => parse("")).toThrow("invalid");
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.testName).toBe("throws on bad input");
  expect(result[0]!.assertions[0]).toContain("toThrow");
});

test("extractTestAssertions extracts expect().toContain()", () => {
  const code = `test("includes item", () => {
  expect(list()).toContain("foo");
});`;
  const result = extractTestAssertions(code);
  expect(result[0]!.assertions[0]).toContain("toContain");
});

test("extractTestAssertions extracts expect().toHaveLength()", () => {
  const code = `test("has three items", () => {
  expect(items()).toHaveLength(3);
});`;
  const result = extractTestAssertions(code);
  expect(result[0]!.assertions[0]).toContain("toHaveLength");
});

test("extractTestAssertions groups by test name", () => {
  const code = `test("first test", () => {
  expect(a).toBe(1);
  expect(b).toBe(2);
});
test("second test", () => {
  expect(c).toContain("x");
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(2);
  expect(result[0]!.testName).toBe("first test");
  expect(result[0]!.assertions).toHaveLength(2);
  expect(result[1]!.testName).toBe("second test");
  expect(result[1]!.assertions).toHaveLength(1);
});

test("extractTestAssertions returns empty for no assertions", () => {
  const code = `test("does something", () => {
  doStuff();
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.assertions).toHaveLength(0);
});

test("extractTestAssertions handles it() blocks", () => {
  const code = `it("should work", () => {
  expect(foo()).toBe(true);
});`;
  const result = extractTestAssertions(code);
  expect(result).toHaveLength(1);
  expect(result[0]!.testName).toBe("should work");
});
```

**Step 2 — Run test, verify it fails**
Run: `bun test test/contract-extractor-assertions.test.ts`
Expected: FAIL — `error: "extractTestAssertions" is not exported from module`

**Step 3 — Write minimal implementation**

Add to `src/indexer/contract-extractor.ts`:

```typescript
export interface TestBehavior {
  testName: string;
  assertions: string[];
}

const SUPPORTED_MATCHERS = new Set(["toBe", "toThrow", "toContain", "toHaveLength"]);

export function extractTestAssertions(fileContent: string): TestBehavior[] {
  const parser = getParser();
  const tree = parser.parse(fileContent);
  const behaviors: TestBehavior[] = [];

  // Find test() or it() call expressions at top level
  walk(tree.rootNode, (n) => {
    if (n.type !== "call_expression") return;
    const fn = n.childForFieldName("function");
    if (!fn || (fn.text !== "test" && fn.text !== "it")) return;

    const args = n.childForFieldName("arguments");
    if (!args) return;

    // First arg is the test name string
    const nameArg = args.namedChildren[0];
    if (!nameArg || (nameArg.type !== "string" && nameArg.type !== "template_string")) return;
    const testName = nameArg.text.replace(/^['"`]|['"`]$/g, "");

    // Second arg is the callback — find expect() calls in it
    const callback = args.namedChildren[1];
    if (!callback) {
      behaviors.push({ testName, assertions: [] });
      return;
    }

    const assertions: string[] = [];
    walk(callback, (inner) => {
      if (inner.type !== "call_expression") return;
      const innerFn = inner.childForFieldName("function");
      if (!innerFn || innerFn.type !== "member_expression") return;

      const prop = innerFn.childForFieldName("property");
      if (!prop || !SUPPORTED_MATCHERS.has(prop.text)) return;

      // Check that the chain starts with expect()
      const obj = innerFn.childForFieldName("object");
      if (!obj) return;

      let hasExpect = false;
      walk(obj, (e) => {
        if (e.type === "call_expression") {
          const eFn = e.childForFieldName("function");
          if (eFn?.text === "expect") hasExpect = true;
        }
      });
      if (!hasExpect) return;

      // Build assertion string
      const matcherArgs = inner.childForFieldName("arguments");
      const argText = matcherArgs?.namedChildren.map((c) => {
        const t = c.text;
        return t.length > 40 ? t.slice(0, 37) + "..." : t;
      }).join(", ") ?? "";
      assertions.push(`${prop.text}(${argText})`);
    });

    behaviors.push({ testName, assertions });
  });

  return behaviors;
}
```

**Step 4 — Run test, verify it passes**
Run: `bun test test/contract-extractor-assertions.test.ts`
Expected: PASS

**Step 5 — Verify no regressions**
Run: `bun test`
Expected: all passing
