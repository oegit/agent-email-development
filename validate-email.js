#!/usr/bin/env node
/**
 * validate-email.js — automated pre-send QA gate (portable)
 *
 * Automates the mechanically-checkable items in PRE_SEND_QA.md and encodes
 * the hard rules from OUTLOOK_RULES.md, DARK_MODE_RULES.md and
 * RESPONSIVE_RULES.md against compiled email HTML. [MANUAL] items — Litmus
 * renders, legal footer, minimum sizes — are listed in the report as
 * non-blocking reminders.
 *
 * The blocking checks assume the email was built following this agent's rule
 * files (MJML compilation, VML buttons, the Gmail dark-mode blend technique).
 * Rules that MJML itself owns (box-model shorthand, unitless line-height) are
 * intentionally NOT enforced here — MJML emits its own box model; enforcing
 * them would fail every valid build. They stay in the [MANUAL]/N-A list.
 *
 * Zero dependencies — plain Node.js (fs/path only).
 * Exit code: 0 if no blocking failure, 1 otherwise. Emits VALIDATION_REPORT.md.
 *
 * Usage:
 *   node validate-email.js <compiled.html> [more.html ...]
 *   node validate-email.js dist/*.html
 *   node validate-email.js dist/email.html --mjml template.mjml --tokens CLIENT_NAME,CTA_URL
 *   node validate-email.js output/*.html --mjml template.mjml --tokens qa-tokens.txt
 *   node validate-email.js                      (defaults to dist/email.html)
 *
 * Two output directories, on purpose — gate both (audit 2026-07-26, R36):
 *   dist/    the deterministic sample build. One fixed, anonymized row, so two
 *            builds are byte-identical. This is what CI and the test suite gate,
 *            and it is this script's drop-in default.
 *   output/  the real run — one HTML per data row, or the single compiled email
 *            of a Standard project. These are the files that get SENT, and they
 *            share no data with dist/, so a green dist/ says nothing about them.
 *
 * Options:
 *   --mjml <file>     MJML source. With --tokens, enforces the placeholder
 *                     contract (template must use exactly those tokens).
 *                     Without --tokens, the tokens found are listed as info.
 *   --tokens <x>      Comma-separated token list, or a path to a text file
 *                     containing the tokens (comma/whitespace/line separated).
 *   --report <file>   Report path (default: ./VALIDATION_REPORT.md).
 *   --no-report       Skip writing the report file.
 *
 * require('./validate-email') → { validate, buildReport, MANUAL_ITEMS }
 */

const fs   = require('fs');
const path = require('path');
// Check 9(a) asks whether `<body>` carries the class that `postprocess-email.js`
// puts there. That is ONE question, so it gets ONE implementation, owned by the
// script that writes it — the same move TOKEN_RE made for checks 2 and 11 (J9).
// Before this, each file carried its own `\bclass\s*=` and both were wrong in the
// same way: `\b` matches between `-` and `c`, so `data-class="…"` satisfied both,
// the post-processor merged into the decoy and the gate blessed the result
// (audit 2026-07-27 R3, K1). Both scripts travel together — see CLAUDE.md's
// distribution table — so this require resolves anywhere the gate does.
const { hasBodyClass } = require('./postprocess-email');

// [MANUAL] / not-applicable-to-MJML — printed in the report, never blocking.
const MANUAL_ITEMS = [
  'Litmus cross-client render (Outlook 2019/2021/365 Win, Gmail, Apple Mail, Outlook.com/Mac dark)',
  // Reworded 2026-07-26 (audit R23). It used to read "present in the footer", which
  // is not where this is decidable: many ESPs inject both at send time, so a
  // template without them is not automatically a violation and a template with them
  // is not automatically compliant. Stated as "present in the footer" it was a
  // requirement no template in this repo met and nobody could act on.
  'Unsubscribe link + physical postal address REACH THE RECIPIENT (CAN-SPAM / CASL) — verify on a real '
    + 'test send, not on the compiled template. If the ESP injects them, record that in the project brief; '
    + 'if it does not, they belong in the template. One of the two must be true and written down.',
  'Minimum font sizes: body 14px+, headline 22px+, CTA 16px+ (or per your project brief)',
  'Raster assets exported at 2x with 1x width/height',
  'Copy final, proofread, correct language/locale for the target audience',
  'Renders with no horizontal scroll at 320px',
  'Box-model shorthand & unitless line-height: N/A — MJML owns the compiled box model.',
];

