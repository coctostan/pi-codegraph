import { expect, test } from "bun:test";

import { nodeId } from "../src/graph/types.js";
import { extractFile, extractFunctionAt } from "../src/indexer/tree-sitter.js";

const FILE = "src/store.ts";
const SRC = [
  "declare function helper(): void;",
  "export class Store {",
  "  private handler = (n: number) => this.load(n);",
  "  #secret() { helper(); }",
  "  static create() { return 1; }",
  "  get size() { return this.count(); }",
  "  set size(v: number) {}",
  "  constructor(private base: number) { this.#secret(); }",
  "  load(n: number): number {",
  "    helper();",
  "    this.inherited();",
  "    return [n].map(() => this.count())[0]!;",
  "  }",
  "  count() {",
  "    return [1].map(function () { return this.load(1); }).length;",
  "  }",
  "  [\"computed\"]() { helper(); }",
  "  label = String(1);",
  "  overload(): void;",
  "  overload(a?: number) {}",
  "}",
  "export function outer() {",
  "  class Inner { run() { helper(); } }",
  "  helper();",
  "}",
  "export const Anon = class { run() { helper(); } };",
  "export abstract class Base { run() { helper(); } }",
];
const content = SRC.join("\n");
const lineOf = (text: string) => SRC.findIndex((l) => l.includes(text)) + 1;
const id = (name: string, text: string) => nodeId(FILE, name, lineOf(text));
const unresolved = (name: string) => nodeId("__unresolved__", name, 0);
const calls = (source: string) =>
  extractFile(FILE, content)
    .edges.filter((e) => e.kind === "calls" && e.source === source)
    .map((e) => e.target);

test("each method, static, accessor, constructor and arrow field of a named class is a function node named Class.member", () => {
  const members = extractFile(FILE, content).nodes.filter((n) => n.name.includes("."));
  expect(members.map((n) => [n.name, n.start_line, n.end_line, n.kind, n.is_exported])).toEqual([
    ["Store.handler", lineOf("handler ="), lineOf("handler ="), "function", false],
    ["Store.#secret", lineOf("#secret()"), lineOf("#secret()"), "function", false],
    ["Store.create", lineOf("create()"), lineOf("create()"), "function", false],
    ["Store.size", lineOf("get size"), lineOf("get size"), "function", false],
    ["Store.size", lineOf("set size"), lineOf("set size"), "function", false],
    ["Store.constructor", lineOf("constructor("), lineOf("constructor("), "function", false],
    ["Store.load", lineOf("load(n: number): number"), lineOf("load(n: number): number") + 4, "function", false],
    ["Store.count", lineOf("count() {"), lineOf("count() {") + 2, "function", false],
    ["Store.overload", lineOf("overload(a?"), lineOf("overload(a?"), "function", false],
    ["Inner.run", lineOf("class Inner"), lineOf("class Inner"), "function", false],
  ]);
  expect(members.find((n) => n.name === "Store.load")?.signature).toBe("(n: number) => number");
});

test("a member's calls are filed under it, a this-call to a member its class declares resolved", () => {
  expect(calls(id("Store.load", "load(n: number): number"))).toEqual([
    unresolved("helper"),
    unresolved("inherited"),
    id("Store.count", "count() {"),
  ]);
  expect(calls(id("Store.handler", "handler ="))).toEqual([id("Store.load", "load(n: number): number")]);
  expect(calls(id("Store.constructor", "constructor("))).toEqual([id("Store.#secret", "#secret()")]);
  expect(calls(id("Store.size", "get size"))).toEqual([id("Store.count", "count() {")]);
});

test("a static member's this-call reaches the static side, an instance member's the instance side, a getter over its setter", () => {
  const pair = [
    "class Pair {",
    "  static m() {}",
    "  m() {}",
    "  get a() { return () => 1; }",
    "  set a(v) {}",
    "  static run() { this.m(); }",
    "  run() { this.m(); this.a(); }",
    "}",
  ].join("\n");
  const edges = extractFile(FILE, pair).edges.filter((e) => e.kind === "calls");
  expect(edges.map((e) => [e.source, e.target])).toEqual([
    [nodeId(FILE, "Pair.run", 6), nodeId(FILE, "Pair.m", 2)],
    [nodeId(FILE, "Pair.run", 7), nodeId(FILE, "Pair.m", 3)],
    [nodeId(FILE, "Pair.run", 7), nodeId(FILE, "Pair.a", 4)],
  ]);
});

test("this inside a plain function is no class's, so its call is dropped as any other object's", () => {
  expect(calls(id("Store.count", "count() {"))).toEqual([]);
});

test("a nested class's method keeps its calls from the enclosing function", () => {
  expect(calls(id("Inner.run", "class Inner"))).toEqual([unresolved("helper")]);
  expect(calls(id("outer", "function outer"))).toEqual([unresolved("helper")]);
});

test("a line in a member finds that member as its own node; a line in a callback inside it finds the callback", () => {
  for (const [text, name] of [
    ["this.inherited()", "Store.load"],
    ["handler =", "Store.handler"],
    ["#secret()", "Store.#secret"],
  ] as const) {
    const at = extractFunctionAt(FILE, content, lineOf(text));
    expect(at.kind).toBe("one");
    if (at.kind !== "one") continue;
    expect([at.fn.name, at.fn.own]).toEqual([name, true]);
  }
  const callback = extractFunctionAt(FILE, content, lineOf("map(() => this.count())"));
  expect(callback.kind).toBe("one");
  if (callback.kind !== "one") return;
  expect([callback.fn.name, callback.fn.own, callback.fn.ownerId]).toEqual(["<anonymous>", false, id("Store.load", "load(n: number): number")]);
  expect(callback.fn.calls.map((e) => e.target)).toEqual([id("Store.count", "count() {")]);
});

test("another object's member call is a hidden member call per call site; a package's, a global's or a literal's chain is none", () => {
  const src = [
    'import { readFileSync } from "node:fs";',
    'import * as path from "node:path";',
    "class Sub extends Base {",
    "  run(store: Store) {",
    "    store.get(1);",
    "    store.get(2)!.close();",
    "    this.db.prepare();",
    "    super.run();",
    "    new Store().load();",
    "    readFileSync('x').toString();",
    "    path.join('a').split('/');",
    "    JSON.parse('{}').x();",
    "    console.log([1].map(String), 'a'.trim(), `b`.trim());",
    "  }",
    "}",
  ].join("\n");
  const member = (name: string, from: number) => nodeId("__member__", name, src.indexOf(name, from));
  const edges = extractFile(FILE, src).edges.filter((e) => e.kind === "calls");
  expect(edges.map((e) => [e.target, e.provenance.evidence])).toEqual([
    [member("get", 0), "get:5:11"],
    [member("close", 0), "close:6:19"],
    [member("get", src.indexOf("get(2)")), "get:6:11"],
    [member("prepare", 0), "prepare:7:13"],
    [member("run", src.indexOf("super")), "run:8:11"],
    [member("load", 0), "load:9:17"],
    [unresolved("Store"), "Store:9:9"],
  ]);
});
