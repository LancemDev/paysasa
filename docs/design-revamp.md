# PaySasa: design revamp (Nov 2026)

## What was wrong
- **Generic look.** Teal on grey, system font, boxes inside boxes. Nothing said "money" or "trust".
- **Cluttered dashboard.** The demo helper, the checklist and four thin KPI tiles pushed the actual data below the fold.
- **Chat took a third of the screen**, even when you weren't using it.
- **Empty space.** Grids had a fixed height, so a single invoice sat in a 600px empty box.
- **Mobile.** The data was buried under the demo helper and there was no real navigation.

## Direction: "ledger on paper"
We reverse-engineered three references and kept what fits a payments product:

| Reference | What we took | What we left |
|---|---|---|
| Mode.com ("sunlit greenhouse", via Refero) | Deep forest + one lime accent, serif display type (Fraunces), warm paper canvas, flat hairline surfaces | Photography, 4px square buttons |
| Relevance AI ("Violet Ledger" spec) | Data-dense white cards, hairline borders, a metric strip, an agent panel with a stepped trace, one rationed accent for the main action | Violet (reads as generic AI) |
| Digital-wallet motion study | Stacked cards in a wallet that fan out on hover and spring up on click, used for **invoices and payouts** (not credit cards) | Bank-card branding, fake balances |

Smaller borrowings:
- From the brutalist SaaS spec: the slightly rotated highlight behind a key headline phrase, the "old way vs new way" contrast block, the oversized step numerals, and the bento feature grid. We dropped Anton and the yellow, which fight a fintech tone.
- From the radiant prompt input: the rotating border, recoloured to brand hues. It **only animates while the assistant is working**, so it signals activity instead of decorating.
- From the animated stepper: the first-login welcome stepper and the payment-cycle connectors.
- **Not used:** the macOS magnification dock. Hover magnification doesn't work on touch, and it hides labels. Mobile gets a standard bottom tab bar instead, with the assistant in the centre.

## UX changes
- **Assistant as an on-demand panel.** It opens with ⌘K, the header button, the mobile centre tab or the dashboard ask bar. It floats non-modally on desktop, so you can watch the dashboard update while it works, and opens as a full sheet on mobile. This follows the "persistent panels cost attention even when idle" finding.
- **The dashboard answers four questions in order:**
  1. How much is coming in? The money card shows the wallet of open invoices and payouts behind the total.
  2. What needs me? Approvals and late invoices, each with one action, plus the latest activity.
  3. Where am I in the loop? The six-step cycle tracker.
  4. Who pays me, and what does my team get? Cash-flow bars, a client breakdown and a team-share breakdown.

  The full grid comes after these.
- **Grids size to their data.** No more tall empty boxes.
- **First login:**
  - A 3-step welcome (what it does, the approval rule, language choice).
  - An optional spotlight tour of six dashboard areas, with Back, Next, Skip, Esc and the arrow keys.
  - The tour can be replayed from Settings.
- **The demo helper is a floating, labelled dock.** It closes itself after each action.

## Language
English and **Kiswahili** cover the landing page, navigation, dashboard, assistant, approvals headers, status badges and the tour (`src/lib/i18n.ts`). Agent replies come from the model, so they follow whatever language the user types in. The choice is saved per device and sets `<html lang>`.

**Have a native speaker review the Kiswahili strings before recording.**

## Accessibility and quality
- **Contrast:** every text token passes WCAG AA. The muted text was darkened to reach 4.5:1.
- **Charts:** chart colours were checked with the dataviz validator (`--chart-money`: `#1f8a54` light, `#5e9e2c` dark).
- **Status:** always shown as icon + text + colour, never colour alone.
- **Motion:** reduced-motion is respected everywhere, including the springs.
- **Tests:**
  - 42 unit tests pass.
  - 6 Playwright tests pass: the Kwame flow (desktop and mobile), axe WCAG A/AA in light and dark, no sideways scroll at 360px, and the first-login tour.
  - Run the unit tests with `LC_ALL=en_US.UTF-8` on machines with a non-US locale. Otherwise `Intl` prints "US$" and 4 money assertions fail. That's a test-environment issue, not an app bug.