// Remove HTML and CSS comments so pattern checks are not fooled by explanatory
// prose (e.g. a comment describing the removed [data-ogsb] layer).
function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * What a placeholder token looks like. ONE definition, used by check 2 (unresolved
 * tokens in the compiled output) and check 11 (the MJML placeholder contract), so the
 * two cannot disagree about what a token is.
 *
 * They did disagree, in the direction that ships (audit 2026-07-26 R2, J9). Check 2
 * was `[A-Za-z_]+` — NO DIGITS — while PRE_SEND_QA.md promises, as an [AUTO] row, that
 * it "blocks on any surviving {{…}}". `{{CLIENT_NAME}}` matched; `{{BLOCK_2_BG}}` and
 * `{{IMAGE_2_URL}}` did not, so a numbered token shipped to recipients with a green
 * gate and the checklist row ticked. Check 11 was narrower still (`[A-Z_]+`): it missed
 * digits AND lowercase, so a lowercase token was outside the --tokens contract in both
 * directions — never reported unknown, never reported missing — while
 * FIGMA_TO_EMAIL_WORKFLOW.md teaches lowercase-with-digits field names.
 *
 * Global on purpose: both call sites use matchAll, which clones the regex internally,
 * so there is no shared-lastIndex hazard.
 */
const TOKEN_RE = /\{\{([A-Za-z0-9_]+)\}\}/g;

/**
 * A CSS color value → [r,g,b], or null if this function does not understand it.
 *
 * Exists because check 9(b) used to recognise exactly three hex spellings of white
 * (`#fffffe`, `#ffffff`, `#fff`). Any other notation — `rgb(255,255,255)`,
 * `#FEFEFE`, the keyword `white` — evaluated false and the check was skipped
 * without recording anything, not even in `info` (audit 2026-07-26, R16). A
 * white-on-color email could ship with no Gmail dark protection and a green gate.
 *
 * Exported so `generate.js` can decide "is this theme's text white?" with the SAME
 * definition the gate uses, instead of comparing strings (`=== '#FFFFFF'`).
 */
