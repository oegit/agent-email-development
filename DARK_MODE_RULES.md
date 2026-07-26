# Dark Mode Rules — Force Light Mode

Emails always display in light mode. This is an intentional decision: brand colors are designed for light backgrounds. Dark mode adaptation is never applied.

**How to read this file:** the body below is the **current, per-client truth** — the confirmed recipe to apply today for each client. The full dated history (every experiment, every disproven attempt, every superseded strategy) lives in the **Experiment Log** at the end. If the body and the log ever seem to disagree, the body wins — the log is the paper trail of how we got here, not a set of instructions.

---

## Current strategy per client

| Client | What actually happens | What we ship |
|---|---|---|
| Gmail App (iOS/Android) | No CSS hook exists; rewrites `background-color`, ignores `prefers-color-scheme` | Same-color `linear-gradient` anchors + `u + .body` blend divs for white text |
| Outlook.com (web) | Heuristic auto-invert; injects inline `!important` on every rewrite | Leaf-`<td>` backgrounds + inline gradients; **no** author data-hook rules |
| Outlook Windows Desktop (Word engine) | Color auto-invert; ignores meta tags | Td-scoped VML rect for fixed blocks; `mso-color-alt` matching light-mode color |
| "New Outlook" (Monarch, Mac/Win) | Chromium engine; overrides button styling in dark mode | Known limitation — re-check every round |
| Apple Mail | Respects `color-scheme` + `prefers-color-scheme` | Meta tags + media-query override |
| Yahoo / Samsung Mail | Respect `prefers-color-scheme` / aggressive auto-invert | Media-query override + inline styles |

### Gmail App (iOS/Android)

**No CSS hooks exist for Gmail dark mode.** Gmail exposes no `data-*` attribute (the `data-ogsc`/`data-ogsb` attributes are Outlook.com's, not Gmail's) and ignores `prefers-color-scheme` entirely. The only technique that works is the same-color gradient + blend-divs approach (Rémi Parmentier):

- Gmail rewrites `background-color` but **not** `background-image`, so `background-image:linear-gradient(C,C)` (same color on both stops) anchors a background it can't strip.
- To restore **white** text on a colored background, nest `mix-blend-mode:screen` + `mix-blend-mode:difference` divs (black bg), gated to Gmail via the `u + .body` selector (requires `class="body"` on `<body>`). White-text-only — it can't restore an arbitrary color.

**CONFIRMED 2026-07-05 (Litmus, real project):** this recipe rendered exact brand colors (`#0066FF` bg, `#FF6600` CTA) in Gmail App Dark (iOS). This is the standard Gmail-dark recipe.

### Outlook.com (web)

**Ship NO author `[data-ogsb]`/`[data-ogsc]` rules.** Isolation builds proved these attributes are Outlook.com's own dark-mode hooks, and author CSS targeting them **actively breaks the render** — it doesn't just fail silently, it makes things worse (see Experiment Log, 2026-07-01 RESOLUTION). Since October 2019 Outlook.com also injects inline `!important` on every style it rewrites, so author CSS can never win those back anyway.

**Recipe:** declare backgrounds on the true leaf `<td>`s (see `OUTLOOK_RULES.md` Rule 7) + keep same-color inline `linear-gradient` background anchors. Outlook.com's native transform handles the rest acceptably.

**Accepted residue:** the CTA background gets rewritten by Outlook.com's inline `!important` (e.g. orange → dark red) — irrecoverable, but the label stays legible. Same category as the other accepted limitations.

> If a future project is ever tempted to use these hooks, run profile-isolation builds first — see `b2b-partnerships-email/generate.js --profile`.

### Outlook Windows Desktop (Word engine)

Outlook Windows ignores meta tags and `prefers-color-scheme`; its dark-mode engine inverts colors at the rendering level. Two things work here:

**1. `mso-color-alt` — ALWAYS matching the element's own light-mode color.**
```html
<p style="color:#000066; mso-color-alt:#000066;">Navy text</p>
<span style="color:#FF6600; mso-color-alt:#FF6600;">Orange text</span>
```
Treat it strictly as "lock this color, don't let any Outlook variant change it." **Never** point it at a different intended dark-mode color — it is not reliably dark-mode-scoped, and a divergent value breaks *light*-mode Outlook too (white-on-white disappearing text — confirmed, see Experiment Log).

