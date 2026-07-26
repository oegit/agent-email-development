# Figma → Email Workflow

Standard process for converting a Figma design into a production HTML email. Applies to both Standard and With Variables projects. The difference between types appears in steps 5 and 6.

---

## Prerequisites

- Figma Desktop open with the design file
- Dev Mode MCP Server active: Figma Menu → Preferences → Enable Dev Mode MCP Server
- Claude Code running locally (accesses Figma via localhost)
- MJML installed **as a project dependency** (`npm install mjml` inside the project folder, pinned to an exact version in `package.json` — not `npm install -g`). See note below on why.
- Node.js available

**MJML version note:** use the latest stable major version for new projects (5.x as of this writing) — check `npm view mjml version` rather than assuming. Pin an exact version (`"mjml": "5.3.0"`, no `^`) instead of a caret range — this pipeline hand-writes raw VML inside `mj-raw` blocks, and even minor MJML version drift is worth re-testing deliberately, not picking up silently on the next `npm install`.

**MJML 5 breaking change:** `mjml2html()` is now **async** — `await mjml2html(...)`, not `const { html } = mjml2html(...)`. If migrating a project from MJML 4, every call site needs this fixed or it throws `TypeError: The "data" argument must be of type string... Received undefined`.

**Never test against a bare `npx mjml` from outside the project folder.** `npx` without a local `node_modules/mjml` fetches whatever the latest published version is (e.g. testing in `/tmp`) — which can silently differ from the version actually pinned in the project, leading to debugging a "bug" that's really just a version mismatch between what you're testing and what's deployed. Always test through the project's own `require('mjml')` (e.g. via `generate.js`, or `node -e "require('mjml')..."` run from inside the project folder), or `npx mjml` run from inside the project so it resolves the local install.

---

## STEP 1 — Read the project CLAUDE.md

Before opening Figma, read the project brief. Understand:
- Project type (Standard or With Variables)
- Client and email purpose
- Data source if With Variables
- Any design decisions already documented

---

## STEP 2 — Get fileKey and nodeId from Figma

The project `CLAUDE.md` contains the fileKey and nodeId. If not present, ask for them.

The nodeId is also in the Figma URL:
```
https://www.figma.com/design/[fileKey]/...?node-id=120-442
                                                    ^^^^^^^
                                                    nodeId: 120:442  (- in URL → : in the tool)
```

---

## STEP 3 — Read the design from Claude Code

```
get_design_context(
  fileKey: "[project fileKey]",
  nodeId: "[project nodeId]",
  clientLanguages: "html,css"
)
```

Extract and document all design tokens:
- **Colors** — all hex values, including backgrounds and text
- **Typography** — font-family, font-size, font-weight, line-height for every element
- **Spacing** — exact padding for each block (top, right, bottom, left)
- **Dimensions** — email width, image heights, button sizes
- **Assets** — URLs of already-hosted images, icons, logos. Export or request every raster asset at 2x its display size — Figma exports at 1x by default unless the scale is set explicitly. See `RESPONSIVE_RULES.md` Rule 7.

---

## STEP 4 — Map design blocks

Identify every vertical block in the design and document it before writing any code:

```
BLOCK N: [descriptive name]
  bg: [hex color]
  padding: [top right bottom left]
  content: [what's inside]
  font: [family, size, weight, color]
  notes: [any special details]
```

Identify which elements are fixed and which are variable (With Variables only).

### Figma layer-naming convention (With Variables)

For "With Variables" projects, naming the Figma layers after their data field makes the design → template mapping unambiguous (which layer becomes which `{{PLACEHOLDER}}`):

| Element type | Convention | Example |
|---|---|---|
| Text field fed by data | Exact data-field name | `promo`, `client_name` |
| Image/asset fed by data | Data-field name + `_url` suffix | `image_email_url`, `agent_photo_url` |
| Full section / block | `block_` prefix | `block_hero`, `block_footer` |
| Fixed decorative element | Any name — does not map | `bg-gradient`, `divider-line` |

**Rule:** if an element's content changes between records or languages, name it after its data field; if it never changes, name it freely. The agent's `generate.js` resolves variables by data-source **header name** (via `HEADER_MAP`), not by reading the Figma layer — so this convention is a design-prep aid for a clean, self-documenting mapping, not a hard runtime dependency.

---

## STEP 5 — Write template.mjml

### Standard: use fixed values directly
The MJML uses exact values from the design — no placeholders.

### With Variables: use placeholders
Variable values are replaced with `{{VARIABLE_NAME}}` as defined in the project `CLAUDE.md`. Fixed values are hardcoded the same as Standard.

In both cases, include in `<mj-head>`:
- Google Fonts via `<link rel="stylesheet">` inside an `<mj-raw>` non-MSO conditional — **not** `@import`, and **not** `<mj-font>` (see `OUTLOOK_RULES.md` Rule 2 for why)
- Dark mode override styles (see `DARK_MODE_RULES.md`)
- Responsive media queries (see `RESPONSIVE_RULES.md`)
- Outlook conditional comments and VML namespace

---

## STEP 6 — Compile and post-process

```bash
# Run from INSIDE the project folder so npx resolves the pinned local mjml,
# never a bare npx from outside (that fetches whatever is latest — see Prerequisites).
npx mjml template.mjml -o output/[email-name].html
```

**Then run the post-process — MJML cannot do this part itself:**

```bash
# Adds class="body" to <body> (merging with any existing class, idempotent).
node ../../postprocess-email.js output/[email-name].html
```

