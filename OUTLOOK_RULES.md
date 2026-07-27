# Outlook Compatibility Rules

Outlook for Windows uses the **Microsoft Word rendering engine** — not WebKit or Blink. This means it ignores most modern CSS. These rules are mandatory for every email.

---

## RULE 1 — Fonts: match the fallback to the brand font's category (Arial before Helvetica for sans-serif)

**Problem:** Outlook on Windows does not have Helvetica installed by default. Without it, it falls back to Times New Roman (serif).

**Fix:**
```css
/* ❌ Wrong */
font-family: Helvetica, Arial, sans-serif;

/* ✅ Correct — sans-serif brand font */
font-family: 'Your Web Font', Arial, Helvetica, sans-serif;

/* ✅ Correct — serif brand font (e.g. Playfair Display) */
font-family: 'Your Serif Web Font', Georgia, 'Times New Roman', serif;

/* ✅ Correct — monospace brand font */
font-family: 'Your Mono Web Font', 'Courier New', monospace;
```

**Why:** Arial is present on every Windows system. Helvetica is primarily a macOS font.

**The Arial-before-Helvetica ordering is scoped to sans-serif brand fonts, and the scope matters.** Outlook ignores the web font entirely (Rule 2), so the fallback chain *is* what ships there. Fall a **serif** brand font back to Arial and Outlook renders a serif design in a sans-serif face — no error anywhere, just silently off-brand. Georgia ships on both Windows and macOS and `'Times New Roman'` is the universal serif backstop, which is why the serif chain reads `Georgia, 'Times New Roman', serif`; monospace follows the same logic with `'Courier New', monospace`. This carve-out was stated in `CLAUDE.md` Font Rule 7 and never reached this file — the one the pre-send checklist tells you to consult (audit 2026-07-26 R2, J7/J8).

---

## RULE 2 — Google Fonts: load via `<link>`, never `@import` or `<mj-font>`

**Problem:** Outlook for Windows ignores web fonts entirely — the Outlook experience always renders in the Arial fallback, whatever loading method you use. So the method is chosen for the *other* clients (Apple Mail is the one that actually loads it), and there the loader must survive ESP sanitizers.

**Fix:** Load the web font with a `<link rel="stylesheet">` in `<head>`, wrapped in a non-MSO conditional, and always ship a robust Arial fallback inline. Design must look acceptable in Arial too.

```html
<!-- In <head>, inside <mj-raw> — loads in Apple Mail; Gmail strips it (Arial there); Outlook ignores it (Arial) -->
<!--[if !mso]><!-->
<link href="https://fonts.googleapis.com/css2?family=Your+Web+Font&display=swap" rel="stylesheet" type="text/css">
<!--<![endif]-->
```

```css
/* Inline on every element — this is what Outlook actually uses */
style="font-family:'Your Web Font', Arial, Helvetica, sans-serif;"
```

**Do not use `@import`.** Several ESP CSS parsers reject it (Gmail strips it outright), and `validate-email.js` blocks on any `@import` in the compiled output (check 13).

