import test from "node:test";
import assert from "node:assert/strict";

import { buildMarketThemesFromSignals, inferCategoriesFromText, pickTopCategories } from "../src/categories.js";

test("inferCategoriesFromText maps known keywords to market categories", () => {
  const categories = inferCategoriesFromText("Fed may cut rates after Bitcoin ETF inflow");

  assert.ok(categories.includes("Macro"));
  assert.ok(categories.includes("Crypto"));
});

test("pickTopCategories ranks the most frequent categories first", () => {
  const categories = pickTopCategories([
    "Fed cut in June",
    "US CPI surprise",
    "Bitcoin above 120k",
    "Fed speakers turn dovish",
  ]);

  assert.equal(categories[0], "Macro");
  assert.ok(categories.includes("Crypto"));
});

test("buildMarketThemesFromSignals aggregates notable markets by category", () => {
  const signals = [
    { traderId: "a", market: "Fed cuts in June", action: "New entry", side: "YES", note: "" },
    { traderId: "b", market: "Bitcoin above 120k", action: "New entry", side: "YES", note: "" },
  ];
  const traders = [
    { id: "a", focus: ["Macro"] },
    { id: "b", focus: ["Crypto"] },
  ];

  const themes = buildMarketThemesFromSignals(signals, traders);

  assert.equal(themes.length, 2);
  assert.equal(themes[0].notableMarkets.length, 1);
});
