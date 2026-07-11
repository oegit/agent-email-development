# Pre-Send QA Checklist

Run this before any email leaves for a real send. It is the single consolidated pre-send gate for the agent — the deep, client-specific rationale lives in the rules files (`OUTLOOK_RULES.md`, `DARK_MODE_RULES.md`, `RESPONSIVE_RULES.md`); this file only lists the checks and points there.

**Legend**

- `[AUTO]` — verified automatically today by `generate.js`'s compiled-output check (`verifyCompiledHtml`). If the build printed no `⚠️` for the item, it passed.
- `[AUTO-candidate]` — mechanically checkable but **not** automated yet (the agent has no `validate.js`). Backlog for a future validate script; verify by hand for now.
- `[MANUAL]` — requires human judgement or a Litmus render.

> The agent authors in **MJML** (`template.mjml`) compiled through `generate.js` — there is no `inline.js`/`juice` step and no `validate.js`. "Output" means the compiled HTML in the project's `/output/` folder.

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
- [AUTO-candidate] All `line-height` values unitless (e.g. `1.5`) — not px
- [AUTO-candidate] No named colors (`red`, `white`) — hex only
- [AUTO-candidate] No external stylesheet `<link>` tags in `<head>`
- [AUTO] Leaf `<td>`s of the white blocks carry their own `background-color` (generate.js checks the block 4/5 leaf-bg contract; if MJML nesting changed, the build warns)
- [MANUAL] Every text element declares `font-family` and `color` inline (no reliance on inheritance)
- [MANUAL] Every `<a>` declares `color` inline; every CTA `<a>` declares `text-decoration:none` inline
- [MANUAL] Same-color CSS gradients are used as dark-mode anchors per `DARK_MODE_RULES.md` (Gmail rewrites `background-color`, not `background-image`); only decorative **multi-color** gradients are exported as PNG — a same-color `linear-gradient(C,C)` is a required production fix, not a banned gradient

---

## FONTS / TYPOGRAPHY

- [AUTO-candidate] Every font stack lists **Arial before Helvetica** — `'Wix Madefor Display', Arial, Helvetica, sans-serif` for display, `Arial, Helvetica, sans-serif` for body/legal (never `Helvetica, Arial, …` — falls back to Times New Roman in some Outlooks; see OUTLOOK_RULES Rule 1)
- [AUTO-candidate] Google Fonts `@import` present in `<head>` (progressive enhancement only — Outlook ignores it, the Arial fallback is what ships there)
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

- [AUTO] Gmail dark-mode contract intact: `<body class="body">` + `gmail-blend-screen` divs present (generate.js warns if missing)
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

- [AUTO] No unresolved `{{PLACEHOLDER}}` tokens remain in the output (generate.js fails the check if any `{{…}}` survives)
- [AUTO-candidate] Every `<a>` has a discernible name (link-name / WCAG 2A) — an icon-only link must carry an `aria-label` or a **non-empty** `<img>` `alt`, or a screen reader announces an unnamed link (Litmus "Serious"). Icon links duplicating an adjacent text link still need their own name.
- [AUTO-candidate] All URLs use HTTPS
- [MANUAL] Unsubscribe link present in footer (legal requirement)
- [MANUAL] Physical address present in footer (CAN-SPAM / CASL compliance)
- [MANUAL] Subject line and preheader confirmed with sender
- [MANUAL] All copy final, proofread, and in the correct market language (es-latam / pt-br / tr)

---

## FINAL OUTPUT CHECK

- [AUTO-candidate] Total HTML output under 100KB — Gmail **clips** emails over 102KB, hiding everything past the cut (including the unsubscribe link)
- [MANUAL] File saved to the project's `/output/` folder with the project naming convention (e.g. `{agent}-{client}.html`)
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

*Last updated: 2026-07-05 · v1 · rescued from oe-email-dev CHECKLIST_QA.md, modernized to the agent's MJML pipeline and current Outlook/dark-mode rules; Gmail 102KB size gate absorbed.*
