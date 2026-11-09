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
    const backend = createFakeBackend(page);
    await backend.install();

    await page.goto("/welcome");
    expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);
    await page.goto("/sign-in");
    expect((await new AxeBuilder({ page }).withTags(wcag).analyze()).violations).toEqual([]);

    await signIn(page);
    await page.getByRole("button", { name: "Ask PaySasa" }).click();
    await page.getByRole("region", { name: "PaySasa assistant" }).getByRole("button", { name: /Kwame's request/ }).click();
    await expect(page.getByRole("heading", { name: "Invoice sent via PayPal" })).toBeVisible();
    // AG Grid's own internals are excluded; our cells, toolbar and the rest of the page are checked.
    const dash = await new AxeBuilder({ page }).withTags(wcag).exclude(".ag-root-wrapper").analyze();
    expect(dash.violations).toEqual([]);
    await page.getByRole("button", { name: "Close assistant" }).click();

    backend.clientPays();
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

test("first sign-in: welcome steps, language switch, spotlight tour", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one viewport is enough");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await createFakeBackend(page).install({ tour: true });
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill("demo@paysasa.app");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in" }).click();

  const welcome = page.getByRole("dialog", { name: "Welcome to PaySasa" });
  await expect(welcome).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(wcag).include('[role="dialog"]').analyze()).violations).toEqual([]);
  await welcome.getByRole("button", { name: "Continue" }).click();
  await welcome.getByRole("button", { name: "Continue" }).click();
  await welcome.getByRole("radio", { name: /Kiswahili/ }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "sw");
  await welcome.getByRole("radio", { name: /English/ }).click();
  await welcome.getByRole("button", { name: "Show me around" }).click();

  const tour = page.getByRole("dialog", { name: "Start here" });
  await expect(tour).toBeVisible();
  await tour.getByRole("button", { name: "Next" }).click();
  await expect(page.getByRole("dialog", { name: "Your money at a glance" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);

  // It doesn't come back after a reload.
  await page.reload();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Welcome to PaySasa" })).toHaveCount(0);
});

test("display and accessibility menu: theme, larger text, high contrast, reduced motion", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one viewport is enough");
  await createFakeBackend(page).install();
  await signIn(page);
  const html = page.locator("html");

  // One-tap theme toggle in the header
  const before = await html.getAttribute("data-theme");
  await page.getByRole("button", { name: /Switch to (dark|light) mode/ }).click();
  await expect(html).not.toHaveAttribute("data-theme", before ?? "");

  // Accessibility menu
  await page.getByRole("button", { name: "Display and accessibility" }).click();
  await page.getByRole("menuitemradio", { name: "Larger text" }).click();
  await expect(html).toHaveAttribute("data-text", "xl");
  await page.getByRole("menuitemcheckbox", { name: /High contrast/ }).click();
  await expect(html).toHaveAttribute("data-contrast", "high");
  await page.getByRole("menuitemcheckbox", { name: /Reduce motion/ }).click();
  await expect(html).toHaveAttribute("data-motion", "reduce");
  await page.keyboard.press("Escape");

  // Still no WCAG violations with high contrast and large text, in both themes
  for (const theme of ["light", "dark"]) {
    await page.evaluate((t) => (document.documentElement.dataset.theme = t), theme);
    const r = await new AxeBuilder({ page }).withTags(wcag).exclude(".ag-root-wrapper").analyze();
    expect(r.violations).toEqual([]);
  }

  // Preferences survive a reload
  await page.reload();
  await expect(html).toHaveAttribute("data-contrast", "high");
  await expect(html).toHaveAttribute("data-text", "xl");
});
