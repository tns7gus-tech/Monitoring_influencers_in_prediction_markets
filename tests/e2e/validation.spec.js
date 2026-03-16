import { expect, test } from "@playwright/test";

import { expectFieldInvalid, openApp, registerAndSignIn } from "./helpers.js";

test("simulation form rejects inverted date ranges in the browser", async ({ page }) => {
  await openApp(page);

  await page.locator("#simulation-start-date").fill("2026-03-15");
  await page.locator("#simulation-end-date").fill("2026-03-01");
  await page.locator("#simulation-end-date").press("Tab");

  await expectFieldInvalid(page, "#simulation-start-date");
  await expectFieldInvalid(page, "#simulation-end-date");
  await expect(page.locator("#simulation-status")).toContainText("Start date must be on or before the end date.");
  await expect(page.locator("#simulation-status")).toContainText("End date must be on or after the start date.");
});

test("simulation form rejects impossible calendar dates typed by the user", async ({ page }) => {
  await openApp(page);

  await page.locator("#simulation-start-date").fill("2026-02-30");
  await page.locator("#simulation-start-date").press("Tab");

  await expectFieldInvalid(page, "#simulation-start-date");
  await expect(page.locator("#simulation-status")).toContainText("Start date format is invalid.");
});

test("custom date picker stays English in the browser UI", async ({ page }) => {
  await openApp(page);

  await page.locator('[data-date-target="simulation-start-date"]').click();

  const panel = page.locator("#simulation-start-date-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByRole("button", { name: "Previous month" })).toBeVisible();
  await expect(panel.getByRole("button", { name: "Next month" })).toBeVisible();
  await expect(panel).toContainText("Sun");
  await expect(panel).toContainText("Mon");

  const panelText = await panel.textContent();
  expect(panelText).not.toMatch(/[가-힣]/);

  await panel.locator("[data-date-value]").first().click();
  await expect(page.locator("#simulation-start-date")).toHaveValue(/\d{4}-\d{2}-\d{2}/);
});

test("registration form blocks invalid client-side input", async ({ page }) => {
  await openApp(page);

  await page.locator("#register-display-name").fill("A");
  await page.locator("#register-username").fill("Bad Name");
  await page.locator("#register-password").fill("123");
  await page.locator('#register-form button[type="submit"]').click();

  await expectFieldInvalid(page, "#register-display-name");
  await expectFieldInvalid(page, "#register-username");
  await expectFieldInvalid(page, "#register-password");
  await expect(page.locator("#auth-status")).toContainText("Display name must be 2-32 characters.");
  await expect(page.locator("#auth-status")).toContainText(
    "Username must be 3-24 characters using lowercase letters, numbers, ., _, or -."
  );
  await expect(page.locator("#auth-status")).toContainText("Password must be 8-72 characters.");
});

test("login form blocks malformed username and empty password", async ({ page }) => {
  await openApp(page);

  await page.locator("#login-username").fill("Bad Name");
  await page.locator('#login-form button[type="submit"]').click();

  await expectFieldInvalid(page, "#login-username");
  await expectFieldInvalid(page, "#login-password");
  await expect(page.locator("#auth-status")).toContainText("Enter a valid username.");
  await expect(page.locator("#auth-status")).toContainText("Enter a password.");
});

test("watchlist form keeps invalid wallet rules from being submitted", async ({ page }) => {
  await openApp(page);
  await registerAndSignIn(page);

  await page.locator("#watch-label").fill("A");
  await page.locator("#watch-wallet").fill("0x123");
  await page.locator("#watch-thesis").fill("short");
  await page.locator("#watch-recent-hours").fill("200");
  await page.locator('#watchlist-form button[type="submit"]').click();

  await expectFieldInvalid(page, "#watch-label");
  await expectFieldInvalid(page, "#watch-wallet");
  await expectFieldInvalid(page, "#watch-thesis");
  await expectFieldInvalid(page, "#watch-recent-hours");
  await expect(page.locator("#watchlist-status")).toContainText("Label must be 2-24 characters.");
  await expect(page.locator("#watchlist-status")).toContainText("Enter a valid EVM wallet address.");
  await expect(page.locator("#watchlist-status")).toContainText("Tracking thesis must be 10-120 characters.");
  await expect(page.locator("#watchlist-status")).toContainText("Recent-hour filter must be between 0 and 168 hours.");
});

test("notification form validates webhook configuration in the browser", async ({ page }) => {
  await openApp(page);
  await registerAndSignIn(page);

  await page.locator("#notification-label").fill("A");
  await page.locator("#notification-type").selectOption("discord_webhook");
  await page.locator("#notification-webhook-url").fill("ftp://invalid-target");
  await page.locator('#notification-form button[type="submit"]').click();

  await expectFieldInvalid(page, "#notification-label");
  await expectFieldInvalid(page, "#notification-webhook-url");
  await expect(page.locator("#notification-status")).toContainText("Channel name must be 2-30 characters.");
  await expect(page.locator("#notification-status")).toContainText("Webhook URL must use http(s):// or mock://.");
});

test.describe("mobile validation smoke", () => {
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 390, height: 844 },
  });

  test("mobile menu and simulation validation remain accessible", async ({ page }) => {
    await openApp(page);

    const menuToggle = page.locator("#menu-toggle");
    await expect(menuToggle).toBeVisible();
    await menuToggle.click();
    await expect(menuToggle).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#topbar-actions-panel")).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1
    );
    expect(hasHorizontalOverflow).toBe(false);

    await page.locator("#simulation-section").scrollIntoViewIfNeeded();
    await page.locator("#simulation-start-date").fill("2026-03-15");
    await page.locator("#simulation-end-date").fill("2026-03-01");
    await page.locator("#simulation-end-date").press("Tab");

    await expect(page.locator("#simulation-status")).toContainText("Start date must be on or before the end date.");
  });
});
