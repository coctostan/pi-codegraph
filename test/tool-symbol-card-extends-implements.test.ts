import { expect, test } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SqliteGraphStore } from "../src/graph/sqlite.js";
import { symbolCard } from "../src/tools/symbol-card.js";
import { sha256Hex } from "../src/indexer/tree-sitter.js";

test("symbolCard shows extends and implements in Key Relationships", () => {
  const projectRoot = join(tmpdir(), `pi-cg-sc-ext-${Date.now()}`);
  mkdirSync(join(projectRoot, "src"), { recursive: true });

  const fileContent = "export class Dog extends Animal implements Pet {}\n";
  const baseContent = "export class Animal {}\n";
  const ifaceContent = "export interface Pet {}\n";
  writeFileSync(join(projectRoot, "src/dog.ts"), fileContent);
  writeFileSync(join(projectRoot, "src/animal.ts"), baseContent);
  writeFileSync(join(projectRoot, "src/pet.ts"), ifaceContent);

  try {
    const store = new SqliteGraphStore();
    const hashDog = sha256Hex(fileContent);
    const hashAnimal = sha256Hex(baseContent);
    const hashPet = sha256Hex(ifaceContent);

    store.addNode({ id: "src/dog.ts::Dog:1", kind: "class", name: "Dog", file: "src/dog.ts", start_line: 1, end_line: 1, content_hash: hashDog, is_exported: true });
    store.addNode({ id: "src/animal.ts::Animal:1", kind: "class", name: "Animal", file: "src/animal.ts", start_line: 1, end_line: 1, content_hash: hashAnimal });
    store.addNode({ id: "src/pet.ts::Pet:1", kind: "interface", name: "Pet", file: "src/pet.ts", start_line: 1, end_line: 1, content_hash: hashPet });

    store.addEdge({
      source: "src/dog.ts::Dog:1", target: "src/animal.ts::Animal:1", kind: "extends",
      provenance: { source: "tree-sitter", confidence: 1.0, evidence: "extends clause", content_hash: hashDog },
      created_at: Date.now(),
    });
    store.addEdge({
      source: "src/dog.ts::Dog:1", target: "src/pet.ts::Pet:1", kind: "implements",
      provenance: { source: "tree-sitter", confidence: 1.0, evidence: "implements clause", content_hash: hashDog },
      created_at: Date.now(),
    });

    const output = symbolCard({ name: "Dog", store, projectRoot });

    expect(output).toContain("### Key Relationships");
    expect(output).toContain("Extends");
    expect(output).toContain("Animal");
    expect(output).toContain("Implements");
    expect(output).toContain("Pet");

    store.close();
  } finally {
    rmSync(projectRoot, { recursive: true, force: true });
  }
});