**2. Td-scoped VML rect for fixed-size colored blocks — CONFIRMED WORKING (2026-07-01).**
A `<v:rect>` scoped to a single `<td>` with a **known fixed pixel size** (not a whole section, not the variable-width body) holds its fill against dark-mode inversion.
```html
<!--[if mso]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px; height:160px;">
<v:fill color="#0066FF" />
<v:textbox inset="0,0,0,0">
<![endif]-->
<div><!-- block content --></div>
<!--[if mso]>
</v:textbox>
</v:rect>
<![endif]-->
```
**Critical caveat:** nothing inside the `v:textbox` may carry a CSS `background-color` — Outlook dark inverts that CSS color and paints it *on top of* the VML fill. If an inner element needs a background anchor for other clients (Gmail), use `background-image:linear-gradient(C,C)` instead — Word ignores gradients entirely, so it can't cover the fill.

**Accepted limitations in this client** (no confirmed fix — do not reach for `mso-color-alt` divergence or full-section/full-body VML wraps, all proven to regress; see Experiment Log):
- Outer page/canvas background inverting.
- Colored `background-color` blocks not scoped to a fixed-size td-VML rect.
- Text sitting over a VML fill (the `mso-style-textfill` gradient was disproven — see log).
- Navy headlines / agent names shifting to auto-picked purple/pink.

### "New Outlook" (Monarch, Mac/Windows)

The post-2020 Chromium/WebView-based Outlook substitutes its own default link/button styling in dark mode, overriding author CSS more broadly than the classic Word engine (confirmed: an `mj-button`-styled CTA rendered wrong color, wrong width, square corners on "Outlook for Mac Dark"). **No confirmed fix — known limitation, re-check after every Litmus round.** The hand-rolled VML+HTML button (`OUTLOOK_RULES.md` Rule 5) stays the baseline.

### Apple Mail / Yahoo / Samsung

These respect the standard mechanisms — meta tags declare light-only, and the media query overrides any auto-invert.

```html
<meta name="color-scheme" content="light" />
<meta name="supported-color-schemes" content="light" />
```
```css
@media (prefers-color-scheme: dark) {
  .force-bg-white    { background-color:#FFFFFF !important; }
  .force-headline    { color:[project navy] !important; }
  .btn-cta           { background-color:[project CTA color] !important; color:#FFFFFF !important; }
  .force-icon        { filter:none !important; }
}
```
Replace `[project navy]` / `[project CTA color]` with the project's `CLAUDE.md` values. Apple Mail respects the meta tags; Outlook Windows ignores them completely.

---

## Why no data-hook rules (former "Layer 2")

Earlier versions of this file told templates to ship `[data-ogsc]`/`[data-ogsb]` selectors "for Gmail." That was wrong on both counts: those attributes belong to **Outlook.com**, not Gmail (Gmail has no hook at all), and shipping author rules against them **breaks Outlook.com's render** rather than helping it (isolation builds, 2026-07-01). The current rule is therefore simple: **templates ship no author CSS targeting `[data-ogsb]`/`[data-ogsc]`.** The full evidence is in the Experiment Log.

---

## Force classes reference

Every themed element carries a force class so the media-query and leaf-background rules have a stable hook:

| Class | Element | Forced color |
|---|---|---|
| `force-bg-white` | White blocks | `#FFFFFF` |
| `force-bg-offwhite` | Off-white sections | project value |
| `force-colored-bg` | Branded color blocks | project value |
| `force-headline` | Main headlines | project navy |
| `force-body-text` | Body text | project text color |
| `btn-cta` | CTA button | project CTA color |
| `force-icon` | PNG icons | `filter:none` |

The exact color values come from the project's `CLAUDE.md`.

---

## Dark mode checklist

