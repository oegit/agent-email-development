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
 *   node validate-email.js                      (defaults to dist/email.html)
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

// [MANUAL] / not-applicable-to-MJML — printed in the report, never blocking.
const MANUAL_ITEMS = [
  'Litmus cross-client render (Outlook 2019/2021/365 Win, Gmail, Apple Mail, Outlook.com/Mac dark)',
  'Unsubscribe link + physical postal address present in the footer (CAN-SPAM / CASL)',
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

  // 2. No unresolved placeholder tokens.
  const unresolved = [...new Set((html.match(/\{\{[A-Za-z_]+\}\}/g) || []))];
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

  // 9. Gmail dark-mode contract intact (the blend technique from DARK_MODE_RULES.md).
  if (!/<body\s+class="body"/.test(html)) fail('missing <body class="body"> — Gmail "u + .body" blend selector will not fire');
  if (!/gmail-blend-screen/.test(html)) fail('missing gmail-blend-screen divs — Gmail dark blend broken');

  // 10. VML namespaces declared (Outlook rounded buttons / rects).
  if (!/xmlns:v\s*=/.test(html)) fail('missing VML xmlns:v namespace on <html> — Outlook VML will not render');

  // 11. Placeholder contract on the MJML source: exactly the declared tokens.
  if (mjml != null) {
    const used = new Set((mjml.match(/\{\{([A-Z_]+)\}\}/g) || []).map(t => t.replace(/[{}]/g, '')));
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

  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--mjml')            mjmlPath = args[++i];
    else if (a === '--tokens')     tokensSpec = args[++i];
    else if (a === '--report')     reportPath = args[++i];
    else if (a === '--no-report')  writeReport = false;
    else if (a === '--help' || a === '-h') {
      console.log('Usage: node validate-email.js <compiled.html> [more.html ...] [--mjml <file>] [--tokens <list|file>] [--report <file>] [--no-report]');
      process.exit(0);
    }
    else htmlFiles.push(a);
  }

  if (!htmlFiles.length) htmlFiles.push(path.join('dist', 'email.html')); // drop-in default

  const missing = htmlFiles.filter(f => !fs.existsSync(f));
  if (missing.length) {
    console.error(`❌ file(s) not found: ${missing.join(', ')} — build the email first (e.g. "npx mjml template.mjml -o dist/email.html").`);
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

module.exports = { validate, buildReport, MANUAL_ITEMS, stripComments };
