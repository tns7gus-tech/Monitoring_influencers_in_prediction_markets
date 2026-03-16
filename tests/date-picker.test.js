import test from "node:test";
import assert from "node:assert/strict";

import { normalizeDateInputString } from "../src/ui/date-picker.js";

test("normalizeDateInputString preserves valid ISO values", () => {
  assert.equal(normalizeDateInputString("2026-03-15"), "2026-03-15");
});

test("normalizeDateInputString normalizes common typed date formats", () => {
  assert.equal(normalizeDateInputString("20260315"), "2026-03-15");
  assert.equal(normalizeDateInputString("2026/3/5"), "2026-03-05");
  assert.equal(normalizeDateInputString("2026.03.15"), "2026-03-15");
});

test("normalizeDateInputString leaves invalid calendar dates untouched", () => {
  assert.equal(normalizeDateInputString("2026-02-30"), "2026-02-30");
});
