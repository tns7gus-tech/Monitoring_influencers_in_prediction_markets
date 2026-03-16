import test from "node:test";
import assert from "node:assert/strict";

import { buildChannelTestAlert, dispatchNotificationDelivery } from "../src/notifications.js";

test("dispatchNotificationDelivery succeeds for log-only channels", async () => {
  const result = await dispatchNotificationDelivery({
    kind: "alert",
    alert: {
      title: "Tracked signal",
      message: "New entry detected",
      severity: "medium",
      createdAt: "2026-03-14T00:00:00.000Z",
    },
    channel: {
      id: 1,
      label: "Ops Log",
      type: "log_only",
      config: {},
    },
  });

  assert.equal(result.provider, "log_only");
  assert.equal(result.responseCode, 200);
});

test("dispatchNotificationDelivery supports mock success and failure transports", async () => {
  const success = await dispatchNotificationDelivery({
    kind: "alert",
    alert: {
      title: "Tracked signal",
      message: "New entry detected",
      severity: "medium",
      createdAt: "2026-03-14T00:00:00.000Z",
    },
    channel: {
      id: 2,
      label: "Discord",
      type: "discord_webhook",
      config: {
        webhookUrl: "mock://success",
      },
    },
  });

  assert.equal(success.provider, "mock");
  await assert.rejects(
    dispatchNotificationDelivery({
      kind: "alert",
      alert: {
        title: "Tracked signal",
        message: "New entry detected",
        severity: "high",
        createdAt: "2026-03-14T00:00:00.000Z",
      },
      channel: {
        id: 3,
        label: "Webhook",
        type: "generic_webhook",
        config: {
          webhookUrl: "mock://fail",
        },
      },
    }),
    /Mock delivery failure/
  );
});

test("buildChannelTestAlert returns a test payload with metadata", () => {
  const alert = buildChannelTestAlert({
    label: "Telegram Channel",
  });

  assert.equal(alert.type, "channel_test");
  assert.match(alert.title, /Telegram Channel/);
});
