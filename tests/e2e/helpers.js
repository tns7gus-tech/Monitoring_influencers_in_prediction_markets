import { expect } from "@playwright/test";

export async function openApp(page) {
  await page.goto("/");
  await page.waitForFunction(() => document.querySelectorAll("#simulation-trader option").length > 0);
  await expect(page.locator("#simulation-form")).toBeVisible();
}

export async function registerAndSignIn(page) {
  const username = `e2e_${Date.now()}_${Math.floor(Math.random() * 1_000_000)}`;

  await page.locator("#register-display-name").fill("QA Desk");
  await page.locator("#register-username").fill(username);
  await page.locator("#register-password").fill("password123");

  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/session/register") &&
        response.request().method() === "POST" &&
        response.status() === 201
    ),
    page.locator('#register-form button[type="submit"]').click(),
  ]);

  await expect(page.locator("#auth-session")).toContainText("Workspace active");
  await expect(page.locator("#watch-label")).toBeEnabled();
  await expect(page.locator("#notification-label")).toBeEnabled();

  return { username };
}

export async function expectFieldInvalid(page, selector) {
  await expect(page.locator(selector)).toHaveAttribute("aria-invalid", "true");
}
