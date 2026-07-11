# Email Development Agent

A portable, self-contained agent that turns Claude Code into an expert HTML email developer. Point Claude Code at this folder and it builds emails that render correctly everywhere — including the clients that break everything (Outlook Windows, dark mode, and friends).

**Full guide with step-by-step Quickstart:**
https://oegit.github.io/oe-docs/email-development-agent-guide.html

## What's inside

| File | What it is |
|---|---|
| `CLAUDE.md` | The agent's identity, tech stack, and core rules — Claude reads it on startup |
| `OUTLOOK_RULES.md` | Everything Outlook breaks and how to fix it — VML buttons, conditional comments, font fallbacks |
| `DARK_MODE_RULES.md` | Per-client strategies to force light mode, with a dated experiment log |
| `RESPONSIVE_RULES.md` | Mobile behavior: breakpoints, fluid images, stacking rules |
| `FIGMA_TO_EMAIL_WORKFLOW.md` | The 10-step process from design file to production HTML |
| `PRE_SEND_QA.md` | The consolidated checklist that gates every real send |
| `validate-email.js` | Automated pre-send QA gate — checks the compiled HTML against the hard rules and writes `VALIDATION_REPORT.md`. Zero dependencies |
| `projects/` | Your email projects live here — the agent scaffolds them from your brief |

## Quick version

1. Download this repo (**Code → Download ZIP**) and unzip it anywhere on your machine.
2. Open the **Claude Desktop App** → **Code** tab → open this folder.
3. Follow the [Quickstart](https://oegit.github.io/oe-docs/email-development-agent-guide.html#quickstart) in the guide — it walks you from starting the agent to the final deliverable.

## Automated QA

Before any real send, run the automated gate against your compiled HTML (from the folder root or your project folder):

```bash
node validate-email.js dist/email.html
```

It checks the mechanically-verifiable rules (Gmail 102KB clip, image attributes, font stacks, dark-mode contract, VML namespaces, WCAG link names, and more), writes `VALIDATION_REPORT.md`, and exits non-zero on any blocking failure. The remaining manual checks live in `PRE_SEND_QA.md`. Run `node validate-email.js --help` for options (multiple files, MJML token contract).

## What you need

Claude Desktop App (Claude Code), Node.js, MJML (installed per project), Figma Desktop with its Dev Mode MCP Server (only if building from a Figma design), and a Litmus account for QA.

## Portability

The agent is client-agnostic by design: brand colors, fonts, and voice enter through each project's own brief (`CLAUDE.md`) — never through the agent itself. Client projects are not distributed with this repo; the agent builds yours from your brief.