`<body class="body">` is what makes the `u + .body` selector fire, which is how the Gmail dark-mode blend from `DARK_MODE_RULES.md` scopes itself to Gmail. MJML has no attribute for a class on `<body>`, so a bare `npx mjml` output never has it. **Skip this only if the email ships no blend at all** — `validate-email.js` check 9(a) requires the class exactly when the compiled HTML carries the `u + .body` rule or the `gmail-blend-screen` divs, and reports the check as skipped otherwise.

With Variables projects don't run this by hand: `generate.js` already post-processes each row (see Step 7).

For With Variables projects, compilation happens through `generate.js` (which `require('mjml')` from the local install) — see Step 7. After compiling, review the generated HTML and manually add:
- **VML** for rounded buttons — MJML does not always generate perfect VML
- **`mso-color-alt`** on critical colors for Outlook Windows dark mode
- Any specific workarounds documented in `OUTLOOK_RULES.md`

---

## STEP 7 — With Variables only: run generate.js

```bash
node generate.js --mock   # testing without live data source
node generate.js          # production
```

The script reads the data source, applies variables to the compiled template, and outputs one HTML per record in `/output/`.

---

## STEP 8 — QA in Litmus

Upload the HTML to Litmus and verify on priority clients:
- Outlook 2019, 2021, 365 (Windows) — most critical
- Gmail (Chrome, iOS, Android)
- Apple Mail (macOS, iOS)
- Outlook.com
- Yahoo Mail

Verify specifically:
- **Fonts** — does the web font load, or does it fall back to Arial? Is it ever serif?
- **Block gaps** — any unexpected gray strips between sections?
- **CTA button** — rounded in Outlook or square?
- **Dark mode** — Gmail iOS/Android, Apple Mail, Outlook Windows
- **Responsive** — correct on mobile? See `RESPONSIVE_RULES.md`
- **Images** — do they load? Correct dimensions?

---

## STEP 9 — Fix and document

Apply fixes from Litmus results. If a new issue is discovered that is not yet documented, add it to `OUTLOOK_RULES.md` or `DARK_MODE_RULES.md` with:
- The exact problem
- The client where it appears
- The fix applied
- Why it works

This keeps the agent's knowledge current with every project.

---

## STEP 10 — Pre-send QA gate

Before the email goes to a real send, run the full **`PRE_SEND_QA.md`** checklist — the single consolidated pre-send gate. It covers structure, styles, fonts, images, CTAs, and points to `OUTLOOK_RULES.md` / `DARK_MODE_RULES.md` / `RESPONSIVE_RULES.md` for the deep client-specific checks, plus the sign-off block.

The mechanical half is automated by **`validate-email.js`** (zero dependencies, plain Node):

```bash
# Standard project — against the compiled HTML:
node validate-email.js output/[email-name].html

# With Variables — enforce the placeholder contract too, over the REAL run:
node validate-email.js output/*.html --mjml template.mjml --tokens qa-tokens.txt

# ...and over the deterministic sample build, if the project has one:
node validate-email.js dist/email.html --mjml template.mjml --tokens qa-tokens.txt
```

**Gate `output/`, not only `dist/`.** `output/` is the real run — the files that get sent. `dist/` is the deterministic sample (`build-email.js`, one fixed anonymized row) that the test suite and CI use; it shares no data with `output/`, so a green `dist/` says nothing about the emails going out. Running the gate with no file argument defaults to `dist/email.html`. On "With Variables" projects `generate.js` runs the gate per row as it writes, so the real run cannot leave ungated.

It exits non-zero on any blocking failure and writes `VALIDATION_REPORT.md`. On "With Variables" projects `generate.js` also auto-verifies a subset at build time (unresolved placeholders, Gmail blend contract, leaf-`<td>` backgrounds). Everything the script lists as `[MANUAL]` — Litmus renders, legal footer, minimum sizes, final copy — stays human.

**The gate runs in Claude Code, pointed at the agent folder.** A green run anywhere else is a pre-check, not the send gate.

---

## Recommended model and effort per step

Pick the model by the nature of the step (resilient wording — model availability shifts): a **strong visual-reasoning model** for reading design and extracting tokens (Fable 5 when available, otherwise Opus), a **mid-tier model at max effort** for code generation (MJML, VML), a **mid-tier model** for automation scripts, and a **fast model** for mechanical tasks (copy variations, minor edits).

| Step | Model | Effort |
|---|---|---|
| 1: Read project brief | Sonnet | Default |
| 2–3: Read Figma, extract tokens | Fable 5 (when included) → Opus | Default |
| 4: Map blocks | Sonnet | Default |
| 5: Write MJML | Sonnet | **Max** (code generation) |
| 6: Post-compilation (VML, `mso-color-alt`) | Sonnet | **Max** (code generation) |
| 7: Run scripts (With Variables) | Haiku | Default (mechanical) |
| 8: Litmus QA | Manual | — |
| 9: Simple Litmus fixes | Haiku | Default (mechanical) |
| 9: Complex Outlook/dark mode bugs | Sonnet | **Max** |

*Model availability shifts — if Fable 5 isn't available, fall back to Opus for the visual-reasoning steps.*

---

*Last updated: 2026-07-25 · v6 · STEP 5 now specifies loading Google Fonts via `<link rel="stylesheet">` in an `<mj-raw>` non-MSO conditional — not `@import`, not `<mj-font>` (see OUTLOOK_RULES Rule 2). STEP 10 (in the same round as the validate-email.js gate docs, PR #82) points the mechanical half at `validate-email.js`. v5 · model/effort guidance reworded to be self-contained (removed workspace-root routing reference) for portability.*
