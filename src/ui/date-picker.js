const monthFormatter = new Intl.DateTimeFormat("en-US", {
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

const weekdayFormatter = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "UTC",
});

const weekdayLabels = Array.from({ length: 7 }, (_, index) =>
  weekdayFormatter.format(new Date(Date.UTC(2026, 0, 4 + index)))
);

function clampMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function padDatePart(value) {
  return `${value}`.padStart(2, "0");
}

function formatIsoDate(date) {
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
}

function parseIsoDate(value) {
  const match = `${value || ""}`.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? date
    : null;
}

export function normalizeDateInputString(value) {
  const trimmed = `${value || ""}`.trim();
  if (!trimmed) {
    return "";
  }

  const digitsOnly = trimmed.replace(/\D/g, "");
  if (/^\d{8}$/.test(digitsOnly)) {
    const normalized = `${digitsOnly.slice(0, 4)}-${digitsOnly.slice(4, 6)}-${digitsOnly.slice(6, 8)}`;
    return parseIsoDate(normalized) ? normalized : trimmed;
  }

  const separatedMatch = trimmed.match(/^(\d{4})[./\s-](\d{1,2})[./\s-](\d{1,2})$/);
  if (separatedMatch) {
    const normalized = `${separatedMatch[1]}-${padDatePart(separatedMatch[2])}-${padDatePart(separatedMatch[3])}`;
    return parseIsoDate(normalized) ? normalized : trimmed;
  }

  const parsed = parseIsoDate(trimmed);
  return parsed ? formatIsoDate(parsed) : trimmed;
}

function buildDayCells(displayMonth, selectedValue) {
  const year = displayMonth.getUTCFullYear();
  const month = displayMonth.getUTCMonth();
  const firstDay = new Date(Date.UTC(year, month, 1));
  const firstWeekday = firstDay.getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const todayValue = formatIsoDate(new Date());
  const cells = [];

  for (let index = 0; index < firstWeekday; index += 1) {
    cells.push('<span class="date-picker-day is-empty" aria-hidden="true"></span>');
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = new Date(Date.UTC(year, month, day));
    const value = formatIsoDate(date);
    const classes = [
      "date-picker-day",
      selectedValue === value ? "is-selected" : "",
      todayValue === value ? "is-today" : "",
    ]
      .filter(Boolean)
      .join(" ");

    cells.push(
      `<button class="${classes}" type="button" data-date-value="${value}" aria-label="${monthFormatter.format(date)}, ${day}">${day}</button>`
    );
  }

  return cells.join("");
}

function createDateFieldController(field, closeOthers) {
  const input = field.querySelector("input");
  const trigger = field.querySelector("[data-date-target]");
  const clearButton = field.querySelector("[data-date-clear]");
  const panel = field.querySelector(".date-picker-panel");
  const label = document.querySelector(`label[for="${input.id}"]`)?.textContent?.trim() || "Date";
  let displayMonth = clampMonth(parseIsoDate(input.value) || new Date());

  function dispatchDateChange() {
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function close() {
    field.classList.remove("is-open");
    panel.hidden = true;
    panel.setAttribute("aria-hidden", "true");
    trigger?.setAttribute("aria-expanded", "false");
  }

  function render() {
    const selectedValue = parseIsoDate(input.value) ? normalizeDateInputString(input.value) : "";
    panel.innerHTML = `
      <div class="date-picker-surface" role="dialog" aria-modal="false" aria-label="${label} calendar">
        <div class="date-picker-header">
          <button class="ghost-button small date-picker-nav" type="button" data-date-nav="prev" aria-label="Previous month">Previous</button>
          <strong class="date-picker-title">${monthFormatter.format(displayMonth)}</strong>
          <button class="ghost-button small date-picker-nav" type="button" data-date-nav="next" aria-label="Next month">Next</button>
        </div>
        <div class="date-picker-weekdays" aria-hidden="true">
          ${weekdayLabels.map((item) => `<span>${item}</span>`).join("")}
        </div>
        <div class="date-picker-grid" role="grid">
          ${buildDayCells(displayMonth, selectedValue)}
        </div>
      </div>
    `;
  }

  function open() {
    closeOthers(field);
    field.classList.add("is-open");
    panel.hidden = false;
    panel.setAttribute("aria-hidden", "false");
    trigger?.setAttribute("aria-expanded", "true");
    displayMonth = clampMonth(parseIsoDate(input.value) || new Date());
    render();
  }

  panel.addEventListener("click", (event) => {
    const navTarget = event.target.closest("[data-date-nav]");
    if (navTarget) {
      const direction = navTarget.getAttribute("data-date-nav") === "prev" ? -1 : 1;
      displayMonth = new Date(Date.UTC(displayMonth.getUTCFullYear(), displayMonth.getUTCMonth() + direction, 1));
      render();
      return;
    }

    const dayTarget = event.target.closest("[data-date-value]");
    if (!dayTarget) {
      return;
    }

    input.value = dayTarget.getAttribute("data-date-value");
    close();
    dispatchDateChange();
  });

  trigger?.addEventListener("click", () => {
    if (field.classList.contains("is-open")) {
      close();
      return;
    }

    open();
  });

  clearButton?.addEventListener("click", () => {
    input.value = "";
    close();
    dispatchDateChange();
    input.focus();
  });

  input.addEventListener("blur", () => {
    const normalized = normalizeDateInputString(input.value);
    if (normalized !== input.value) {
      input.value = normalized;
      dispatchDateChange();
    }
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "Enter") {
      event.preventDefault();
      open();
    }
  });

  return {
    close,
    contains(target) {
      return field.contains(target);
    },
  };
}

export function initializeDatePickers(root = document) {
  const fields = [...root.querySelectorAll("[data-date-field]")];
  if (!fields.length) {
    return () => {};
  }

  const controllers = [];
  const closeOthers = (currentField = null) => {
    controllers.forEach((controller) => {
      if (!currentField || !controller.contains(currentField)) {
        controller.close();
      }
    });
  };

  fields.forEach((field) => {
    controllers.push(createDateFieldController(field, closeOthers));
  });

  const handleDocumentClick = (event) => {
    if (controllers.some((controller) => controller.contains(event.target))) {
      return;
    }

    closeOthers();
  };

  const handleEscape = (event) => {
    if (event.key === "Escape") {
      closeOthers();
    }
  };

  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("keydown", handleEscape);

  return () => {
    document.removeEventListener("click", handleDocumentClick);
    window.removeEventListener("keydown", handleEscape);
    closeOthers();
  };
}
