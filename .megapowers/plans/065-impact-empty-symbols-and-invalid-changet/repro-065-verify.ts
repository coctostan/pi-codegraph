import { SqliteGraphStore } from "../../../src/graph/sqlite.js";
import { impact, collectImpact } from "../../../src/tools/impact.js";

const store = new SqliteGraphStore();
try {
  console.log("=== impact({ symbols: [], changeType: 'behavior_change' }) ===");
  console.log(JSON.stringify(
    impact({ symbols: [], changeType: "behavior_change", store, projectRoot: process.cwd() })
  ));
  console.log("---");

  console.log("=== collectImpact({ symbols: [] }) ===");
  console.log(JSON.stringify(
    collectImpact({ symbols: [], changeType: "behavior_change", store })
  ));
  console.log("---");

  console.log("=== collectImpact({ symbols: undefined }) ===");
  try {
    const out = collectImpact({ symbols: undefined as any, changeType: "behavior_change", store });
    console.log(JSON.stringify(out));
  } catch (err: any) {
    console.log("THREW:", err?.message ?? String(err));
  }
  console.log("---");

  console.log("=== collectImpact invalid changeType ===");
  console.log(JSON.stringify(
    collectImpact({ symbols: ["foo"], changeType: "typo_change" as any, store })
  ));
  console.log("---");

  console.log("=== impact(valid symbol, invalid changeType) ===");
  store.addNode({
    id: "src/lib.ts::shared:1",
    kind: "function",
    name: "shared",
    file: "src/lib.ts",
    start_line: 1,
    end_line: 1,
    content_hash: "h",
  });
  console.log(JSON.stringify(
    impact({ symbols: ["shared"], changeType: "typo_change" as any, store, projectRoot: process.cwd() })
  ));
} finally {
  store.close();
}
