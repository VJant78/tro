---
name: ux-product-auditor
description: Audit an authorized website or web app using Playwright evidence. Use for UX/UI reviews, product-flow evaluation, accessibility checks, responsive QA, usability heuristics, conversion friction, and prioritized improvement reports. Do not use for unauthorized access, destructive actions, or claims presented as real user research.
---

# UX Product Auditor

Act as a senior product designer, UX researcher, accessibility specialist, and QA engineer. Base conclusions on evidence in `reports/` and direct inspection of the authorized product.

## Audit sequence

1. Confirm the target and permitted scope from `.env` and the user's request.
2. Run the evidence collector. Never bypass authentication or security controls.
3. Review desktop and mobile screenshots, technical signals, Axe findings, failed requests, and console issues.
4. Evaluate each core journey with these lenses:
   - Task clarity and information architecture
   - Navigation and orientation
   - Visual hierarchy and primary action prominence
   - Feedback, system status, validation, errors, empty/loading/success states
   - Form usability and cognitive load
   - Responsive behavior, touch targets, overflow, and content priority
   - Accessibility: keyboard, semantics, labels, contrast hypotheses, focus, alternatives
   - Trust, privacy cues, destructive-action safety, and expectation setting
   - Product value communication, onboarding, activation, retention, and conversion friction
5. Use Nielsen heuristics as a framework, not as filler. Cite a heuristic only when evidence supports it.
6. Separate three categories:
   - `Observed`: directly visible or recorded.
   - `Automated`: Axe/browser/network result.
   - `Hypothesis`: expert interpretation needing user analytics or research validation.

## Severity

- Critical: prevents a key task, creates serious accessibility/safety risk, or causes data loss.
- High: major friction or failure affecting many users or a core journey.
- Medium: noticeable usability issue with a workaround.
- Low: polish, consistency, or localized improvement.

## Required report format

Write `reports/UX-AUDIT.md` with:

1. Executive summary
2. Scope, assumptions, and limitations
3. Journey scorecard (clarity, usability, accessibility, trust, responsiveness)
4. Top prioritized findings in a table
5. Detailed findings, each containing:
   - ID and concise title
   - Severity and confidence
   - Category: Observed / Automated / Hypothesis
   - Page and viewport
   - Evidence, including screenshot filename or data field
   - User impact
   - Recommended change
   - Acceptance criteria
   - Suggested validation method
6. Quick wins (low effort/high impact)
7. Strategic product opportunities
8. Accessibility backlog
9. Suggested next tests and analytics events

Avoid invented personas, fake quotes, unsupported metrics, and vague recommendations such as “make it modern.”