**Do not use MJML's `<mj-font>` either.** It emits a redundant CSS `@import` `<style>` block *alongside* the `<link>` — which Mailchimp's CSS parser errors on (`Cannot find a CSS file at …fonts.googleapis…`, reported from a real Mailchimp paste). Hand-write the `<link>` in an `<mj-raw>` block so only the `<link>` ships. *(This was found the hard way in the `b2b-partnerships-email` project — the template moved to `<link>`-only on 2026-07-07; the rule was written back here so the next project doesn't reach for `<mj-font>` for convenience and reintroduce the `@import`.)*

> ⚠️ **Pending render verification.** The `<link>`-only method is not yet confirmed in a Litmus round *after* the 2026-07-07 swap — the last documented rounds are 2026-07-05, when `<mj-font>` still emitted both the `<link>` and the `@import`. The `<link>` was always the real loader (the `@import` was redundant), so the web font is expected to keep loading in Apple Mail (macOS/iOS) — but confirm it in the next Litmus round before treating it as verified.

---

## RULE 3 — Layout: tables, not divs

**Problem:** Outlook does not respect `display:flex`, `display:grid`, or `<div>`-based layouts.

**Fix:** All layout uses nested `<table>` with `role="presentation"`.

```html
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0">
  <tr>
    <td align="center" style="padding:24px;">
      content here
    </td>
  </tr>
</table>
```

MJML handles this automatically — one of the main reasons to use it.

---

## RULE 4 — Backgrounds: always inline

**Problem:** Outlook ignores `background-color` set via external CSS classes. Only inline styles on the element itself work.

**Fix:**
```html
<!-- ❌ Wrong — Outlook ignores the class -->
<td class="bg-blue">

<!-- ✅ Correct — inline + class for other clients -->
<td style="background-color:#0066FF;" class="force-intro-bg">
```

Applies to: `background-color`, `background-image`, padding, margin, width.

---

## RULE 5 — border-radius: does not exist in Outlook

**Problem:** Outlook ignores `border-radius` completely. Rounded buttons appear as squares.

**⚠️ `mj-button` does NOT generate this VML automatically.** Confirmed in MJML 4.18: `mj-button` with `border-radius` only emits `border-radius` in plain CSS on the `<td>`/`<a>` — no `<v:roundrect>` fallback at all. Discovered via Litmus on real Outlook 2016/2019/2021/365 (Windows): button rendered as a square despite `border-radius="200px"` on the component. **Always hand-roll rounded buttons as raw HTML** (see snippet below) — never rely on `mj-button` for this. This corrects the assumption elsewhere in this agent's docs that MJML handles Outlook-safe markup "automatically" — that's true for table layout (Rule 3), not for border-radius.

**Fix for buttons — VML:**
```html
<!--[if mso]>
<v:roundrect xmlns:v="urn:schemas-microsoft-com:vml"
             xmlns:w="urn:schemas-microsoft-com:office:word"
             href="{{CTA_URL}}"
             style="height:50px; width:400px; v-text-anchor:middle;"
             arcsize="50%"
             fillcolor="#FF6600"
             stroke="false">
  <w:anchorlock/>
  <center style="color:#FFFFFF; font-family:Arial,sans-serif; font-size:22px; font-weight:700;">
    Button Label
  </center>
</v:roundrect>
<![endif]-->
<!--[if !mso]><!-->
<a href="{{CTA_URL}}" style="background-color:#FF6600; border-radius:200px; ...">
  Button Label
</a>
<!--<![endif]-->
```

**Fix for circular agent photos:**
`border-radius:50%` does not work in Outlook. Options:
1. Export the photo already cropped as a circle from Figma (transparent PNG)
2. Use VML `<v:oval>` (complex)
3. Accept that in Outlook the photo appears square with the border — document this as acceptable

---

## RULE 6 — Circular photo workaround

**The table-with-square-border technique below is NOT visually acceptable when the photo has a colored border** — Outlook renders a square border outline around a circular photo, which looks broken (confirmed via Litmus, flagged as a real bug, not a tolerable quirk). Use it only for borderless circular photos. When there's a border, use `<v:oval>` instead — a real VML shape that Outlook renders as a true circle, stroke included:

```html
<!--[if mso]>
<v:oval xmlns:v="urn:schemas-microsoft-com:vml" style="width:140px; height:140px; margin:0 auto; display:block;"
        strokecolor="#00DDDD" strokeweight="3px" fillcolor="none">
  <v:fill type="frame" src="{{PHOTO_URL}}" />
</v:oval>
<![endif]-->
<!--[if !mso]><!-->
<img src="{{PHOTO_URL}}" width="140" height="140"
     style="width:140px; height:140px; display:block;
            border:3px solid #00DDDD; border-radius:50%; box-sizing:border-box;
            object-fit:cover;" />
<!--<![endif]-->
```

Older square-table workaround (borderless circular photos only):

```html
<!--[if mso]>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center">
  <tr>
    <td width="140" height="140"
        style="width:140px; height:140px;
               mso-line-height-rule:exactly; line-height:0; font-size:0;">
<![endif]-->
<img src="{{PHOTO_URL}}" width="140" height="140"
     style="width:140px; height:140px; display:block;
            border-radius:50%;
            object-fit:cover;" />
<!--[if mso]>
    </td>
  </tr>
</table>
<![endif]-->
```

---

## RULE 7 — Gray gaps between blocks

**Problem:** Outlook inherits the `background-color` of `<body>` (typically `#F5F5F5`) on any `<td>` that does not have an explicit background. This creates gray strips between blocks that should be white.

**Fix:** Every block `<td>` has its own inline `background-color` — with exactly one exception, inside a `<v:textbox>` (see *The one exception* below).

```html
<!-- ❌ Wrong — inherits #F5F5F5 from body -->
<td align="center" style="padding:48px 50px;">

<!-- ✅ Correct -->
<td align="center" style="background-color:#FFFFFF; padding:48px 50px;">
```

**This applies inside nested raw-HTML tables too, not just top-level blocks.** Confirmed via Litmus on Outlook 2016–365 (Windows): a contact card with a colored background (`#FAFAFA`) containing its own mini-tables (icon + text rows) and spacer `<td>` rows showed visible gray stripes at every spacer row and wrapper `<td>` that didn't carry the card's own background-color explicitly. A spacer row like `<td style="height:12px; font-size:0; line-height:0;">&nbsp;</td>` needs `background-color:#FAFAFA` (or whatever the card's bg is) added too — height/font-size/line-height alone aren't enough.

**Goes one level deeper than just the wrapper.** A mini-table's own *inner* cells (e.g. the icon `<td>` and the text `<td>` inside an icon+text row) also need their own explicit `background-color`, even when their immediate parent `<td>` already has it. Don't assume a nested table's cells transparently show the ancestor's color through in Word's renderer — give every `<td>` in the stack its own explicit background, not just the outermost one.

**The one exception — inside a `<v:textbox>`, a CSS `background-color` is forbidden.** When a block is wrapped in the td-scoped VML rect of `DARK_MODE_RULES.md` (Outlook Windows Desktop), nothing inside the `<v:textbox>` may carry a CSS `background-color`: Outlook dark inverts that color and paints it *on top of* the VML fill. Litmus-confirmed — this is exactly how a hero block whose inner `<td>` had a `background-color` showed a wrong blue while the intro block, without one, held (`DARK_MODE_RULES.md` → Experiment Log, 2026-07-01). If an inner element still needs a background anchor for Gmail, use `background-image:linear-gradient(C,C)` instead — Word ignores gradients, so a gradient cannot cover the fill.

This rule and that one are not in tension once you know which is which: **outside** a `<v:textbox>`, a missing `background-color` gives you gray strips; **inside** one, a present `background-color` gives you the wrong color. Stated without the carve-out, this rule sent a reader straight into the confirmed regression (audit 2026-07-26 R2, J6).

---

## RULE 8 — Images: always explicit width and height

**Problem:** Outlook may scale images incorrectly without exact dimensions.

**Fix:**
```html
<img src="image.jpg"
     width="600" height="400"
     style="width:100%; max-width:600px; height:auto; display:block;" />
```

- `width` and `height` as HTML attributes (Outlook reads these)
- `style` with `width:100%` for responsive in other clients
- Always `display:block` to eliminate phantom spacing below images

---

## RULE 9 — Spacers: use `<td>` with height, not margin or padding

**Problem:** Outlook ignores `margin-top`/`margin-bottom` on inline elements and some `padding` on specific elements.

**Fix — spacer rows:**
```html
<tr>
  <td style="height:20px; font-size:0; line-height:0; mso-line-height-rule:exactly;">&nbsp;</td>
</tr>
```

---

## RULE 10 — mso-line-height-rule

**Problem:** Outlook may add extra space above and below text due to its line-height handling.

**Fix:** Add `mso-line-height-rule:exactly;` alongside any explicit `line-height`.

```css
style="line-height:38px; mso-line-height-rule:exactly;"
```

---

## RULE 11 — Vertical dividers between logos

**Problem:** A `<div>` with `border-left` as a vertical separator between logos does not work in Outlook.

**Fix:**
```html
<td style="width:1px; font-size:0; mso-line-height-rule:exactly;">
  <div style="width:1px; height:25px; border-left:1px solid #D6D6D6; font-size:0; line-height:25px;">&nbsp;</div>
</td>
```

---

## RULE 12 — VML namespace declarations

For any VML to work (buttons, workarounds), the `<html>` tag must declare the namespaces:

```html
<html xmlns="http://www.w3.org/1999/xhtml"
      xmlns:v="urn:schemas-microsoft-com:vml"
      xmlns:o="urn:schemas-microsoft-com:office:office">
```

And in `<head>`:
```html
<!--[if mso]>
<noscript><xml>
  <o:OfficeDocumentSettings>
    <o:AllowPNG/>
    <o:PixelsPerInch>96</o:PixelsPerInch>
  </o:OfficeDocumentSettings>
</xml></noscript>
<![endif]-->
```

---

## RULE 13 — mso-table-lspace and mso-table-rspace

Eliminate phantom spacing between tables in Outlook:

```css
table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
```

---

## RULE 14 — Icons wrapped in `<a>`: explicit display:block

**Problem:** Wrapping a small icon `<img>` in an `<a>` tag to make it clickable (alongside text in the same row) adds unwanted vertical spacing in WebKit-based clients (Apple Mail, Outlook for Mac) — the `<a>` is inline by default and picks up default line-height padding the `<img>` alone didn't have. Confirmed via Litmus: a contact card with two rows (icon + text, both wrapped in matching `mailto:`/`tel:` links) showed visibly larger gaps specifically around the rows where the icon was link-wrapped, vs. a row with a static (non-link) icon.

**Fix:** Style the wrapping `<a>` the same way you'd style the image itself:

```html
<a href="mailto:{{EMAIL}}" style="display:block; line-height:0; font-size:0;">
  <img src="{{ICON_URL}}" width="20" height="20" style="display:block; width:20px; height:20px;" />
</a>
```

---

## RULE 15 — mj-raw: always verify the closing tag

**Problem:** A missing `</mj-raw>` doesn't throw an MJML compile error (`validationLevel: 'soft'` swallows it silently) — instead, MJML drops the *entire remaining content of the parent `mj-column`* with no warning. Whatever comes after the unclosed `mj-raw` (more raw HTML, `mj-text`, anything) silently disappears from the compiled output. This is easy to miss because the build still "succeeds."

**Fix:** Whenever hand-writing a multi-block `mj-raw` (VML + HTML fallback, conditional comments, etc.), explicitly count `<mj-raw>` against `</mj-raw>` before testing. After compiling, grep the output for a distinctive string from *every* sibling that follows the `mj-raw` in source — not just the raw block's own content — to confirm nothing downstream got swallowed.

---

## RULE 16 — mj-raw content needs its own `<tr><td>`, never a bare child of `<tbody>`

**Problem:** `mj-raw` inserts its content verbatim at the exact point it appears in the source — MJML does **not** auto-wrap it in `<tr><td>` the way `mj-text`/`mj-image`/etc. do for their own output. If an `mj-raw` block's top-level content is a `<table>` or an `<img>` (not already wrapped in its own `<tr><td>`), it ends up as a **direct child of the column's generated `<tbody>`**, sitting next to real `<tr>` siblings.

This is invalid HTML, and different engines fail differently:
- **Standards-compliant parsers** (Gmail web, Apple Mail, Outlook.com, Yahoo — anything following the HTML5 tree-construction algorithm): a `<table>` start tag encountered while already inside a table forces the parser to close the *outer* table early and reprocess everything after as a new sibling structure; a bare `<img>` gets foster-parented out of the table entirely. Either way, content silently relocates away from where it was authored.
- **Outlook (Word engine):** doesn't apply HTML5 foster-parenting, but has its own table-layout quirks with non-row content sitting between/beside `<tr>` elements — can manifest as extra/missing spacing, or content not centering the way an `align="center"` on a sibling `<tr><td>` normally would.

Confirmed via direct inspection of compiled output (not a guess): a header-logo table with **zero** `<tr>` anywhere in its column, a CTA button's HTML-fallback `<table>` sitting bare among `<tr>` siblings, and an agent photo `<img>`/`<v:oval>` pair plus a whole second contact-details `<table>` — all bare children of their `<tbody>`.

**Fix:** Always wrap the entire `mj-raw` payload — VML conditional branches and all — in one `<tr><td align="center" style="padding:0;">...</td></tr>`:

```html
<mj-raw>
  <tr>
    <td align="center" style="padding:0;">
      <!--[if mso]>
      <v:roundrect ...>...</v:roundrect>
      <![endif]-->
      <!--[if !mso]><!-->
      <table role="presentation" ...>...</table>
      <!--<![endif]-->
    </td>
  </tr>
</mj-raw>
```

The `<tr><td>` wrapper is transparent to VML positioning (VML shapes position via their own `style` attribute, not table flow) — adding it doesn't change how Outlook renders the VML branch, it only fixes validity for every other client.

---

## RULE 17 — Phantom gray lines between stacked rows: don't stack separate `<table>`s, and never contradict an explicit spacer height with `line-height:0`

**Problem:** A contact card with 3 icon+text rows (title/email/phone), each built as its own separate `<table>` stacked inside an outer wrapper, showed thin gray lines between rows in every Windows Outlook version (2016, 365, 2019, 365 120 DPI) — even after every `<td>` in the stack already had its own explicit matching `background-color` (Rule 7). Adding more background-color did not fix it, which ruled out "a `<td>` without background inheriting the page color" as the cause.

**Confirmed fix, two parts together:**
1. **Merge separate stacked `<table>`s into one table with multiple `<tr>` groups.** Outlook/Word can insert implicit spacing between sibling `<table>` elements treated as independent document objects — a single table with more rows doesn't have that boundary.
2. **On spacer `<td>`s, add the HTML `height` attribute in addition to the CSS `height`, and set `line-height` to match the height — not `0`.** `<td height="12" style="height:12px; line-height:12px; font-size:0; mso-line-height-rule:exactly;">&nbsp;</td>`. Word's renderer is more reliable with the raw HTML attribute than CSS alone, and `line-height:0` paired with an explicit height is a self-contradicting pair some Word builds resolve by falling back to the font's natural line box instead of collapsing to zero — matching the two values removes the ambiguity.

```html
<!-- ✅ One table, height attribute + matching line-height on spacers -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" bgcolor="#FAFAFA" style="background-color:#FAFAFA; mso-table-lspace:0pt; mso-table-rspace:0pt;">
  <tr>
    <td valign="middle" style="background-color:#FAFAFA;">icon</td>
    <td valign="middle" style="background-color:#FAFAFA;">text</td>
  </tr>
  <tr>
    <td colspan="2" height="12" style="height:12px; background-color:#FAFAFA; font-size:0; line-height:12px; mso-line-height-rule:exactly;">&nbsp;</td>
  </tr>
  <!-- next row group... -->
</table>
```

Confirmed via Litmus on Outlook 2016/365/2019/365-120DPI (Windows) — gray lines gone after both changes applied together. Not isolated individually, so it's undetermined which one alone would have been sufficient — treat them as a pair when reusing this fix.

---

## RULE 18 — CSS hygiene the Word engine (and old clients) need

Outlook's Word renderer — and several older/webmail clients — mishandle CSS shorthand and keyword values. Author defensively:

- **No box-model shorthand.** Declare `padding`/`margin` per side, never combined.
  ```css
  /* ❌ Wrong */  padding: 16px 24px;
  /* ✅ Correct */ padding-top:16px; padding-right:24px; padding-bottom:16px; padding-left:24px;
  ```
- **`line-height` unitless for flowing text** (`line-height:1.5`) — a px line-height on a paragraph compounds badly with the surrounding type scale. **Explicit px is required, not banned, on spacer and fixed-height cells**, and must always be paired with `mso-line-height-rule:exactly`:
  ```css
  /* ✅ flowing text */   line-height:1.5;
  /* ✅ spacer / fixed-height cell */  height:12px; line-height:12px; mso-line-height-rule:exactly;
  ```
  **The carve-out is not a softening — three rules in this same file depend on it**, two of them Litmus-confirmed fixes: Rule 9's spacer (`line-height:0`), Rule 10's whole point (pairing a px line-height with `mso-line-height-rule`), and Rule 17's confirmed fix (`line-height:12px` matching an explicit `height`, explicitly *not* `0`). Written as "unitless only", this rule contradicted all three, and a QA pass run to the checklist flagged this file's own confirmed fixes as failures (audit 2026-07-26, R32). `PRE_SEND_QA.md`'s STYLES row carries the same carve-out, and `docs-contract.test.js` holds the two together.
- **`font-weight` numeric only** (`400`/`500`/`600`/`700`) — never `bold`/`normal`; keyword weights render inconsistently across clients.
- **Every `<img>` carries `alt`** (empty `alt=""` for decorative images) in addition to the explicit `width`/`height` + `display:block` of Rule 8 — a missing `alt` shows a broken-image label when images are blocked (Outlook/Gmail block by default).

---

## Pre-send Checklist

- [ ] Every **sans-serif** font stack has Arial before Helvetica — and a serif/monospace brand font has a matching chain instead (`Georgia, 'Times New Roman', serif` · `'Courier New', monospace`), never Arial (Rule 1)?
- [ ] No box-model shorthand — padding/margin per side; `line-height` unitless on flowing text, except explicit px matching the cell height on spacers (Rules 9/10/17); font-weight numeric (Rule 18)?
- [ ] Every `<img>` has an `alt` attribute (empty for decorative) (Rule 18)?
- [ ] Every block `<td>` has an inline `background-color` — **except** inside a `<v:textbox>`, where it must have none (Rule 7)?
- [ ] Buttons have VML + HTML fallback?
- [ ] Images have `width` and `height` as HTML attributes?
- [ ] Vertical spacing uses spacer `<td>` rows, not margins?
- [ ] `mso-line-height-rule:exactly` alongside every `line-height`?
- [ ] `<html>` tag has VML `xmlns` declarations?
- [ ] If using `mj-button` with `border-radius`: replaced with hand-rolled VML, not left as-is (Rule 5)?
- [ ] Every spacer/wrapper `<td>` inside nested raw-HTML tables has its own `background-color` (Rule 7)?
- [ ] Every hand-written `<mj-raw>` has a matching `</mj-raw>` (Rule 15)?
- [ ] Every `<mj-raw>` whose content is a `<table>` or `<img>` is wrapped in its own `<tr><td>` — never a bare child of the column's `<tbody>` (Rule 16)?
- [ ] Stacked icon+text rows live in ONE table with multiple `<tr>`s, not several separate `<table>`s — and every spacer `<td>` has both the HTML `height` attribute and a matching (non-zero) `line-height` (Rule 17)?

---

*Last updated: 2026-07-26 · v5 · Round-2 audit fixes (`audit/RECONCILE_AGENT_EMAIL_DEVELOPMENT_20260726_R2.md`). **Rule 1 re-framed as "match the fallback to the brand font's category"**: the Arial-before-Helvetica ordering is scoped to sans-serif brand fonts and the serif/monospace chains are given as ✅ examples, because `CLAUDE.md` Font Rule 7 had carved that out and the carve-out never reached this file — the one the pre-send checklist tells the reader to consult, so following the documented pointer confirmed the wrong answer (J7/J8). **Rule 7 gains its one exception**: no CSS `background-color` inside a `<v:textbox>`, the Litmus-confirmed regression `DARK_MODE_RULES.md` records; stated flat, this rule sent a reader straight into it (J6). Both pre-send checklist rows scoped to match. `docs-contract.test.js` §4 now holds all three carve-outs — line-height, block-`<td>` background, font fallback — as one table instead of a bespoke block per rule. Footer bumped as part of J14. v4 · Rule 2 rewritten: web fonts load via `<link rel="stylesheet">` (non-MSO conditional), never `@import` (ESP-rejected, blocked by validate-email.js check 13) nor MJML's `<mj-font>` (emits a redundant `@import` Mailchimp rejects). The "why" was written back from the `b2b-partnerships-email` template's `<link>`-only fix (2026-07-07) so the next project doesn't reintroduce it — plus an explicit pending-Litmus caveat (last render round predates the swap). v3 · Rule 18 (CSS hygiene: no box-model shorthand, unitless line-height, numeric font-weight, img alt) absorbed from oe-email-dev.*
