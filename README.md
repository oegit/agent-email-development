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
| `projects/` | Your email projects live here — the agent scaffolds them from your brief |

## Quick version

1. Download this repo (**Code → Download ZIP**) and unzip it anywhere on your machine.
2. Open the **Claude Desktop App** → **Code** tab → open this folder.
3. Follow the [Quickstart](https://oegit.github.io/oe-docs/email-development-agent-guide.html#quickstart) in the guide — it walks you from starting the agent to the final deliverable.

## What you need

Claude Desktop App (Claude Code), Node.js, MJML (installed per project), Figma Desktop with its Dev Mode MCP Server (only if building from a Figma design), and a Litmus account for QA.

## Portability

The agent is client-agnostic by design: brand colors, fonts, and voice enter through each project's own brief (`CLAUDE.md`) — never through the agent itself. Client projects are not distributed with this repo; the agent builds yours from your brief.
