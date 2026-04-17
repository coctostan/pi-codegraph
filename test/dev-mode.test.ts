import { test } from "bun:test";
import { devModeEnabled } from "../src/config/dev-mode.js";

test("devModeEnabled accepts the approved truthy values and rejects disabled values", () => {
  const truthy = ["1", "true", "TRUE", "yes", "YES", "on", "On"];
  for (const value of truthy) {
    if (!devModeEnabled({ CODEGRAPH_DEVMODE: value })) {
      throw new Error(`devModeEnabled rejected truthy value: ${value}`);
    }
  }

  const disabled = [undefined, "", "0", "false", "FALSE"];
  for (const value of disabled) {
    if (devModeEnabled({ CODEGRAPH_DEVMODE: value })) {
      throw new Error(`devModeEnabled accepted disabled value: ${String(value)}`);
    }
  }
});