- [ ] `color-scheme` / `supported-color-schemes` meta tags in `<head>`?
- [ ] **No** author `[data-ogsb]`/`[data-ogsc]` rules present? (shipping them is a proven Outlook.com regression, and they never belonged to Gmail)
- [ ] `@media (prefers-color-scheme: dark)` overrides for Apple Mail / Yahoo?
- [ ] Every `mso-color-alt` value matches its element's own light-mode `color`? (a divergent value breaks light-mode Outlook)
- [ ] Blend divs present where white text sits on a colored background (Gmail dark)?
- [ ] Leaf `<td>`s carry explicit `background-color` (not just the ancestor wrapper)?
- [ ] VML-fill blocks have **no** CSS `background-color` inside the `v:textbox` (use a same-color gradient anchor instead)?
- [ ] PNG icons have the `force-icon` class?
- [ ] Critical colored backgrounds tested in Outlook dark mode via Litmus?
- [ ] If a colored background inverts in Outlook Desktop dark mode: documented as a known limitation, not "fixed" with an unverified VML-rect wrap?
- [ ] If a button is involved: re-checked in "New Outlook" (Mac/Windows Monarch) dark mode specifically?

---

## Experiment Log

Chronological record of every dark-mode experiment on this agent's projects. Nothing here is a current instruction — the body above is. Kept verbatim where possible so the reasoning and Litmus evidence survive.

**2026-06-30 — Outlook.com (web), "same as Gmail" disproven.** Litmus screenshot of "Outlook.com Dark (Chrome)" on a real project showed every `force-*` class failing at once — colored backgrounds (`#0066FF`) turned gray, pure-white backgrounds (`#FFFFFF`) turned black, navy text turned the same light lavender/pink already documented for Outlook Windows Desktop's auto-invert, and the orange CTA button turned dark red. The one block that stayed correct was the one already using the `#FFFFFE` off-white value instead of pure `#FFFFFF` — consistent with that block surviving by accident (evading a pure-white/black heuristic) rather than because `data-ogsc`/`data-ogsb` actually fired. Working theory: Outlook.com web dark mode does **not** reliably respect either `data-ogsc`/`data-ogsb` or `prefers-color-scheme` — it behaves like a heuristic auto-invert engine similar to classic Outlook Windows, not "same as Gmail" as previously assumed.

**2026-07-01 — Gmail App (iOS), the hooks do nothing.** Litmus round ("Gmail App Dark (iOS 18)") showed the `[data-ogsc]`/`[data-ogsb]` overrides having zero effect — colored backgrounds (`#0066FF`) shifted to a lighter blue and the orange CTA (`#FF6600`) darkened, even though the hooks were present and correct in the sent HTML. Those attributes are **Outlook.com's**, not Gmail's — Gmail exposes no CSS hook for its dark mode at all, and also ignores `prefers-color-scheme`. Established that the only known Gmail-dark technique is the same-color-gradient + blend-divs approach (Rémi Parmentier): `background-image:linear-gradient(C,C)` anchors a background; nested `mix-blend-mode:screen`+`difference` divs (black bg, gated to Gmail via `u + .body`, requires `class="body"` on `<body>`) restore **white** text only. First attempt in `b2b-partnerships-email` (intro bar, hero bg, CTA) — unverified in Litmus at that time; **later CONFIRMED 2026-07-05** (see below).

**2026-07-01 — Outlook.com root cause found, strategy changed.** Since October 2019 Outlook.com injects inline `!important` on every style it rewrites (documented by Rémi Parmentier, "Dealing with Outlook.com's Dark Mode") — author CSS **cannot** win those back, ever. Interim strategy at this point was legibility-not-brand-color: use the `[data-ogsb]`/`[data-ogsc]` hooks to set text to a dark, readable color — never to re-force light text (which is how the 07-01 round got invisible white-on-white text). What held in that round: explicit background on the true leaf `<td>` kept white blocks white, and a same-color `linear-gradient` background-image kept an image-only block's blue — but the same gradient on a text-containing block was still overridden. *(This interim "use the hooks for legibility" strategy was superseded the same day — see next entry.)*