function parseCssColor(value) {
  const s = String(value || '').trim().toLowerCase();
  if (s === 'white') return [255, 255, 255];
  let m = s.match(/^#([0-9a-f]{3})$/);
  if (m) return [...m[1]].map(c => parseInt(c + c, 16));
  m = s.match(/^#([0-9a-f]{6})$/);
  if (m) return [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
  m = s.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/);
  if (m) return [1, 2, 3].map(i => parseInt(m[i], 10));
  return null;
}

// "White enough that Gmail's dark-mode inversion can make it disappear." The
// off-by-one #FFFFFE trick used to evade the pure-white heuristic is exactly why
// this is a threshold and not an equality test.
const NEAR_WHITE_MIN = 250;
function isNearWhite(value) {
  const rgb = parseCssColor(value);
  return !!rgb && rgb.every(c => c >= NEAR_WHITE_MIN);
}

/**
 * @param {string} html            compiled email HTML
 * @param {string|null} mjml       MJML source (optional)
 * @param {string[]|null} contract placeholder token contract (optional)
 * @returns {{ failures: string[], info: string[], manual: string[] }}
 */
function validate(html, mjml = null, contract = null) {
  const failures = [];
  const info = [];
  const fail = (msg) => failures.push(msg);
  const clean = stripComments(html);

  // 1. Gmail 102KB clip.
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes >= 102 * 1024) fail(`size ${bytes} bytes ≥ 102KB — Gmail will clip the email`);

  // 2. No unresolved placeholder tokens. Shared TOKEN_RE — see its comment for why.
  const unresolved = [...new Set([...html.matchAll(TOKEN_RE)].map(m => m[0]))];
  if (unresolved.length) fail(`unresolved tokens in output: ${unresolved.join(', ')}`);

  // 3. No Google Drive share/preview URLs (must be CDN or uc?export= form).
  const driveLinks = [...new Set((clean.match(/drive\.google\.com\/(?:file\/|open\?)[^"'\s)]*/g) || []))];
  if (driveLinks.length) fail(`Google Drive share/preview URLs (won't render in <img>): ${driveLinks.join(', ')}`);

  // 4. Every <img> has alt (present; empty allowed for decorative), width, height.
  const imgs = clean.match(/<img\b[^>]*>/g) || [];
  imgs.forEach((img, i) => {
    const missing = ['alt', 'width', 'height'].filter(a => !new RegExp(`\\b${a}\\s*=`).test(img));
    if (missing.length) fail(`<img> #${i + 1} missing attribute(s): ${missing.join(', ')} — ${img.slice(0, 80)}…`);
  });

  // 5. Font stacks: Arial before Helvetica, never the reverse.
  if (/Helvetica\s*,\s*Arial/i.test(clean)) fail('font stack lists Helvetica before Arial (falls back to Times in some Outlooks)');

  // 6. No CSS custom properties (var()) — unsupported across email clients.
  if (/var\(\s*--/.test(clean)) fail('CSS custom property var(--…) present — unsupported in email');

  // 7. No author CSS rules targeting [data-ogsb]/[data-ogsc] (proven Outlook.com regression).
  if (/\[data-ogs[bc]\]/.test(clean)) fail('author rule targeting [data-ogsb]/[data-ogsc] present — proven Outlook.com Dark regression');

  // 8. font-weight always numeric.
  const badWeights = [...new Set((clean.match(/font-weight\s*:\s*(bold|bolder|lighter|normal)/gi) || []))];
  if (badWeights.length) fail(`non-numeric font-weight: ${badWeights.join(', ')} — use 400/500/600/700`);

  // 9. Gmail dark-mode contract (the blend technique from DARK_MODE_RULES.md).
  //   (a) <body class="body"> is what makes the "u + .body" selector fire, so it
  //       is required by any email that ships the blend — and by no other. It
  //       used to be required UNCONDITIONALLY, which made this gate unpassable
  //       for the project type CLAUDE.md calls "the most common case": MJML has
  //       no way to put a class on <body>, and a Standard project compiles with a
  //       bare `npx mjml … -o …` (audit 2026-07-26, R26). The condition is the
  //       email's own markup — if it carries the `u + .body` rule or the blend
  //       divs, it depends on the class and must have it; if it carries neither,
  //       it is not using the technique and the check is reported as skipped,
  //       never silently dropped.
  //   (b) gmail-blend-screen divs are only NEEDED where white text sits on a
  //       colored background (Gmail dark-mode inversion can turn white-on-color
  //       into white-on-light = invisible). An email with no white text needs
  //       no blend divs and must NOT be failed for their absence. So gate (b)
  //       on the presence of white text (#FFFFFF / #FFF / #FFFFFE) in a real
  //       `color:` property (not `background-color:`); if there is none, skip.
  //       Both halves read `clean`, not `html`. The second used to read the raw HTML,
  //       so a CSS comment mentioning the technique — e.g. one describing the removed
  //       [data-ogsb] layer, the exact scenario this module's own stripComments note
  //       gives as its reason — turned this check ON and failed a correct build for a
  //       <body class="body"> it does not need (audit 2026-07-26 R2, J12).
  const usesBlend = /u\s*\+\s*\.body/.test(clean) || /gmail-blend-screen/.test(clean);
  //       `hasBodyClass` reads `clean` for the same reason, found while fixing J12 and
  //       recorded separately in FIXES_20260726_R2.md because the J12 row names only the
  //       two lines above. It is the MIRROR of J12 and the worse direction: on raw html a
  //       <body class="body"> quoted inside a comment satisfied this test, so an email
  //       that really ships blend divs and really lacks the class passed with 0 failures.
  //       J12 fails a correct build loudly; this passed a broken one silently.
  //       It now reads `hasBodyClass` from postprocess-email.js — the script that WRITES
  //       the class — instead of re-deriving the pattern here. The local copy read
  //       `\bclass\s*=`, which matches inside `data-class=`, so the gate confirmed a class
  //       that was never added while the post-processor reported adding it (K1, 20260727 R3).
  const bodyClassPresent = hasBodyClass(clean);
  if (usesBlend && !bodyClassPresent) {
    fail('missing <body class="body"> — Gmail "u + .body" blend selector will not fire. '
       + 'MJML cannot emit it; run the agent\'s postprocess-email.js on the compiled HTML');
  } else if (!usesBlend) {
    info.push('Gmail blend check 9(a) skipped: this email ships no "u + .body" rule and no '
            + 'gmail-blend-screen divs, so it does not use the blend technique and does not need '
            + '<body class="body">');
  }
  // Any `color:` (not `background-color:`, not `mso-color-alt:` — both are excluded
  // by the leading [^-a-z]) whose value resolves to near-white, in ANY notation.
  const colorValues = [...clean.matchAll(/(?:^|[^-a-z])color\s*:\s*([^;"'}<]+)/gi)].map(m => m[1]);
  const whiteText = [...new Set(colorValues.filter(isNearWhite).map(v => v.trim()))];
  const blendDivsPresent = /<div[^>]*class="[^"]*\bgmail-blend-screen\b/.test(clean);
  // The template DECLARING the technique (a `.gmail-blend-screen` CSS rule) while
  // the markup carries no such div is the inverted form of the same defect: the
  // divs are built conditionally, so a condition that silently stopped matching
  // leaves the rule with nothing to style.
  const blendRuleDeclared = /\.gmail-blend-screen\b/.test(clean);

  if (whiteText.length && !blendDivsPresent) {
    fail(`white text present (${whiteText.join(', ')}) but no gmail-blend-screen divs — `
       + 'Gmail dark blend broken (white-on-color can invert to invisible)');
  } else if (blendRuleDeclared && !blendDivsPresent) {
    fail('the gmail-blend-screen CSS rule is declared but no element uses it — the blend divs are '
       + 'emitted conditionally, so the condition stopped matching and the rule styles nothing');
  } else if (!whiteText.length) {
    // Never skip in silence: this is the branch that hid R16.
    info.push('Gmail blend check 9(b) skipped: no `color:` value in the output resolves to '
            + `near-white (>= ${NEAR_WHITE_MIN} on every channel), so no blend divs are required`);
  }

  // 10. VML namespace declared ON THE <html> TAG (Outlook rounded buttons / rects).
  // OUTLOOK_RULES.md Rule 12: "For any VML to work (buttons, workarounds), the <html>
  // tag must declare the namespaces."
  //
  // This check had two defects, opposite in direction, both closed here (L1, 20260727 R3):
  //   (a) it tested the RAW `html` for the bare string `xmlns:v=` and never looked at the
  //       <html> tag at all — so ANY occurrence satisfied it, including the `xmlns:v=` that
  //       OUTLOOK_RULES.md's own Rule 5 button snippet puts on the <v:roundrect> INSIDE an
  //       `<!--[if mso]>` conditional. An email built exactly to the agent's documented
  //       snippet, with a bare <html>, passed the one check that exists for it. Same class
  //       as J12 and as the check 9(a) mirror above: reading raw html where a comment can
  //       answer the question.
  //   (b) it was UNCONDITIONAL, so an email shipping no VML at all — the common Standard
  //       project — was failed for a namespace it has no use for. That is exactly the shape
  //       R26 had to undo on check 9(a), and it is why this now reports itself skipped.
  //
  // Finding the VML takes BOTH strings, and neither alone is right. Every VML element
  // this agent documents lives inside an `<!--[if mso]>` conditional, which stripComments
  // removes — so `clean` alone sees none of it. But the raw `html` cannot tell a real
  // conditional from an ordinary comment that merely TALKS about VML, and reading it
  // whole is what let a comment answer for the document in the first place. So: VML
  // outside comments, plus VML inside the conditionals Outlook actually parses.
  //
  // The declaration is read from `clean`, so a commented-out example of the <html> tag
  // cannot answer for the real one — and the leading `\s` anchors the attribute name, so
  // a hyphenated one cannot either (K1's defect, deliberately not repeated here).
  const msoBlocks = (html.match(/<!--\[if[^\]]*\]>[\s\S]*?<!\[endif\]-->/gi) || []).join('');
  const usesVml = /<v:[a-z]/i.test(clean) || /<v:[a-z]/i.test(msoBlocks);
  const vmlNsOnHtml = /<html\b[^>]*\sxmlns:v\s*=/i.test(clean);
  if (usesVml && !vmlNsOnHtml) {
    fail('VML element present but no xmlns:v namespace on the <html> tag — Outlook VML will not render '
       + '(OUTLOOK_RULES.md Rule 12; a declaration inside an <!--[if mso]> conditional is not the <html> tag)');
  } else if (!usesVml) {
    info.push('VML namespace check 10 skipped: this email ships no <v:…> element, so it needs no '
            + 'xmlns:v declaration on <html>');
  }

  // 11. Placeholder contract on the MJML source: exactly the declared tokens.
  if (mjml != null) {
    const used = new Set([...mjml.matchAll(TOKEN_RE)].map(m => m[1]));
    if (contract && contract.length) {
      const unknown = [...used].filter(t => !contract.includes(t));
      const missing = contract.filter(t => !used.has(t));
      if (unknown.length) fail(`MJML template uses tokens outside the contract: ${unknown.join(', ')}`);
      if (missing.length) fail(`MJML template is missing contract tokens: ${missing.join(', ')}`);
    } else if (used.size) {
      info.push(`tokens found in MJML template (no --tokens contract given): ${[...used].join(', ')}`);
    }
  }

  // 12. link-name (WCAG 2A): every <a> has a discernible name — non-empty text,
  // an aria-label, or an inner <img> with non-empty alt. Icon-only links whose
  // <img> has alt="" are the classic offender (Litmus-flagged).
  const anchors = clean.match(/<a\b[^>]*>[\s\S]*?<\/a>/gi) || [];
  anchors.forEach((a) => {
    const hasAria = /aria-label\s*=\s*["'][^"']+["']/i.test(a);
    const text    = a.replace(/<[^>]+>/g, '').replace(/&[a-z]+;|&#\d+;/gi, ' ').trim();
    const imgAlt  = /<img\b[^>]*\balt\s*=\s*["'][^"']+["']/i.test(a);
    if (!hasAria && !text && !imgAlt) {
      fail(`link without a discernible name (WCAG link-name): ${a.replace(/\s+/g, ' ').slice(0, 90)}…`);
    }
  });

  // 13. No CSS @import — several ESP CSS parsers reject it and Gmail strips it
  // anyway. Load web fonts via <link> instead.
  if (/@import\b/.test(clean)) fail('CSS @import present — ESPs reject it (load web fonts via <link>)');

  // 14. No empty href/src, and no recipient-less mailto:. A template token that
  // resolves to the EMPTY STRING leaves no trace for check 2 to find — the token
  // was resolved, just with nothing — so `<a href="">`, `<img src="">` and
  // `mailto:?subject=…` reached real sends with every check green (audit
  // 2026-07-26, R07). An empty href is also a WCAG failure, and an empty src makes
  // some clients re-request the page itself.
  const emptyAttrs = [...new Set(
    (clean.match(/<(?:a|img|source|link)\b[^>]*\b(?:href|src)\s*=\s*(["'])\s*\1/gi) || [])
      .map(t => t.replace(/\s+/g, ' ').slice(0, 70))
  )];
  if (emptyAttrs.length) {
    fail(`empty href/src attribute(s) — a token resolved to '' and nothing else catches it: ${emptyAttrs.join(' | ')}`);
  }
  const emptyMailto = [...new Set((clean.match(/mailto:(?=[?"'\s>])/gi) || []))];
  if (emptyMailto.length) fail('mailto: with no recipient (mailto:?…) — the agent e-mail resolved to an empty value');

  return { failures, info, manual: MANUAL_ITEMS };
}

function buildReport(results) {
  const lines = ['# VALIDATION_REPORT.md', '', `_Generated ${new Date().toISOString().slice(0, 10)} by validate-email.js_`, ''];
  const totalFailures = results.reduce((n, r) => n + r.result.failures.length, 0);
  lines.push(totalFailures ? `## ❌ ${totalFailures} blocking failure(s)` : '## ✅ All blocking checks passed', '');
  for (const { file, bytes, result } of results) {
    lines.push(`### ${file} — ${result.failures.length ? '❌ FAIL' : '✅ PASS'}`);
    lines.push(`- Compiled size: ${bytes} bytes (${(bytes / 1024).toFixed(1)} KB) — limit 102 KB`);
    result.failures.forEach(f => lines.push(`- ❌ ${f}`));
    result.info.forEach(i => lines.push(`- ℹ️ ${i}`));
    lines.push('');
  }
  lines.push('## Manual checks (non-blocking — verify before a real send)', '');
  MANUAL_ITEMS.forEach(m => lines.push(`- [ ] ${m}`));
  lines.push('');
  return lines.join('\n');
}

function parseTokens(spec) {
  const text = fs.existsSync(spec) ? fs.readFileSync(spec, 'utf8') : spec;
  return [...new Set(text.split(/[\s,]+/).map(t => t.trim()).filter(Boolean))];
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const htmlFiles = [];
  let mjmlPath = null, tokensSpec = null, reportPath = 'VALIDATION_REPORT.md', writeReport = true;

  // A flag that takes a value must actually get one. `--mjml` as the LAST argument
  // used to leave `args[++i] === undefined`, so `mjmlPath` was falsy, `mjml` was
  // null, and the whole placeholder-contract block was skipped — silently, on a
  // command line that looked like it was enforcing the contract (audit 2026-07-26,
  // R15). A gate that quietly checks less than you asked is worse than one that
  // refuses to run.
  const usageError = (msg) => {
    console.error(`❌ ${msg}`);
    console.error('   Usage: node validate-email.js <compiled.html> [more.html ...] [--mjml <file>] [--tokens <list|file>] [--report <file>] [--no-report]');
    process.exit(1);
  };
  const valueFor = (flag, i) => {
    const v = args[i + 1];
    if (v === undefined || v.startsWith('--')) usageError(`${flag} needs a value.`);
    return v;
  };

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--mjml')            mjmlPath = valueFor(a, i), i++;
    else if (a === '--tokens')     tokensSpec = valueFor(a, i), i++;
    else if (a === '--report')     reportPath = valueFor(a, i), i++;
    else if (a === '--no-report')  writeReport = false;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node validate-email.js <compiled.html> [more.html ...] [--mjml <file>] [--tokens <list|file>] [--report <file>] [--no-report]');
      process.exit(0);
    }
    else if (a.startsWith('--')) usageError(`unknown option ${a}.`);
    else htmlFiles.push(a);
  }

  // `--tokens` without `--mjml` computed the contract and never used it: check 11
  // is entirely inside `if (mjml != null)`. The run reported "all blocking checks
  // passed" having verified no tokens at all (R15).
  if (tokensSpec && !mjmlPath) {
    usageError('--tokens needs --mjml: the placeholder contract is checked against the MJML source, '
             + 'so without it the token list is read and never used.');
  }

  // Drop-in default: the deterministic sample build. It is NOT the only thing
  // worth gating — see the two-directory note in the header — so when it is
  // missing, say so and name the other convention rather than only this one.
  const usingDefault = !htmlFiles.length;
  if (usingDefault) htmlFiles.push(path.join('dist', 'email.html'));

  const missing = htmlFiles.filter(f => !fs.existsSync(f));
  if (missing.length) {
    console.error(`❌ file(s) not found: ${missing.join(', ')} — build the email first.`);
    if (usingDefault) {
      console.error('   No file was given, so the default dist/email.html was used. If this project');
      console.error('   writes its compiled emails to output/ instead, point the gate there:');
      console.error('     node validate-email.js output/*.html --mjml template.mjml --tokens qa-tokens.txt');
      console.error('   dist/ is the deterministic sample build; output/ is the real run. Gate both.');
    }
    process.exit(1);
  }

  const mjml = mjmlPath ? fs.readFileSync(mjmlPath, 'utf8') : null;
  const contract = tokensSpec ? parseTokens(tokensSpec) : null;

  const results = htmlFiles.map(file => {
    const html = fs.readFileSync(file, 'utf8');
    return { file, bytes: Buffer.byteLength(html, 'utf8'), result: validate(html, mjml, contract) };
  });

  if (writeReport) fs.writeFileSync(reportPath, buildReport(results), 'utf8');

  const totalFailures = results.reduce((n, r) => n + r.result.failures.length, 0);
  if (totalFailures) {
    console.error(`❌ validate-email: ${totalFailures} blocking failure(s):`);
    results.forEach(({ file, result }) => result.failures.forEach(f => console.error(`   - [${file}] ${f}`)));
    if (writeReport) console.error(`   See ${reportPath}`);
    process.exit(1);
  }
  console.log(`✅ validate-email: all blocking checks passed on ${results.length} file(s).${writeReport ? ` See ${reportPath}` : ''}`);
}

module.exports = { validate, buildReport, MANUAL_ITEMS, stripComments, parseCssColor, isNearWhite, NEAR_WHITE_MIN, TOKEN_RE };
