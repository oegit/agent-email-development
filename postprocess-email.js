#!/usr/bin/env node
/**
 * postprocess-email.js — the post-compile step MJML cannot do itself (portable)
 *
 * MJML owns everything inside `<mj-body>`, but it cannot put a class on `<body>`
 * — there is no MJML attribute for it. The Gmail dark-mode blend technique in
 * `DARK_MODE_RULES.md` needs one: Gmail rewrites the body into `<div class="…">`
 * and prepends a `<u>`, so the `u + .body` selector is what scopes the blend to
 * Gmail and nothing else. Without `class="body"` on `<body>`, that selector can
 * never fire and the blend silently does nothing.
 *
 * "With Variables" projects already do this inside their own generate.js. A
 * **Standard** project compiles with a bare `npx mjml template.mjml -o …` and had
 * no documented way to add the class at all — while `validate-email.js` check 9(a)
 * demanded it unconditionally, so the most common project type could not pass the
 * agent's own gate (audit 2026-07-26, R26). This script is that missing step.
 *
 * Idempotent: running it twice is the same as running it once. It MERGES into an
 * existing `class` attribute rather than adding a second one — two `class`
 * attributes on the same tag are not additive, the first wins and the rest are
 * discarded, which is how `<mj-body css-class="…">`'s class was being lost.
 *
 * Zero dependencies — plain Node.js (fs only).
 *
 * Usage:
 *   node postprocess-email.js output/email.html [more.html ...]   (rewrites in place)
 *   node postprocess-email.js --check output/email.html           (exit 1 if it would change)
 *
 * require('./postprocess-email') → { injectBodyClass, hasBodyClass, CLASS_ATTR_RE, BODY_CLASS }
 */

const fs = require('fs');

const BODY_CLASS = 'body';

/**
 * What a REAL `class` attribute looks like in a tag's attribute list.
 *
 * ONE definition, exported and shared with `validate-email.js` check 9(a), so the
 * script that WRITES the class and the gate that VERIFIES it cannot disagree about
 * what a class attribute is. They did not disagree — they AGREED, on the wrong thing
 * (audit 2026-07-27 R3, K1). Both read `\bclass\s*=`, and `\b` matches between `-`
 * and `c`, so `data-class="theme-a"` was taken for the real `class`: this script
 * merged into the decoy and printed `✅ added class="body"` while `<body>` ended with
 * NO class at all and an unrelated attribute had been silently rewritten; the gate
 * then confirmed the class was present, against the same decoy. Both machines were
 * the defect and both reported success, so the Gmail `u + .body` blend never fired
 * and nothing anywhere said so. The same shape as the TOKEN_RE split in the gate
 * (J9): two copies of a pattern is how two checks come to disagree, and one copy
 * read by both is the fix.
 *
 * Group 1 is the separator before the name — start-of-string or whitespace — and is
 * preserved on replace; dropping it welds the attribute to its neighbour.
 */
const CLASS_ATTR_RE = /(^|\s)class\s*=\s*(["'])([\s\S]*?)\2/i;

/**
 * Add `class="body"` to the `<body>` tag, merging with any class already there.
 * @param {string} html compiled email HTML
 * @returns {string} the HTML with the class present exactly once
 */
function injectBodyClass(html) {
  return html.replace(/<body\b([^>]*)>/i, (tag, attrs) => {
    const existing = attrs.match(CLASS_ATTR_RE);
    if (!existing) return `<body class="${BODY_CLASS}"${attrs}>`;
    const names = existing[3].split(/\s+/).filter(Boolean);
    if (names.includes(BODY_CLASS)) return `<body${attrs}>`;      // already done
    const merged = [BODY_CLASS, ...names].join(' ');
    return `<body${attrs.replace(existing[0], `${existing[1]}class="${merged}"`)}>`;
  });
}

/**
 * Does this HTML's `<body>` really carry `class="… body …"`?
 *
 * The verification half of the same definition — exactly what `validate-email.js`
 * check 9(a) asks, and what this script now asserts about its own output before it
 * prints a success line. Token-exact on purpose: `class="body-alt"` is one token and
 * it is not `body`.
 *
 * @param {string} html compiled email HTML
 * @returns {boolean}
 */
function hasBodyClass(html) {
  const tag = html.match(/<body\b([^>]*)>/i);
  if (!tag) return false;
  const attr = tag[1].match(CLASS_ATTR_RE);
  return !!attr && attr[3].split(/\s+/).filter(Boolean).includes(BODY_CLASS);
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const checkOnly = args.includes('--check');
  const files = args.filter((a) => a !== '--check');

  if (!files.length) {
    console.error('Usage: node postprocess-email.js [--check] <compiled.html> [more.html ...]');
    process.exit(1);
  }

  const missing = files.filter((f) => !fs.existsSync(f));
  if (missing.length) {
    console.error(`❌ file(s) not found: ${missing.join(', ')} — compile the email first.`);
    process.exit(1);
  }

  let changed = 0;
  let failed = 0;
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = injectBodyClass(before);

    // A no-op has two very different causes, and only one of them is success.
    if (before === after) {
      if (hasBodyClass(before)) { console.log(`   already post-processed: ${file}`); continue; }
      console.error(`❌ ${file}: no <body> tag to add class="${BODY_CLASS}" to — is this the compiled email?`);
      failed++;
      continue;
    }

    // Never report a success this script did not achieve (K1). Assert the OUTPUT
    // carries a real class attribute containing the name, rather than trusting that
    // a rewrite happened: the whole defect was a rewrite that happened, changed the
    // file, and left `<body>` with no class at all.
    if (!hasBodyClass(after)) {
      console.error(`❌ ${file}: rewrote the <body> tag but it still carries no real class="${BODY_CLASS}" — `
                  + 'refusing to report success');
      failed++;
      continue;
    }

    changed++;
    if (!checkOnly) fs.writeFileSync(file, after, 'utf8');
    console.log(`${checkOnly ? '⚠️  would add' : '✅ added'} class="${BODY_CLASS}" to <body>: ${file}`);
  }

  // Say how much was examined — a run that touched nothing must not read as success.
  console.log(`postprocess-email: ${files.length} file(s) examined, ${changed} needed the class`
            + (failed ? `, ${failed} FAILED` : '') + '.');
  if (failed) process.exit(1);
  if (checkOnly && changed) process.exit(1);
}

module.exports = { injectBodyClass, hasBodyClass, CLASS_ATTR_RE, BODY_CLASS };
