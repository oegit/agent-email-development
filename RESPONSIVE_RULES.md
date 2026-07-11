# Responsive Rules

Emails must display correctly on desktop (600px) and mobile (up to 480px). MJML handles the responsive structure automatically, but specific decisions must be applied consistently across all projects.

---

## Standard widths

- **Desktop:** 600px — fixed width, centered in the email client
- **Mobile:** 100% of viewport — fluid, no horizontal scroll
- **Breakpoint:** 480px — below this width, mobile styles apply

---

## RULE 1 — Fluid images on mobile

Every image must scale to 100% width on mobile:

```css
@media only screen and (max-width:480px) {
  .img-full { width:100% !important; height:auto !important; }
}
```

In MJML, use `fluid-on-mobile="true"` on `mj-image`.

---

## RULE 2 — Columns stack on mobile

Multi-column desktop layouts (e.g. photo + text side by side) stack vertically on mobile — the second column moves below the first. MJML handles this automatically with `mj-column` inside `mj-section`.

If any columns should **not** stack on mobile, document this explicitly in the project's `CLAUDE.md`.

---

## RULE 3 — Mobile typography

Large desktop font sizes may be too large or too small on mobile. Scale according to the project design:

```css
@media only screen and (max-width:480px) {
  .headline   { font-size:28px !important; line-height:1.3 !important; }
  .intro-text { font-size:20px !important; }
  .agent-name { font-size:22px !important; }
}
```

Exact mobile sizes come from the Figma design. If no mobile spec exists in Figma, apply 70–80% of the desktop size as a starting point, then verify in Litmus.

---

## RULE 4 — Mobile padding

Generous desktop padding (e.g. 75px horizontal) becomes cramped on a small screen. Reduce on mobile — meaning **replace** the desktop value, not add to it.

**⚠️ The naive version of this rule has a real bug if you're using MJML.** `mj-section`'s `css-class` attribute puts the class on the *outer* `<div>` MJML generates — but the section's own `padding` attribute compiles onto a *different*, inner `<td>` one level down (`<div class="mobile-pad"><table><tbody><tr><td style="padding:48px 50px;">`). A bare `.mobile-pad { padding-left:24px !important; ... }` rule targets the div, which has no padding of its own — so on mobile you get the div's new 24px **plus** the inner td's untouched desktop value (50px), e.g. 74px total instead of the intended 24px. Confirmed via direct inspection of compiled MJML output, not a guess — check this yourself by reading the actual generated HTML for any project before trusting the class is doing what it looks like it's doing.

**Fix — target the actual padded element with a child-combinator chain, not the class's own element:**

```css
@media only screen and (max-width:480px) {
  /* ">" chain reaches the one td MJML always generates for the section's own content padding —
     it does NOT match the deeper mj-column/mj-text wrapper tds (those sit inside an extra <div>,
     breaking the direct-child chain), so it can't accidentally zero out unrelated padding. */
  .mobile-pad > table > tbody > tr > td { padding-left:24px !important; padding-right:24px !important; }
}
```

Add the `mobile-pad` class to any block with large horizontal padding on desktop, via `mj-section`'s `css-class` attribute, same as before — only the CSS rule's selector changes.

