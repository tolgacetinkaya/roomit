import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const startup = readFileSync(new URL("../public/appearance.js", import.meta.url), "utf8");
test("the first paint uses the saved appearance or the current system preference", () => {
  for (const [saved, dark, preference, expected] of [
    ["light", true, "light", "light"],
    ["dark", false, "dark", "dark"],
    [null, false, "system", "light"],
    ["system", true, "system", "dark"],
    ["unknown", true, "system", "dark"],
    [new Error("storage unavailable"), false, "system", "light"],
  ]) {
    const dataset = {};
    runInNewContext(startup, {
      document: { documentElement: { dataset } },
      matchMedia: () => ({ matches: dark }),
      localStorage: { getItem() { if (saved instanceof Error) throw saved; return saved; } },
    });
    assert.deepEqual(dataset, { themePreference: preference, theme: expected });
  }
});
