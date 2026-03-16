function buildAlertText(alert) {
  return [
    `[${alert.severity || "medium"}] ${alert.title || "Notification"}`,
    alert.message || "",
    alert.marketSlug ? `market: ${alert.marketSlug}` : "",
    alert.createdAt ? `at: ${alert.createdAt}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function buildDiscordPayload(alert) {
  return {
    username: "Prediction Alpha Monitor",
    content: buildAlertText(alert),
  };
}

function buildTelegramPayload(alert, channel) {
  return {
    chat_id: channel.config.chatId,
    text: buildAlertText(alert),
  };
}

function buildGenericWebhookPayload(alert, channel, kind) {
  return {
    kind,
    channel: {
      id: channel.id,
      label: channel.label,
      type: channel.type,
    },
    alert,
  };
}

function getMockTarget(channel) {
  if (channel.type === "telegram_bot") {
    if (`${channel.config.botToken || ""}`.toLowerCase() === "mock") {
      return `${channel.config.chatId || "mock"}`.toLowerCase();
    }
    return "";
  }

  return `${channel.config.webhookUrl || ""}`.toLowerCase();
}

function createTransportError(message, responseCode = null) {
  const error = new Error(message);
  error.responseCode = responseCode;
  return error;
}

async function postJson(url, body, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const responseText = await response.text().catch(() => "");
    if (!response.ok) {
      throw createTransportError(`HTTP ${response.status}`, response.status);
    }

    return {
      provider: "http",
      responseCode: response.status,
      responseText,
    };
  } catch (error) {
    if (error.name === "AbortError") {
      throw createTransportError("요청 시간이 초과되었습니다.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function dispatchNotificationDelivery(delivery) {
  const alert = delivery.alert || {};
  const channel = delivery.channel || {};
  const kind = delivery.kind || "alert";
  const mockTarget = getMockTarget(channel);

  if (channel.type === "log_only") {
    return {
      provider: "log_only",
      responseCode: 200,
      responseText: `LOG_ONLY ${channel.label}: ${alert.title || "Notification"}`,
    };
  }

  if (mockTarget.startsWith("mock://success") || mockTarget === "mock") {
    return {
      provider: "mock",
      responseCode: 200,
      responseText: `MOCK_OK ${channel.label}`,
    };
  }

  if (mockTarget.startsWith("mock://fail")) {
    throw createTransportError("Mock delivery failure", 500);
  }

  if (channel.type === "discord_webhook") {
    return postJson(channel.config.webhookUrl, buildDiscordPayload(alert));
  }

  if (channel.type === "telegram_bot") {
    const url = `https://api.telegram.org/bot${channel.config.botToken}/sendMessage`;
    return postJson(url, buildTelegramPayload(alert, channel));
  }

  if (channel.type === "generic_webhook") {
    return postJson(channel.config.webhookUrl, buildGenericWebhookPayload(alert, channel, kind));
  }

  throw createTransportError(`지원되지 않는 채널 타입입니다: ${channel.type}`);
}

export function buildChannelTestAlert(channel) {
  return {
    type: "channel_test",
    severity: "low",
    title: `${channel.label} 테스트`,
    message: `${channel.label} 채널 연결 테스트 메시지입니다.`,
    marketSlug: "system-test",
    createdAt: new Date().toISOString(),
  };
}