**Doesn't apply to hand-rolled `mj-raw` blocks.** If a block's padding lives on a custom `<td>` you wrote yourself (not MJML's auto-generated one — e.g. a fixed-height block built by hand), the chain above won't reach it since it's nested differently. Put a dedicated class directly on that `<td>` and add the mobile override to that class instead.

**Always verify by reading the compiled output**, not just the source template — run the generator and grep for the actual class/element nesting before assuming a CSS rule is hitting the element you think it is.

---

## RULE 5 — Buttons on mobile

Fixed-width buttons (e.g. 400px) must expand to full width on mobile:

```css
@media only screen and (max-width:480px) {
  .btn-cta { width:100% !important; max-width:100% !important; }
}
```

---

## RULE 6 — Touch targets

On mobile, all clickable elements (buttons, links, phone numbers, email addresses) must be at least 44px tall to be easily tapped. Verify in Litmus mobile view.

**A project brief may override the 44px recommendation with documented rationale.** When a design's visual rhythm matters more than the larger tap target, the brief records the trade-off and that decision wins — QA should not re-flag it. Example: the B2B Partnerships Email brief deliberately keeps the agent-card contact rows at Figma's uniform 12px rhythm (clickable area ~20px tall) rather than padding them to 44px, because doubling the gap diverged from the design; revisited only if it becomes a real usability complaint.

---

## RULE 7 — Image assets: export at 2x for Retina displays

**Problem:** Every modern device (iPhone since 2010, MacBook since 2012, most external monitors today) renders at 2x pixel density or higher. An image exported at its literal display size looks visibly soft — especially logos, icons, and any text baked into an image.

**Fix:** Export every image asset at 2x its intended display size, but declare `width`/`height` (HTML attribute + inline style) at the 1x display size. The client downscales the larger file — sharp on Retina, normal everywhere else.

```html
<!-- Asset file is 296×112px. Displayed at 148×56px. -->
<img src="logo@2x.png" width="148" height="56" style="width:148px; height:56px; display:block;" />
```

**Why not `srcset` / `<picture>`?** Outlook ignores both completely, and several other clients strip them on send. The fixed-dimension technique above is the only one with universal email client support — it doesn't depend on the client recognizing responsive image syntax at all.

**Applies to:** logos, icons, hero/presenter images, agent or person photos, partner-supplied logos — any raster asset. Does not apply to anything built with VML/HTML directly (buttons, dividers), since those are already resolution-independent.

Figma's default export is 1x — exporting at 2x is a deliberate step (set the export scale to 2x in Figma, or request the 2x file from whoever supplies a variable asset).

---

## RULE 8 — Non-wrapping content forces horizontal overflow on mobile

**Problem:** A single unbreakable run of text can be wider than a narrow viewport (~320–375px), and because it can't wrap, it sets the whole email's minimum width — pushing every other block off-screen to the right (horizontal scroll, clipped content). The email looks fine at 600px and broken at 375px. Confirmed in-browser at 375px: a wordmark + tagline joined with `&nbsp;` (`INDEPENDENT&nbsp;BOOKSELLERS&nbsp;&middot;&nbsp;EST.&nbsp;1998`) plus wide `letter-spacing` formed a ~500px unbreakable line; the entire email overflowed until the `&nbsp;` were replaced with normal spaces.

**Common causes of an unbreakable run:**
- `&nbsp;`-joined phrases (a non-breaking space is exactly that — it forbids wrapping)
- Wide `letter-spacing` on a heading/wordmark/tagline (inflates the line's min-content width)
- Long unbroken tokens — a URL, an email address, or a `CamelCaseWordWithNoSpaces`

**Fix:**
- Use **normal spaces** in headings, wordmarks, and taglines — reserve `&nbsp;` for genuinely-must-not-break pairs (e.g. `5&nbsp;AM`), never whole phrases.
- Shrink `letter-spacing` **and** `font-size` in the `max-width:480px` query for any wide-tracked display text:
  ```css
  @media only screen and (max-width:480px) {
    .wordmark { font-size:24px !important; letter-spacing:0 !important; }
    .tagline  { font-size:11px !important; letter-spacing:1px !important; }
  }
  ```
- For long unbroken tokens that must stay on one element, add `word-break:break-word;` (or `overflow-wrap:anywhere;`) so they can break rather than set the page width.

**Always verify at 320–375px, not just 600px.** Horizontal scroll at mobile width almost always means one unbreakable element wider than the viewport — find it by narrowing the window until the scrollbar appears and seeing what doesn't wrap.

---

## Base media query block

Include this in the `<mj-style>` of every template, adjusting values to the project:

```css
@media only screen and (max-width:480px) {
  .email-container { width:100% !important; max-width:100% !important; }
  .img-full        { width:100% !important; height:auto !important; }
  /* Child-combinator chain, NOT a bare `.mobile-pad` — see RULE 4 for why the naive
     selector lands on the wrong wrapper and produces ~74px instead of 24px on mobile. */
  .mobile-pad > table > tbody > tr > td { padding-left:24px !important; padding-right:24px !important; }
  .btn-cta         { width:100% !important; max-width:100% !important; }

  /* Typography — adjust sizes to the project */
  .headline        { font-size:28px !important; line-height:1.3 !important; }
  .intro-text      { font-size:20px !important; }
}
```

---

## Litmus verification

In the QA step, verify specifically:
- Do images scale correctly on mobile?
- Do columns stack as expected?
- Is text readable without zooming?
- Are buttons easy to tap?
- Is there any horizontal scroll? (indicates a fixed-width element wider than 480px)
- Do logos, icons, and photos look sharp on a Retina/high-DPI screen, not soft or pixelated?

---

*Last updated: 2026-07-10 · v3 · RULE 8 (non-wrapping content — `&nbsp;`/letter-spacing/long tokens — forces mobile horizontal overflow), from the portability-review test build.*
