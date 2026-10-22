import { expect, test } from "@playwright/test";
import { createFakeBackend } from "./fakeBackend";

test("Kwame: prompt → invoice + locked payout → client pays → approve payout", async ({ page }, testInfo) => {
  const mobile = testInfo.project.name === "mobile";
  const backend = createFakeBackend(page);
  await backend.install();

  // Sign in
  await page.goto("/");
  await expect(page).toHaveURL(/sign-in/);
  await expect(page.getByText("No real money moves")).toBeVisible();
  await page.getByLabel("Email").fill("demo@paysasa.app");
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByText("No invoices yet")).toBeVisible();

  // 1-2. Send the demo prompt from the agent panel
  if (mobile) await page.getByRole("button", { name: "Ask PaySasa" }).click();
  const agent = page.getByRole("region", { name: "PaySasa assistant" });
  await agent.getByRole("button", { name: /Kwame's request/ }).click();
  await expect(agent.getByText(/Sent John Doe a \$1,200\.00 invoice/).first()).toBeVisible();

  // 3. Structured action cards: invoice sent, payout locked
  await expect(agent.getByRole("heading", { name: "Invoice sent via PayPal" })).toBeVisible();
  await expect(agent.getByText("Unlocks when John Doe's invoice ($1,200.00) is paid")).toBeVisible();
  await expect(agent.getByText("Locked", { exact: true })).toBeVisible();
  await expect(agent.getByText("Scheduled payout to Sarah: $240.00, locked until paid")).toBeVisible();
  if (mobile) await page.getByRole("button", { name: "Close assistant" }).click();

  // Dashboard shows the invoice under Awaiting payment
  await expect(page.getByText("Awaiting payment").first()).toBeVisible();
  await expect(page.getByText("Q3 Video Campaign").first()).toBeVisible();

  // 4. Client pays (demo helper → real /dev/simulate-paid contract)
  await page.getByRole("button", { name: /Demo helper/ }).click();
  await page.getByRole("button", { name: "Mark as paid (simulated)" }).click();

  // 5. Live update: Paid, and the payout asks for approval
  await expect(page.getByRole("link", { name: /Needs your approval/ }).first()).toBeVisible();
  await page.getByRole("link", { name: /Needs your approval/ }).first().click();
  await expect(page.getByRole("heading", { name: "Approvals" })).toBeVisible();
  await page.getByRole("button", { name: "Review payout" }).click();

  // 6. Approval modal: unmistakable consequence, then approve
  const dialog = page.getByRole("dialog", { name: "Approve payout" });
  await expect(dialog.getByText("This will send $240.00 USD to Sarah via PayPal.")).toBeVisible();
  await dialog.getByRole("button", { name: /Approve and send \$240\.00/ }).click();
  await expect(dialog.getByText("Submitted to PayPal")).toBeVisible();
  await expect(dialog.getByText("MOCKBATCH000002")).toBeVisible();
  await expect(dialog.getByText("Paid out", { exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(page.getByText("Nothing needs your approval")).toBeVisible();
});
