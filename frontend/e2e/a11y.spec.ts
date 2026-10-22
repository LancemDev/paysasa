import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { createFakeBackend } from "./fakeBackend";

async function signIn(page: import("@playwright/test").Page) {
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
  await page.getByLabel("Email").fill("demo@paysasa.app");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

const wcag = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

for (const scheme of ["light", "dark"] as const) {
  test(`no WCAG A/AA violations: sign-in, dashboard, approval (${scheme})`, async ({ page }, info) => {
    test.skip(info.project.name !== "desktop", "one viewport is enough for axe");
    await page.emulateMedia({ colorScheme: scheme, reducedMotion: "reduce" });
    await createFakeBackend(page).install();

    await page.goto("/welcome");
    expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);
    await page.goto("/sign-in");
    expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);

    await signIn(page);
    await page.getByRole("region", { name: "PaySasa assistant" }).getByRole("button", { name: /Kwame's request/ }).click();
    await expect(page.getByRole("heading", { name: "Invoice sent via PayPal" })).toBeVisible();
    // AG Grid's own internals are excluded; our cells, toolbar and the rest of the page are checked.
    const dash = await new AxeBuilder({ page }).withTags(wcag).exclude(".ag-root-wrapper").analyze();
    expect(dash.violations).toEqual([]);

    await page.getByRole("button", { name: /Demo helper/ }).click();
    await page.getByRole("button", { name: "Mark as paid (simulated)" }).click();
    await page.goto("/approvals");
    await page.getByRole("button", { name: "Review payout" }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    expect((await new AxeBuilder({ page }).withTags(wcag).include('[role="dialog"]').analyze()).violations).toEqual([]);
    await page.keyboard.press("Escape");

    // Insights: check our own chrome and custom widgets; AG Studio's internals are its own.
    await page.goto("/insights");
    await expect(page.getByText("Needs your approval").first()).toBeVisible({ timeout: 20_000 });
    const insights = await new AxeBuilder({ page }).withTags(wcag).exclude(".ag-studio, [class*='ag-studio'], .ag-root-wrapper, .ag-charts-wrapper").analyze();
    expect(insights.violations).toEqual([]);
  });
}

test("no horizontal page scroll at 360px", async ({ page }, info) => {
  test.skip(info.project.name !== "mobile", "narrow viewport check");
  await page.setViewportSize({ width: 360, height: 760 });
  await createFakeBackend(page).install();
  await signIn(page);
  for (const path of ["/", "/approvals", "/payees", "/settings", "/welcome"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => document.documentElement.scrollWidth), path).toBeLessThanOrEqual(360);
  }
});