**2026-07-01 — RESOLUTION, isolation builds (supersedes all above about using the hooks).** Four Litmus builds of the same email isolated the variable: two WITHOUT any `[data-ogsb]`/`[data-ogsc]` author rules (a no-hacks baseline and a Gmail-layer-only build) rendered **correctly** in Outlook.com Dark; the two WITH those rules (in any flavor — brand-restore, legibility-flip, or compound `.class[attr]` selectors) rendered broken. **Author CSS targeting Outlook.com's own dark-mode attributes doesn't just fail — it actively makes the render worse.** Winning recipe for Outlook.com Dark: ship NO data-hook rules at all, declare backgrounds on the true leaf `<td>`s, keep same-color gradients as background anchors. If a future project is tempted to use these hooks, run profile-isolation builds first — see `b2b-partnerships-email/generate.js --profile`.

**2026-07-01 — `mso-color-alt` is not fully reliable, and two divergence/VML attempts regressed.** On "OL Office 365 Dark", "Outlook 2021 Dark" (Windows) and "Outlook for Mac Dark", text with `mso-color-alt` matching its light-mode color (navy `mso-color-alt:#000066`) still rendered as an auto-picked light purple/pink. Two follow-up attempts, both made things worse:
1. **Pointing `mso-color-alt` at a different color than the light-mode color** (e.g. `mso-color-alt:#FFFFFF` on navy `color:#000066` text, intending "become white in dark mode"). **Broke light-mode Outlook** — "Outlook 2016", "OL Office 365", "Outlook 2019", "OL Office 365 120 DPI" (all light-mode) also picked up the alt value, rendering the navy headline white-on-white. Rule that came out of this: **`mso-color-alt` always matches the element's own light-mode `color`.**
2. **Wrapping whole `mj-section` blocks in a VML `<v:rect>`/`<v:textbox>`.** **Skewed the entire layout** in light-mode Windows Outlook (2016/2019/365/120 DPI) — content shifted right, dead whitespace, image stretching. VML shapes don't reliably participate in normal table flow when wrapped around already-compiled MJML table output.
```html
<!-- Reference only — confirmed to break layout when wrapping a full section/table block. -->
<!--[if mso]>
<v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px; height:120px;">
<v:fill color="#0066FF" />
<v:textbox inset="0,0,0,0">
<![endif]-->
<div><!-- block content --></div>
<!--[if mso]>
</v:textbox>
</v:rect>
<![endif]-->
```
3. **Wrapping the entire `<mj-body>` in a variable-width VML `<v:rect>`** (`mso-width-percent:1000` + `mso-fit-shape-to-text:true`, to lock the outer canvas background like `#F5F5F5`). **Broke layout in Outlook Windows** — same root cause as #2, worse because the wrap spans every section. The outer-canvas inversion is a known limitation, not a fixable gap.

**2026-07-01 — td-scoped VML rect CONFIRMED WORKING.** A VML rect scoped to a single `<td>` with a known fixed pixel size (not a whole section, not the variable-width body): Litmus on "OL Office 365 Dark" and "Outlook 2021 Dark" (Windows 10) showed the intro bar's 600×160 `v:rect` holding its `#0066FF` fill exactly, light-mode layout intact across all Windows Outlook variants — the first technique to survive both. **Critical caveat:** nothing inside the `v:textbox` may carry a CSS `background-color` — Outlook dark inverts that CSS color and paints it on top of the VML fill (this is exactly how the hero block, whose inner td had `background-color`, showed a wrong blue while the intro held). Inner background anchors for Gmail must use `background-image:linear-gradient(C,C)` — Word ignores gradients, so it can't cover the fill. *(Promoted to the body above.)*

**2026-07-01 — leaf-`<td>` explicit background-color (candidate, then partially confirmed).** Root cause targeted: `mj-section`/`mj-column` `background-color` only lands on an ancestor wrapper table several levels above the actual content-holding `<td>` — the leaf cell never got its own explicit `background-color` (same bug class as `OUTLOOK_RULES.md` Rule 7). Applied to `b2b-partnerships-email` Blocks 2–5: hand-rolled `mj-raw` blocks (2, 3) got the color inlined directly on every nested `<td>`/`<div>`; MJML-generated blocks (4, 5) got it via a `leaf-bg-white` class on `mj-column` plus a child-combinator CSS chain (`.leaf-bg-white > table > tbody > tr > td > table > tbody > tr > td`) reaching the real leaf — same technique as `RESPONSIVE_RULES.md` Rule 4's mobile-padding fix, extended one level deeper because this project's global `<mj-column padding="0" />` triggers an extra MJML wrapper table. In the same Litmus round Outlook.com Dark stopped blacking-out those white blocks (Blocks 4/5 kept — headline/CTA/agent text colors still shift there, unresolved and accepted). *(The leaf-background half is now part of the Outlook.com body recipe.)*

