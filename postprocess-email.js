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
 * require('./postprocess-email') → { injectBodyClass, BODY_CLASS }
 */

const fs = require('fs');

const BODY_CLASS = 'body';

/**
 * Add `class="body"` to the `<body>` tag, merging with any class already there.
 * @param {string} html compiled email HTML
 * @returns {string} the HTML with the class present exactly once
 */
function injectBodyClass(html) {
  return html.replace(/<body\b([^>]*)>/i, (tag, attrs) => {
    const existing = attrs.match(/\bclass\s*=\s*(["'])([\s\S]*?)\1/i);
    if (!existing) return `<body class="${BODY_CLASS}"${attrs}>`;
    const names = existing[2].split(/\s+/).filter(Boolean);
    if (names.includes(BODY_CLASS)) return `<body${attrs}>`;      // already done
    const merged = [BODY_CLASS, ...names].join(' ');
    return `<body${attrs.replace(existing[0], `class="${merged}"`)}>`;
  });
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
  for (const file of files) {
    const before = fs.readFileSync(file, 'utf8');
    const after = injectBodyClass(before);
    if (before === after) { console.log(`   already post-processed: ${file}`); continue; }
    changed++;
    if (!checkOnly) fs.writeFileSync(file, after, 'utf8');
    console.log(`${checkOnly ? '⚠️  would add' : '✅ added'} class="${BODY_CLASS}" to <body>: ${file}`);
  }

  // Say how much was examined — a run that touched nothing must not read as success.
  console.log(`postprocess-email: ${files.length} file(s) examined, ${changed} needed the class.`);
  if (checkOnly && changed) process.exit(1);
}

module.exports = { injectBodyClass, BODY_CLASS };
