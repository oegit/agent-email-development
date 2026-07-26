# Pre-Send QA Checklist

Run this before any email leaves for a real send. It is the single consolidated pre-send gate for the agent — the deep, client-specific rationale lives in the rules files (`OUTLOOK_RULES.md`, `DARK_MODE_RULES.md`, `RESPONSIVE_RULES.md`); this file only lists the checks and points there.

**Legend**

- `[AUTO]` — enforced by a script that **travels with the agent**: `validate-email.js`, the pre-send gate, run against the compiled HTML (`node validate-email.js <compiled.html>` — exits non-zero on any blocking failure and writes `VALIDATION_REPORT.md`). *Enforced* means it fails the run, not that it prints something.
- `[AUTO-candidate]` — mechanically checkable but **not covered by an agent-level script**. Verify by hand. A project's own build may automate it (this is where a "With Variables" project's `generate.js` compiled-output check lands) — that does not make it `[AUTO]` here, because a project's script does not travel with a folder copy, and a Standard project has none.
- **Why the distinction is enforced, not remembered.** Two rows carried `[AUTO]` on the strength of `generate.js` "failing the check", and `generate.js` only `console.warn`ed — its boolean was discarded at all three call sites, so a warning on stdout satisfied the label while blocking nothing, including in CI (audit 2026-07-26, R01). And the label is worse than nothing: a QA pass scopes the human walkthrough to whatever is left `[MANUAL]`/`[AUTO-candidate]`, so an unbacked `[AUTO]` row is excluded from the human pass **by construction** and checked by nobody. `docs-contract.test.js` now asserts that every `[AUTO]` row names a script that exists at the agent root.
- `[MANUAL]` — requires human judgement or a Litmus render.

> `validate-email.js` passing is necessary, not sufficient: it does not replace the `[MANUAL]` items or the Litmus round. A send is gated by the script **plus** the manual checks in this file, run in Claude Code — never in a chat Project.

> The agent authors in **MJML** (`template.mjml`) — there is no `inline.js`/`juice` step.
>
> **"Output" means one of two directories, and both are gated.** A project may write either or both:
> - **`output/`** — the real run. One HTML per data row on a "With Variables" project, or the single compiled email of a Standard project. **These are the files that get sent.**
> - **`dist/`** — the deterministic sample build (`build-email.js`), one fixed anonymized row, byte-identical between runs. This is what the test suite and CI gate, and it is `validate-email.js`'s drop-in default.
>
> They share no data with each other, so **a green `dist/` says nothing about `output/`** — until the 2026-07-26 audit (R09/R24/R36) the gate ran only on `dist/`, and every real send went out ungated. `generate.js` now runs the gate per row as it writes, and `npm run validate` runs it over `output/*.html` on demand.

---

## STRUCTURE

- [AUTO-candidate] Layout uses only `<table role="presentation">` — no `<div>` for layout structure
- [AUTO-candidate] Main wrapper max-width does not exceed 600px
- [AUTO-candidate] All layout tables have `cellpadding="0" cellspacing="0" border="0"`
- [AUTO-candidate] No Flexbox, CSS Grid, or `position:absolute/relative` used for layout
- [MANUAL] Table nesting stays shallow (max ~3 levels) and every `<mj-raw>` payload sits in its own `<tr><td>` (OUTLOOK_RULES Rule 16)
- [MANUAL] Renders correctly at 320px (smallest mobile) and 600px (desktop)

---

## STYLES