**Off-white `#FFFFFE` value trick (candidate, untested → not adopted as general fix).** Outlook's (and Gmail's) auto-invert heuristics generally key off *exact* pure white (`#FFFFFF`) / pure black. Declaring a value one unit off — `#FFFFFE` — is visually identical everywhere but may not register as "pure white" to the heuristic. First attempt in `b2b-partnerships-email` Block 1 (logo header) only, where the background has no acceptable dark-mode alternative (client logos without dark-safe versions need a guaranteed-white plate). The 2026-07-01 Outlook.com screenshot showed Blocks 4/5 still turning dark despite the off-white value, so it is not sufficient on its own — kept only as a Block-1 experiment, superseded in practice by the leaf-`<td>` background approach.

**2026-07-05 — `mso-style-textfill` gradient DISPROVEN for text over VML fills.** Two Litmus rounds on `b2b-partnerships-email` intro text over a VML-filled `<td>`, block at the end of the head AND relocated before all other CSS (the source's placement requirement): white-textfill text rendered near-black in OL 365 Dark / Outlook 2021 Dark both times. Matches the per-Outlook-copy discrepancy the source (emailsyall.com, "Mitigating the Disaster") itself reports for light textfill over dark fills. Technique removed from the project; the inverted intro text is accepted as a known limitation, same category as the colored-background inversion. May still be worth testing for text over plain (non-VML) backgrounds — but don't reach for it over VML. Original recipe kept for reference:
```css
.keep-text-color {
  mso-style-textfill-type:gradient;
  mso-style-textfill-fill-gradientfill-stoplist:"0 \#FFFFFF 0 100000\,100000 \#FFFFFF 0 100000";
}
```

**2026-07-05 — Gmail App (iOS) gradient + blend divs CONFIRMED.** Same-color `background-image:linear-gradient(C,C)` on colored/CTA backgrounds + the `u + .body` blend-divs for white text rendered exact brand colors (`#0066FF` bg, `#FF6600` CTA) in Gmail App Dark (iOS) on a real project. Promoted to the standard Gmail-dark recipe (body above). Same day also confirmed: proportional logo in Gmail (Chrome), and Outlook.com Dark production without the data-hook layer (only residue there: the CTA background rewritten dark red by inline `!important`, label legible — accepted).

**"New Outlook" (Monarch, Mac/Win) button styling — known limitation.** Confirmed via Litmus on "Outlook for Mac Dark" (macOS 15, Chromium/WebView engine): an `mj-button`-styled CTA rendered wrong color (red), wrong width, square corners — none of the declared styles honored. Different failure mode than classic Word-engine Outlook. No confirmed fix; re-check after every Litmus round.

**2026-07-05 — advisor analysis disposition (`analisis_mjml_outlook_dark.md`, archived).** An external advisor's analysis was reviewed and its file removed from the agent folder (archived outside this folder by whoever ran the review, and recoverable from git history). Disposition per insight: **profiles idea → implemented** as `--profile` isolation builds (first payoff 2026-07-01: root-caused the Outlook.com breakage above); **data-hook advice for Outlook.com → disproven** by those same isolation builds (author `[data-ogsb]`/`[data-ogsc]` rules actively worsen the render); **broad `.leaf-bg-white td` selector → not adopted** — the tighter child-combinator chain plus `generate.js`'s automatic compiled-output verification address the MJML-structure fragility the advisor was worried about, without matching unintended descendant `<td>`s.

---

*Last updated: 2026-07-05 · v2 · restructured — body = per-client current truth, full history moved to Experiment Log, checklist rewritten to match reality.*
