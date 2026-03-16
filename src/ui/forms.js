export function setFormDisabled(form, disabled) {
  form?.querySelectorAll("input, select, textarea, button").forEach((field) => {
    field.disabled = disabled;
  });
}

export function setFieldErrors(form, errors, fieldIds) {
  Object.entries(fieldIds).forEach(([key, id]) => {
    const field = form.querySelector(`#${id}`);
    if (field) {
      field.setAttribute("aria-invalid", errors[key] ? "true" : "false");
    }
  });
}

export function syncFilterStateFromForm(form, state) {
  const formData = new FormData(form);
  state.query = String(formData.get("search") || "");
  state.category = String(formData.get("category") || "all");
  state.window = Number(formData.get("window") || 30);
}

export function applySimulationPayloadToForm(form, payload = {}) {
  const optionValues = [...form.traderId.options].map((option) => option.value);
  if (payload.traderId && optionValues.includes(payload.traderId)) {
    form.traderId.value = payload.traderId;
  }

  form.latencyMinutes.value = `${payload.latencyMinutes ?? 10}`;
  form.budget.value = `${payload.budget ?? 1000}`;
  form.mode.value = payload.mode || "follow_exit";
  form.minTradeUsd.value = `${payload.minTradeUsd ?? 250}`;
  form.startDate.value = payload.startDate || "";
  form.endDate.value = payload.endDate || "";
}

export function getSimulationPayloadFromForm(form) {
  return {
    traderId: String(form.traderId.value || ""),
    latencyMinutes: Number(form.latencyMinutes.value || 10),
    budget: Number(form.budget.value || 1000),
    mode: String(form.mode.value || "follow_exit"),
    minTradeUsd: Number(form.minTradeUsd.value || 250),
    startDate: String(form.startDate.value || ""),
    endDate: String(form.endDate.value || ""),
  };
}

export function buildSimulationKey(payload) {
  return [
    payload.traderId,
    payload.latencyMinutes,
    payload.budget,
    payload.mode,
    payload.minTradeUsd,
    payload.startDate || "",
    payload.endDate || "",
  ].join(":");
}

export function buildWatchlistPayload(form) {
  return {
    ...Object.fromEntries(new FormData(form)),
    prefs: {
      minSizeUsd: Number(form.minSizeUsd.value || 0),
      minForecastScore: Number(form.minForecastScore.value || 0),
      alertMode: String(form.alertMode.value || "all"),
      marketCategory: String(form.marketCategory.value || "all"),
      sideFilter: String(form.sideFilter.value || "all"),
      recentHours: Number(form.recentHours.value || 0),
    },
  };
}

export function resetWatchlistForm(form) {
  form.reset();
  form.alertMode.value = "all";
  form.minSizeUsd.value = "0";
  form.minForecastScore.value = "0";
  form.marketCategory.value = "all";
  form.sideFilter.value = "all";
  form.recentHours.value = "0";
}

export function buildNotificationPayload(form) {
  return {
    ...Object.fromEntries(new FormData(form)),
    enabled: form.enabled.checked,
  };
}

export function resetNotificationForm(form) {
  form.reset();
  form.enabled.checked = true;
  form.type.value = "log_only";
}
