# vent-widget

A drop-in **MCP server** that lets AI coding agents (Claude Code, claude.ai chat, Cursor, any MCP-compatible host) submit free-text frustrations as markdown files into the active repo's `.vents/` directory.

```
agent gets stuck → calls vent("the X tool keeps doing Y") → .vents/2026-05-21T14-32-15.123-a1b2.md written → agent continues, you triage later
```

Inspired by [Lovable's "vent tool"](https://lovable.dev/blog/we-gave-our-agent-a-vent-tool) — same idea (give agents a way to dump friction), different sink (per-repo markdown files instead of Slack).

---

## Table of contents

- [Why this exists](#why-this-exists)
- [The contract — what a vent looks like](#the-contract--what-a-vent-looks-like)
- [Install — Claude Code](#install--claude-code)
- [Install — claude.ai chat](#install--claudeai-chat)
- [Install — Cursor / other MCP hosts](#install--cursor--other-mcp-hosts)
- [Verifying it works](#verifying-it-works)
- [Configuration](#configuration)
- [Customizing what the agent vents about](#customizing-what-the-agent-vents-about)
- [Embedding vent-widget in your own product](#embedding-vent-widget-in-your-own-product)
- [Consuming vents (triage patterns)](#consuming-vents-triage-patterns)
- [FAQ](#faq)
- [Development](#development)
- [Acknowledgments](#acknowledgments)

---

## Why this exists

Coding agents constantly hit friction they can't resolve and have no channel to report:

- A tool that returns confusing errors and wastes 10 minutes on the same fix
- A library that doesn't behave like its docs claim
- A months-old bug nobody caught because the agent silently worked around it

Without a release valve, that signal evaporates with the session. Lovable showed that giving the agent one tool to dump frustration — into a sink humans (or another agent) can sweep — surfaces real bugs at a remarkable rate. ~20% of vents turn into mergeable PRs; ~10 merged fixes a day; no human writing the code.

vent-widget is a minimal implementation of that loop: **one MCP tool, one markdown sink per repo, no opinions about what you do with the output**.

---

## The contract — what a vent looks like

This is the contract you can rely on. If you're embedding, your downstream consumers parse this format.

**Filename:** `<ISO timestamp with ms>-<short uuid>.md`, e.g. `2026-05-21T14-32-15.123-a1b2.md`. Files sort chronologically by name; no mtime/clone ordering issues.

**Body:** YAML front-matter + free-text markdown.

```markdown
---
id: a1b2c3d4-5e6f-7890-abcd-ef1234567890
vented_at: 2026-05-21T14:32:15.123Z
project: my-repo
cwd: /Users/me/code/my-repo
branch: feature/x
head_sha: 3f8a92c
agent: claude-code
status: open
tags: []
---
code--copy consistently fails for files with spaces in the name (e.g.
`Screenshot 2026-03-23.png`). Tried raw spaces and URL-encoded %20.
Only spaceless filenames copy successfully.
```

| Field | Source | Notes |
|---|---|---|
| `id` | server-generated UUIDv4 | Stable identity per vent |
| `vented_at` | server-generated ISO 8601 UTC | Includes milliseconds |
| `project` | `basename(git toplevel)`, fallback `basename(cwd)` | Override via `VENT_PROJECT_NAME` |
| `cwd` | `process.cwd()` of the host | Absolute path |
| `branch` | `git rev-parse --abbrev-ref HEAD` | `null` if not a git repo |
| `head_sha` | `git rev-parse --short HEAD` | `null` if no commits |
| `agent` | env `VENT_AGENT_LABEL` | Default `claude-code` |
| `status` | server | `open` on write; external triage may flip to `resolved`/`wontfix` |
| `tags` | server | Empty array on write; reserved for triage |
| body | agent | Markdown, max 5000 chars by default |

---

## Install

### Claude Code

Add to `~/.claude/mcp.json` (create if missing):

```json
{
  "mcpServers": {
    "vent": {
      "command": "npx",
      "args": ["-y", "vent-widget"]
    }
  }
}
```

Restart Claude Code. The `vent` tool is now available in every session.

### Optional: allow the tool without permission prompts

By default Claude Code prompts the first time an MCP tool is called. To let the agent vent silently (Lovable-style autonomous reporting), add to `~/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": ["mcp__vent__vent"]
  }
}
```

### Optional: per-install customization

```json
{
  "mcpServers": {
    "vent": {
      "command": "npx",
      "args": ["-y", "vent-widget"],
      "env": {
        "VENT_COMMIT_MODE": "stage",
        "VENT_AGENT_LABEL": "my-team",
        "VENT_INSTRUCTIONS_PATH": "/Users/me/.claude/vent-rules.md"
      }
    }
  }
}
```

---

### claude.ai chat

In the claude.ai web app, open **Settings → Connectors → Add custom connector**. Use these values:

- **Name:** `vent`
- **Command:** `npx`
- **Args:** `-y vent-widget`
- **Env:** add any of the variables in the [Configuration](#configuration) section

Once connected, the `vent` tool appears in any conversation. Note that claude.ai chat is sandboxed — the `cwd` field in vents will reflect the sandbox path, not your local repo. Use `VENT_PROJECT_NAME` to label vents from chat sessions meaningfully.

---

### Cursor / other MCP hosts

Any MCP host that supports stdio servers works. The generic recipe:

- **Command:** `npx`
- **Args:** `["-y", "vent-widget"]`

Or, if you've cloned this repo locally, point at the built bundle:

- **Command:** `node`
- **Args:** `["/absolute/path/to/vent-widget/dist/vent-widget.js"]`

**Cursor:** edit `~/.cursor/mcp.json` (or the workspace `.cursor/mcp.json`) using the same shape as the Claude Code example above.

**Continue, Aider, others:** consult their MCP server docs — the launch command and env vars are universal.

---

## Verifying it works

After install:

1. Open a new session in your MCP host.
2. Ask the agent: _"List your available tools."_ — confirm `vent` appears.
3. Ask: _"Use the vent tool to submit a test message."_
4. Check that `.vents/<timestamp>-<uuid>.md` appeared in whatever directory the host's process was running in.

If step 4 fails: the host is likely running from a directory you don't expect. Check the `cwd` field in the vent file once it's written — that's where vents will always land.

---

## Configuration

All env vars are optional. Set them in the `env:` block of your MCP host config.

| Var | Default | Purpose |
|---|---|---|
| `VENT_DIR` | `.vents` | Output dir, relative to cwd. Absolute paths and `..` segments are rejected at startup. |
| `VENT_COMMIT_MODE` | `none` | `none` / `stage` / `commit`. See below. |
| `VENT_MAX_BODY_LENGTH` | `5000` | Reject messages longer than this. |
| `VENT_AGENT_LABEL` | `claude-code` | Override the `agent:` field — useful when running multiple hosts. |
| `VENT_PROJECT_NAME` | auto | Override the `project:` field (default = git toplevel basename, then cwd basename). |
| `VENT_INSTRUCTIONS_PATH` | unset | Path to a markdown file appended to the `vent` tool description shown to the agent. |

### Commit modes

| Mode | What happens after writing the vent file |
|---|---|
| `none` (default) | Nothing. Vent sits in the working tree until something else picks it up. Cleanest separation; lets your normal flow handle commits. |
| `stage` | `git add <vent-file>`. The vent file shows up in `git status` as staged. Survives `git restore .` / `git checkout -- .` but NOT `git reset --hard HEAD` (which also resets the index). |
| `commit` | `git add <vent-file>` + `git commit -m "vent: <first 60 chars>"`. Dedicated commit per vent; survives anything short of `git reset --hard HEAD~`. |

All three modes are no-ops if the cwd isn't a git repo — the vent file is always written, the git step is best-effort.

---

## Customizing what the agent vents about

The default tool description lists `DO vent when…` and `DO NOT vent for…` cases. To tune that for your project, write a markdown file and point `VENT_INSTRUCTIONS_PATH` at it. Its contents are appended to the tool description the agent sees on every session.

Example `~/.claude/vent-rules.md`:

```markdown
**Good vents in this project:**
- "The `streaming_extract` agent timed out 3 times in a row against test-input-2.xlsx (50+ sheets)."
- "Jira MCP `pullRequestSubmission` transition fails with `assigneeAccountId` set."

**Skip vents for:**
- Routine "tool not found" — I resolve by adjusting PATH.
- Lint errors I corrected on the first retry.
```

The agent reads both the built-in guidance and your additions. Keep it short and example-driven (this is the same lesson Lovable learned: examples beat rules).

---

## Embedding vent-widget in your own product

If you're building an agent harness, IDE plugin, or hosted product and want vent-style friction reporting as part of it:

### 1. Launch the server alongside your agent

```bash
# Anywhere your agent runs, spawn vent-widget as an MCP server over stdio:
npx -y vent-widget
# With config:
VENT_DIR=.feedback VENT_AGENT_LABEL=my-product npx -y vent-widget
```

Wire it into your MCP client like any other stdio server. Your agent now sees the `vent` tool with no other changes to the rest of your tool surface.

### 2. Override config programmatically

All knobs are env vars — pass them through your MCP launch config:

```js
// Pseudocode for your MCP client wiring
const ventServer = {
  command: 'npx',
  args: ['-y', 'vent-widget'],
  env: {
    VENT_DIR: '.feedback',
    VENT_AGENT_LABEL: `${productName}-${sessionId}`,
    VENT_PROJECT_NAME: workspace.name,
    VENT_COMMIT_MODE: 'none',
    VENT_INSTRUCTIONS_PATH: instructionsFilePath,
  },
};
```

### 3. Set the cwd you want

vent-widget writes to `<cwd>/.vents/`. The cwd is whatever the host process is running in — typically the user's workspace. If your harness runs from somewhere else (a sandbox, a daemon), spawn the server with the explicit cwd you want vents to land in.

### 4. Bundle your own product's vent guidance

Ship a `vent-instructions.md` alongside your product and point `VENT_INSTRUCTIONS_PATH` at it. This is how you signal what counts as a vent in your domain (data pipeline failures? UI regressions? long-running tool calls?). Same surface area for users; tuned signal for you.

### 5. Read vents back out

Vents are plain markdown with YAML front-matter. Any language can parse them. Pseudocode:

```python
import yaml
from pathlib import Path

for path in sorted(Path('.vents').glob('*.md'), reverse=True):
    text = path.read_text()
    _, fm, body = text.split('---\n', 2)
    meta = yaml.safe_load(fm)
    if meta['status'] == 'open':
        process(meta, body)
```

The format is stable — front-matter fields won't be renamed without a major-version bump.

---

## Consuming vents (triage patterns)

vent-widget intentionally doesn't pick a triage strategy. Pick the one that fits your workflow:

### Pattern 1 — manual sweep
Open `.vents/` in your editor once a day. Read, fix or dismiss, edit `status:` to `resolved`/`wontfix`, commit.

### Pattern 2 — git hook
Add a pre-commit or post-checkout hook that prints `count(.vents/*.md where status=open)` so you don't forget.

### Pattern 3 — periodic CI job
A scheduled GitHub Action / cron job that scans `.vents/` and posts open ones to Slack/Linear/Jira.

### Pattern 4 — triage agent (Lovable-style)
Run a second agent that watches `.vents/`, reads each open vent, attempts a fix, and opens a PR. Lovable reports ~20% of vents become mergeable PRs this way, ~10 merged fixes per day, zero human-written code.

A minimal triage agent loop:

```
1. List .vents/*.md where status == open
2. For each: read the vent + git log around head_sha + any files mentioned
3. Try to reproduce. If repro succeeds, write a fix on a branch
4. Open a PR linking back to the vent file
5. Either bot-resolves the vent (status: resolved) or leaves it for a human
```

The vent file is the source of truth — the triage agent just reads markdown.

---

## FAQ

**Where do vents land?**
In `<cwd of the MCP host process>/.vents/`. For Claude Code, that's whichever directory you launched it from. For claude.ai chat, that's the sandbox path. Check the `cwd:` field of any vent to confirm.

**Can I prevent vents from being committed accidentally?**
Add `.vents/` to your `.gitignore`. Or use `VENT_COMMIT_MODE=none` (the default) and just don't `git add` the directory.

**What if multiple agents are writing vents at the same time?**
Each vent has a UUID-suffixed filename. Collisions are mathematically impossible (UUIDv4) so concurrent writes are safe.

**Can the agent flood me with vents?**
The tool description tells the agent to vent at most once per turn and only for repeated friction. There's no programmatic cap — if your agent goes spirally, you'd see it in `git status` quickly. Lovable hit this once (43 vents from one session apologizing for a false-positive); the fix was a system-prompt limit, not a server-side one.

**How do I send vents somewhere other than disk (Slack, Linear, etc.)?**
This server only writes to disk. To route elsewhere, run a separate consumer that scans `.vents/` and forwards. (See [Consuming vents](#consuming-vents-triage-patterns).) Or fork and replace the file-write step in `src/tools/vent.ts`.

**Does the agent see existing vents?**
No. The MCP surface is write-only. If you want the agent to read its own backlog, that's a different design — open an issue.

**Is the prompt/description configurable per-session or just per-install?**
Per-install (via `VENT_INSTRUCTIONS_PATH`, read once at startup). Per-session would require dynamic tool-list re-registration, which most MCP clients don't refresh mid-conversation.

---

## Development

```bash
git clone <this repo>
cd vent-widget
npm install
npm test            # 32 tests, ~3s
npm run build       # produces dist/vent-widget.js (~7KB, ESM)
npm run typecheck
```

Source layout:

```
src/
├── server.ts          # MCP server entry (stdio transport, tool registration)
├── tools/vent.ts      # write logic (id, front-matter, file, optional git op)
├── config.ts          # env var parsing
├── frontmatter.ts     # YAML serialize/parse
├── enrichment.ts      # git branch/sha/project detection
└── commit.ts          # optional git add/commit modes
```

Run the dev server (no build needed):
```bash
npm run dev           # tsx src/server.ts
```

---

## Acknowledgments

- **Lovable** for the [original vent tool blog post](https://lovable.dev/blog/we-gave-our-agent-a-vent-tool) and the lesson that example-driven prompts beat rule-based eligibility logic.
- **sticky-widget** for the structural template (small src, externalised deps, drop-in package).
- **Anthropic** for [the Model Context Protocol](https://modelcontextprotocol.io) and the [TS SDK](https://github.com/modelcontextprotocol/typescript-sdk).

---

## See also

- [SPEC.md](./SPEC.md) — design decisions, field-by-field rationale, deferred features.
- [Lovable blog post](https://lovable.dev/blog/we-gave-our-agent-a-vent-tool) — the original inspiration.