- [AUTO-candidate] No CSS custom properties (`var()`) anywhere in the compiled output
- [AUTO-candidate] No box-model shorthand — `padding`/`margin` declared per side (`padding-top/-right/-bottom/-left`)
- [AUTO-candidate] All `font-weight` values numeric (400/500/600/700) — never `bold`/`normal`
- [AUTO-candidate] `line-height` unitless (e.g. `1.5`) on flowing text — **except** on spacer and fixed-height cells, where explicit px is required and must match the cell's `height`, always with `mso-line-height-rule:exactly` (OUTLOOK_RULES Rules 9, 10 and 17). Written without the carve-out, this row flagged three of that file's own rules — two of them Litmus-confirmed fixes — as failures (audit 2026-07-26, R32)
- [AUTO-candidate] No named colors (`red`, `white`) — hex only
- [AUTO-candidate] No external stylesheet `<link>` tags in `<head>`
- [AUTO-candidate] The leaf `<td>`s of every block the project declares as needing one carry their own `background-color`. (Which blocks those are is the project's call — this checklist is portable and does not know your block numbering.) No agent-level script checks this — a "With Variables" project's own `generate.js` may (this repo's example project does, and it now **fails** the build rather than warning), but that script does not travel, so on any other project this is a by-hand check
- [MANUAL] Every text element declares `font-family` and `color` inline (no reliance on inheritance)
- [MANUAL] Every `<a>` declares `color` inline; every CTA `<a>` declares `text-decoration:none` inline
- [MANUAL] Same-color CSS gradients are used as dark-mode anchors per `DARK_MODE_RULES.md` (Gmail rewrites `background-color`, not `background-image`); only decorative **multi-color** gradients are exported as PNG — a same-color `linear-gradient(C,C)` is a required production fix, not a banned gradient

---

## FONTS / TYPOGRAPHY

- [AUTO-candidate] Every font stack lists **Arial before Helvetica** — `'[Project Web Font]', Arial, Helvetica, sans-serif` for display, `Arial, Helvetica, sans-serif` for body/legal (never `Helvetica, Arial, …` — falls back to Times New Roman in some Outlooks; see OUTLOOK_RULES Rule 1)
- [AUTO-candidate] Google Fonts loaded via `<link rel="stylesheet">` in `<head>`, **not** `@import` (progressive enhancement only — Outlook ignores it, the Arial fallback is what ships there; `@import` is rejected by some ESP CSS parsers — see OUTLOOK_RULES Rule 2)
- [AUTO-candidate] Web font used only on display/headline elements — body text uses `Arial, Helvetica, sans-serif` with no web font
- [MANUAL] Minimum sizes: body 14px · headline/display 22px+ · CTA text 16px+ · legal footer as per project brief
- [MANUAL] Sizes match the Figma spec for this project

---

## IMAGES

- [AUTO-candidate] Every `<img>` has explicit `width` and `height` HTML attributes **and** inline `style` with `width`, `height:auto`, `display:block`
- [AUTO-candidate] Every `<img>` has an `alt` attribute (empty `alt=""` for decorative images)
- [AUTO-candidate] No CSS `background-image` used for critical visual content (use `<img>`; same-color gradients are for dark-mode anchoring only)
- [MANUAL] Raster assets exported at 2x display size (Retina) with 1x `width`/`height` (RESPONSIVE_RULES Rule 7)
- [MANUAL] All image URLs reachable, HTTPS, and render on retina/2x screens

---

## BUTTONS / CTAs

- [AUTO-candidate] Rounded buttons hand-rolled as raw HTML + VML `<v:roundrect>` (never `mj-button` for `border-radius` — OUTLOOK_RULES Rule 5), correctly wrapped in `<!--[if mso]>` / `<!--[if !mso]><!-->`
- [AUTO-candidate] No `<button>` element used; every CTA `<a>` has `target="_blank"`
- [MANUAL] Button uses `width:100%; max-width:[value]px` — not a fixed width alone
- [MANUAL] Button min height 44px (unless the project brief documents an override — RESPONSIVE_RULES Rule 6)
- [MANUAL] VML and HTML buttons show the same label; CTA URLs are real, not placeholders

---

## OUTLOOK

Pre-send-level checks only — the full deep checklist lives in **`OUTLOOK_RULES.md` → Pre-send Checklist**. Confirm you have run through it. Quick gate:

- [AUTO-candidate] `mso-line-height-rule:exactly` alongside every explicit `line-height`
- [AUTO-candidate] `<html>` tag declares the VML `xmlns` namespaces
- [MANUAL] Every block `<td>` (including nested/spacer `<td>`s) has its own inline `background-color` (OUTLOOK_RULES Rules 7 & 17)
- [MANUAL] Litmus-tested on Outlook 2019/2021/365 (Windows): buttons rounded, backgrounds correct, no clipped content, no gray strips between blocks

---

## DARK MODE

Do not re-list the recipes here — run **`DARK_MODE_RULES.md` → Dark mode checklist** in full. Quick gate:

- [AUTO] Gmail dark-mode contract intact: `<body class="body">` always, plus `gmail-blend-screen` divs **wherever white text sits on a colored background** (`validate-email.js` blocks on the first unconditionally, and on the second only when white text is present — an email with no white-on-color needs no blend divs and must not be failed for it)
- [MANUAL] `DARK_MODE_RULES.md`'s dark-mode checklist completed (color-scheme meta, no `[data-ogsb]`/`[data-ogsc]` author rules, `mso-color-alt` matches the light-mode color, blend divs where white text sits on color, tested in Litmus)

---

## RESPONSIVE / MOBILE

Full guidance in **`RESPONSIVE_RULES.md`**. Quick gate:

- [AUTO-candidate] `max-width:480px` media query present in `<head>` `<mj-style>`
- [MANUAL] Multi-column layouts stack to single column; no horizontal scroll at 320px
- [MANUAL] Text legible without zoom (min 14px); CTAs tappable; images scale to 100% on mobile
- [MANUAL] Mobile-padding override targets the real padded `<td>` via the child-combinator chain, not a bare `.mobile-pad` (RESPONSIVE_RULES Rule 4)

---

## CONTENT & LINKS

- [AUTO] No unresolved `{{PLACEHOLDER}}` tokens remain in the output — `validate-email.js` check 2 blocks on any surviving `{{…}}`. A "With Variables" project's `generate.js` catches it earlier too, but the traveling net is the gate
- [AUTO-candidate] Every `<a>` has a discernible name (link-name / WCAG 2A) — an icon-only link must carry an `aria-label` or a **non-empty** `<img>` `alt`, or a screen reader announces an unnamed link (Litmus "Serious"). Icon links duplicating an adjacent text link still need their own name.
- [AUTO-candidate] All URLs use HTTPS
- [MANUAL] **Unsubscribe link + physical postal address reach the recipient** (CAN-SPAM / CASL) — check this on a **real test send**, not on the compiled template. Many ESPs inject both at send time, so a template without them is not automatically a violation and a template with them is not automatically compliant. **The project brief must say which side supplies them.** Written as "present in the footer", this item was unmeetable by a template whose footer has neither, and it went unresolved (audit 2026-07-26, R23)
- [MANUAL] Subject line and preheader confirmed with sender
- [MANUAL] All copy final, proofread, and in the correct market language (es-latam / pt-br / tr)

---

## FINAL OUTPUT CHECK

- [AUTO-candidate] Total HTML output under 100KB — Gmail **clips** emails over 102KB, hiding everything past the cut (including the unsubscribe link)
- [MANUAL] File saved to the project's `/output/` folder with the project naming convention (e.g. `{agent}-{client}.html`) — `dist/` holds the deterministic sample build, not the deliverable
- [MANUAL] `generate.js` ran clean — no `⚠️` warnings in the console for this build
- [MANUAL] File opens and renders correctly in a browser (Chrome + Safari minimum)

---

## SIGN-OFF

```
Project:     ________________________
Tab / market: _______________________
Language:    ________________________
Date:        ________________________
Reviewed by: ________________________

generate.js warnings:   0
Manual checks passed:   __ / __

✅ APPROVED FOR SEND  |  ❌ NEEDS FIXES
```

---

*Last updated: 2026-07-25 · v2 · FONTS: web fonts load via `<link>`, not `@import` (aligns with OUTLOOK_RULES Rule 2 + validate-email.js check 13); display-font example de-branded to `'[Project Web Font]'` for portability. DARK MODE: the Gmail-blend line now states the contract as `validate-email.js` enforces it — `<body class="body">` always, `gmail-blend-screen` divs only where white text sits on color (an email with no white-on-color must not fail for missing blend divs). v1 · rescued from oe-email-dev CHECKLIST_QA.md, modernized to the agent's MJML pipeline and current Outlook/dark-mode rules; Gmail 102KB size gate absorbed.*
