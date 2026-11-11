import { Database } from "bun:sqlite";
import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GIT_HEAD_METADATA_KEY, SCHEMA_VERSION, SqliteGraphStore } from "../src/graph/sqlite.js";
import { extractFile } from "../src/indexer/tree-sitter.js";

const calleesOf = (source: string, fn: string): string[] =>
  extractFile("src/x.ts", source)
    .edges.filter((e) => e.kind === "calls" && e.source.split("::")[1]?.startsWith(`${fn}:`))
    .map((e) => e.target.split("::")[1]!.replace(/:0$/, ""))
    .sort();

test("calls to names imported from a package or node: specifier make no calls edge", () => {
  const source = [
    'import { readFileSync, join as joinPath } from "node:fs";',
    'import Parser from "tree-sitter";',
    'import * as os from "node:os";',
    'import { expect } from "bun:test";',
    'import { Type } from "@sinclair/typebox";',
    'import { parse } from "yaml";',
    "export function run() {",
    "  readFileSync(joinPath('a', 'b'));",
    "  new Parser();",
    "  os.tmpdir();",
    "  expect(1);",
    "  Type();",
    "  parse('x');",
    "}",
  ].join("\n");
  expect(calleesOf(source, "run")).toEqual([]);
});

test("calls to JS and runtime globals the file neither declares nor imports make no calls edge", () => {
  const source = [
    "export function run() {",
    "  setTimeout(() => {}, 1);",
    "  queueMicrotask(() => {});",
    "  new Map();",
    "  new Error('x');",
    "  new URL('http://x');",
    "  fetch('http://x');",
    "  structuredClone({});",
    "  parseInt('1');",
    "  String(1);",
    "  new Promise(() => {});",
    "  require('x');",
    "  Symbol('x');",
    "}",
  ].join("\n");
  expect(calleesOf(source, "run")).toEqual([]);
});

test("calls through a parameter, a local binding or a project import keep their unresolved edge", () => {
  const source = [
    'import { helper } from "./helper";',
    'import { internal } from "#internal";',
    'import { aliased } from "@/aliased";',
    'import { home } from "~/home";',
    'import * as local from "../local";',
    "export function run(cb: () => void, { pick }: Opts) {",
    "  cb();",
    "  pick();",
    "  const made = make();",
    "  made();",
    "  helper();",
    "  internal();",
    "  aliased();",
    "  home();",
    "  local.thing();",
    "  mystery();",
    "}",
  ].join("\n");
  expect(calleesOf(source, "run")).toEqual(
    ["aliased", "cb", "helper", "home", "internal", "made", "make", "mystery", "pick", "thing"].sort(),
  );
});

test("a global or package name the file binds itself keeps its edge", () => {
  const source = [
    'import { fetch } from "./http";',
    'import { parse } from "yaml";',
    "class Map {}",
    "function setTimeout() {}",
    "export function run(parse: (s: string) => void) {",
    "  fetch();",
    "  new Map();",
    "  setTimeout();",
    "  parse('x');",
    "}",
  ].join("\n");
  expect(calleesOf(source, "run")).toEqual(["Map", "fetch", "parse", "setTimeout"]);
});

test("a name used only as a default value or computed key stays unbound, and import-equals counts as an import", () => {
  const source = [
    'import parse = require("yaml");',
    'import local = require("./local");',
    "export function run({ cb = fetch, [queueMicrotask]: it }: Opts, [m = Map] = []) {",
    "  const { req = setTimeout } = opts;",
    "  queueMicrotask();",
    "  fetch();",
    "  new Map();",
    "  setTimeout();",
    "  parse('x');",
    "  local();",
    "}",
  ].join("\n");
  expect(calleesOf(source, "run")).toEqual(["local"]);
});

test("an ambient declaration or a named generator expression binds its name", () => {
  const source = [
    "declare function fetch(path: string): void;",
    "export function run() {",
    "  fetch('local');",
    "  const g = function* structuredClone() { yield 1; };",
    "  structuredClone();",
    "}",
  ].join("\n");
  expect(calleesOf(source, "run")).toEqual(["fetch", "structuredClone"]);
});

test("a db at schema_version 1 re-extracts every file once, then keeps its hashes", () => {
  const root = mkdtempSync(join(tmpdir(), "pi-cg-external-calls-upgrade-"));
  const dbPath = join(root, "graph.db");
  try {
    const old = new SqliteGraphStore(dbPath);
    old.setFileHash("src/x.ts", "h");
    old.setMetadata(GIT_HEAD_METADATA_KEY, "abc");
    old.close();
    const raw = new Database(dbPath);
    raw.run("UPDATE schema_version SET version = 1");
    // It predates the extractor version stamp too.
    raw.run("ALTER TABLE file_hashes DROP COLUMN extractor_version");
    raw.close();

    const upgraded = new SqliteGraphStore(dbPath);
    expect(upgraded.getFileHash("src/x.ts")).toBeNull();
    expect(upgraded.getMetadata(GIT_HEAD_METADATA_KEY)).toBeNull();
    upgraded.setFileHash("src/x.ts", "h2");
    upgraded.close();

    const again = new SqliteGraphStore(dbPath);
    try {
      expect(again.getFileHash("src/x.ts")).toBe("h2");
    } finally {
      again.close();
    }
    const after = new Database(dbPath);
    try {
      expect(after.prepare("SELECT version FROM schema_version").all()).toEqual([{ version: SCHEMA_VERSION }]);
    } finally {
      after.close();
    }
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
