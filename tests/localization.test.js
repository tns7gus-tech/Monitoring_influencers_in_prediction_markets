import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSnapshot } from "../src/snapshot.js";
import { translateLegacyCopy, translateLegacyString } from "../src/localization.js";

test("translateLegacyString converts Korean activity copy and relative times", () => {
  assert.equal(translateLegacyString("\uc2e0\uaddc \uc9c4\uc785"), "New entry");
  assert.equal(translateLegacyString("\ud3ec\uc9c0\uc158 \ucd95\uc18c"), "Position reduction");
  assert.equal(translateLegacyString("9\ubd84 \uc804"), "9m ago");
  assert.equal(translateLegacyString("6\uc2dc\uac04 \uc804"), "6h ago");
  assert.equal(translateLegacyString("4\uc77c \uc804"), "4d ago");
});

test("translateLegacyCopy recursively localizes legacy snapshot content", () => {
  const localized = translateLegacyCopy({
    notes: ["\ucd5c\uadfc \ud3ec\uc9c0\uc158 \ucd95\uc18c\uac00 \uac10\uc9c0\ub418\uc5c8\uc2b5\ub2c8\ub2e4."],
    signal: {
      action: "\uc2e0\uaddc \uc9c4\uc785",
      timestamp: "2\ubd84 \uc804",
    },
  });

  assert.deepEqual(localized, {
    notes: ["A recent position reduction was detected."],
    signal: {
      action: "New entry",
      timestamp: "2m ago",
    },
  });
});

test("translateLegacyString converts legacy Korean alert templates", () => {
  assert.equal(
    translateLegacyString("Blues vs. Jets \uad00\uc2ec \uc9d1\uc911"),
    "Blues vs. Jets crowding alert"
  );
  assert.equal(
    translateLegacyString(
      "weflyhigh\uac00 Blues vs. Jets \uc2dc\uc7a5\uc5d0\uc11c \uc2e0\uaddc \uc9c4\uc785\ud588\uc2b5\ub2c8\ub2e4."
    ),
    "weflyhigh posted a new entry signal in Blues vs. Jets."
  );
  assert.equal(
    translateLegacyString("2\uba85\uc758 \uc0c1\uc704 \ud2b8\ub808\uc774\ub354\uac00 \uac19\uc740 \uc2dc\uc7a5\uc5d0 \uc9c4\uc785\ud588\uc2b5\ub2c8\ub2e4."),
    "2 top traders entered the same market."
  );
});

test("normalizeSnapshot localizes legacy Korean snapshot fields", () => {
  const snapshot = normalizeSnapshot({
    generatedAt: "2026-03-15T00:00:00.000Z",
    source: "live",
    notes: [
      "\uacf5\uc2dd Polymarket leaderboard, positions, closed-positions, activity, trades, value, prices-history \uc5d4\ub4dc\ud3ec\uc778\ud2b8\ub97c \uc0ac\uc6a9\ud588\uc2b5\ub2c8\ub2e4.",
    ],
    traders: [
      {
        id: "legacy-wallet",
        alias: "Legacy Trader",
        wallet: "0x0000000000000000000000000000000000009999",
        focus: ["Macro"],
        recentSignal: {
          market: "Fed cuts",
          side: "YES",
          action: "\uc2e0\uaddc \uc9c4\uc785",
          conviction: "High",
        },
        recentActivities: [
          {
            market: "Fed cuts",
            action: "\ud3ec\uc9c0\uc158 \ucd95\uc18c",
            side: "NO",
            size: "$500",
            note: "\ucd5c\uadfc \ud3ec\uc9c0\uc158 \ucd95\uc18c\uac00 \uac10\uc9c0\ub418\uc5c8\uc2b5\ub2c8\ub2e4.",
            timestamp: "3\uc2dc\uac04 \uc804",
            timestampMs: Date.parse("2026-03-14T21:00:00.000Z"),
          },
        ],
      },
    ],
    signalFeed: [
      {
        traderId: "legacy-wallet",
        market: "Fed cuts",
        action: "\uc2e0\uaddc \uc9c4\uc785",
        side: "YES",
        size: "$500",
        note: "\ucd5c\uadfc \uc2e0\uaddc \uc9c4\uc785 \ub610\ub294 \ube44\uc911 \ud655\ub300\uac00 \uac10\uc9c0\ub418\uc5c8\uc2b5\ub2c8\ub2e4.",
        timestamp: "1\ubd84 \uc804",
      },
    ],
  });

  assert.equal(
    snapshot.notes[0],
    "Official Polymarket leaderboard, positions, closed-positions, activity, trades, value, and prices-history endpoints were used."
  );
  assert.equal(snapshot.traders[0].recentSignal.action, "New entry");
  assert.equal(snapshot.traders[0].recentActivities[0].action, "Position reduction");
  assert.equal(snapshot.traders[0].recentActivities[0].note, "A recent position reduction was detected.");
  assert.equal(snapshot.traders[0].recentActivities[0].timestamp, "3h ago");
  assert.equal(snapshot.signalFeed[0].timestamp, "1m ago");
});
