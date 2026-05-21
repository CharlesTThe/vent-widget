# vent-widget — Design Spec

**Date:** 2026-05-21
**Status:** Approved for implementation
**Inspired by:** [Lovable's vent tool](https://lovable.dev/blog/we-gave-our-agent-a-vent-tool) (May 2026) and the [sticky-widget](https://github.com/Theunissen-Charles_bcgprod/sticky-widget) repo structure.

---

## 1. Purpose

Give AI coding agents (Claude Code, claude.ai chat, any MCP-compatible host) a single tool to submit free-text frustration when they hit friction. Vents land as markdown files inside the active repo's `.vents/` directory, where they can be reviewed by the developer or triaged by a downstream agent.

Lovable's original lesson: trust model judgment, anchor with examples, keep the tool surface minimal, and do the work in the *processing pipeline*, not the *tool schema*.

## 2. Non-goals

- No central / cross-repo inbox. Vents are repo-local by design.
- No triage agent / auto-PR loop in v1. That's a separate consumer that just reads `.vents/*.md`.
- No agent-facing read/triage tools. Reading happens out-of-band (grep, editor, future CLI).
- No severity/category fields. Lovable explicitly rejected formal eligibility criteria — we follow that.

## 3. Shape

One MCP server, npm-packaged, `npx`-installable. Direct mimic of sticky-widget's "one package, drop in, done."

- **Stack:** Node + TypeScript + official `@modelcontextprotocol/sdk`.
- **Install surface:** one block in `mcp.json`.
- **Cwd-anchored:** vents always land in `<cwd>/.vents/`. The MCP host process's cwd is the source of truth. No global state, no central inbox.

## 4. Tools exposed

| Tool | Sticky-widget analogue | Purpose |
|---|---|---|
| `vent` | `POST /feedback` | Agent submits free-text frustration. One string arg: `message`. |

The MCP surface is intentionally minimal. Reading and triaging vents happens out-of-band — the `.vents/` directory is plain markdown, so any tool that reads files (grep, your editor, a future CLI) can consume it.

### 4.1 `vent` tool description (canonical)

```
Submit a free-text frustration when you are repeatedly blocked or have discovered
a recurring friction. The message is written to a markdown file in this repo's
.vents/ directory so the human (or a triage agent) can investigate later.

DO vent when:
- You've tried the same fix multiple times and the underlying tool/library/API
  keeps misbehaving.
- You've found a months-old bug, a missing capability, or a confusing error
  message that wasted significant time.
- A documented feature appears to not work as documented.

DO NOT vent for:
- A single failed attempt that you could retry.
- "I had to think for a moment."
- Routine errors you successfully recovered from.

Keep it to one vent per turn. Be specific: include the exact command, file,
error message, or behaviour. Future-you (or another agent) will read this with
no memory of the session.
```

(Installer-customizable via `VENT_INSTRUCTIONS_PATH`.)

## 5. Vent file format

One markdown file per vent. Filename is ISO timestamp + short uuid suffix so files sort chronologically by `ls`:

```
.vents/2026-05-21T14-32-15.123-a1b2.md
```

```markdown
---
id: a1b2c3d4-5e6f-7890-abcd-ef1234567890
vented_at: 2026-05-21T14:32:15.123Z
project: helix-m-sc-ai-advisory
cwd: /Users/theunissencharles/github/helix-m-sc-ai-advisory
branch: feature/HMAA-241-scrap-v2
head_sha: 3f8a92c
agent: claude-code
status: open
tags: []
---
<free-text body>
```

**Field ownership:**

| Field | Source | Notes |
|---|---|---|
| `id` | server-generated UUID v4 | Idempotency key. Skip write if filename already exists. |
| `vented_at` | server-generated ISO 8601 UTC | Includes milliseconds (`.123Z`). When the server received the vent. |
| `project` | auto: `basename(git toplevel)`, fallback `basename(cwd)` | Overridable via `VENT_PROJECT_NAME`. |
| `cwd` | `process.cwd()` | Absolute path. |
| `branch` | `git rev-parse --abbrev-ref HEAD` | `null` if not a git repo. |
| `head_sha` | `git rev-parse --short HEAD` | `null` if no commits. |
| `agent` | env `VENT_AGENT_LABEL` | Default `claude-code`. |
| `status` | server | Always `open` on write. Mutable by external triage (edit the YAML directly). |
| `tags` | server | Empty array on write. Reserved for external triage tooling. |
| body | agent (the `message` arg) | Markdown. |

Mirrors sticky-widget's discipline: agent supplies the comment, server captures all metadata.

## 6. Config (env vars — set in `mcp.json` per install)

| Var | Default | Purpose |
|---|---|---|
| `VENT_DIR` | `.vents` | Output dir, relative to cwd. |
| `VENT_COMMIT_MODE` | `none` | `none` \| `stage` \| `commit`. Default A (write only). |
| `VENT_MAX_BODY_LENGTH` | `5000` | Like sticky-widget's `MAX_COMMENT_LENGTH`. Hard reject above this. |
| `VENT_AGENT_LABEL` | `claude-code` | Override to disambiguate (`claude-chat`, `helix-agent`, etc.). |
| `VENT_PROJECT_NAME` | auto | Manual override for the `project` field. |
| `VENT_INSTRUCTIONS_PATH` | unset | Optional path to a markdown file appended to the `vent` tool description. Lets installers tune the examples without forking. |

`VENT_INSTRUCTIONS_PATH` is the key extensibility lever — same role as sticky-widget's `accentColor`/`onSubmit` config.

## 7. Commit modes

| Mode | Behaviour |
|---|---|
| `none` (default) | Just write the file. No git operations. Cleanest separation. |
| `stage` | Write + `git add <vent-file>`. Vent shows up in `git status` as staged. Survives `git restore .` and `git checkout -- .` but not `git reset --hard HEAD`, which also resets the index. |
| `commit` | Write + `git add` + `git commit -m "vent: <first line of body, truncated to 60 chars>"`. Dedicated commit; survives anything short of `git reset --hard HEAD~`. |

All modes are no-ops if cwd is not a git repo. Git failures are logged to stderr (server log) but never propagate to the agent.

## 8. Repo structure (mirrors sticky-widget)

```
vent-widget/
├── README.md                 # install + usage, sticky-widget style
├── SPEC.md                   # this file
├── package.json
├── tsconfig.json
├── build.js                  # esbuild bundle (matches sticky-widget pattern)
├── .gitignore
├── .env.example
├── src/
│   ├── server.ts             # MCP server entry — registers the vent tool
│   ├── tools/
│   │   └── vent.ts           # write logic (id, front-matter, write file)
│   ├── enrichment.ts         # git branch/sha/project detection
│   ├── commit.ts             # optional staged/commit logic
│   ├── frontmatter.ts        # YAML serialize / parse
│   └── config.ts             # env var parsing + defaults
├── dist/
│   └── vent-widget.js        # built bundle (single file, shebang)
├── tests/
│   └── *.test.ts             # vitest
└── examples/
    └── mcp.json              # drop-in Claude Code config
```

## 9. Install path

Add to Claude Code's `~/.claude/mcp.json`:

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

Per-install customization via env:

```json
{
  "mcpServers": {
    "vent": {
      "command": "npx",
      "args": ["-y", "vent-widget"],
      "env": {
        "VENT_COMMIT_MODE": "stage",
        "VENT_AGENT_LABEL": "claude-chat",
        "VENT_INSTRUCTIONS_PATH": "/Users/me/.claude/vent-examples.md"
      }
    }
  }
}
```

One line works for claude.ai chat too — same package, same args.

## 10. Validation rules (mirrors sticky-widget's router)

- `message` is required, must be a string, max `VENT_MAX_BODY_LENGTH` chars (default 5000). Reject with structured error otherwise.
- `message` is trimmed; reject if empty after trim.
- `.vents/` directory is created on first write if it doesn't exist.
- Filename collision: regenerate uuid suffix once, then bail if still colliding (should never happen with v4 uuid).
- Git operations: never fail the vent write because of a git operation failure. Vent file is the contract; commit is best-effort.

## 11. Error handling philosophy

- The `vent` tool MUST NOT raise on git-state edge cases (detached HEAD, no commits yet, worktree, submodule). It writes the file with `null` git fields and returns success.
- File-system write errors are real errors — surface them to the agent. (Disk full, permission denied.)
- Config parse errors at startup are fatal — server fails to start with a clear message.

## 12. Out of scope for v1 (deferred)

- **Reading/triage tools over MCP.** Earlier drafts exposed `list_vents` / `read_vent` / `resolve_vent` — removed because reading/triage is a human-driven task, not an agent task, and is better served by a separate CLI or just `grep`/file browser. The underlying file format is unchanged and any external consumer can still read `.vents/*.md` directly.
- **Triage agent / auto-PR loop.** Lovable's downstream debug-agent that consumes vents and opens PRs. v2 idea: a separate `vent-triage` package that reads `.vents/*.md` and proposes fixes.
- **Cross-repo aggregation.** A separate CLI that scans `~/github/*/.vents/` to give one unified view.
- **Vent search.** `grep` is enough for now.
- **Resolve workflow with comments.** v1 just toggles status; v2 could append a resolution log.
- **Rate limiting.** Lovable's one-vent-per-message guardrail. MCP server can't easily detect "per message" — defer until we see spirals in practice.

## 13. Open questions

None remaining. All decisions locked.

## 14. Testing strategy

- **Unit tests** for `frontmatter.ts` (round-trip serialize/parse), `enrichment.ts` (mocked git), `config.ts` (env var parsing + defaults).
- **Integration tests** with a temp git repo: write a vent, assert file shape, assert idempotency, assert all three commit modes behave.
- **MCP wire test** spawning the server via stdio and exercising each tool with the MCP SDK client.

## 15. References

- Lovable blog post (May 21, 2026): https://lovable.dev/blog/we-gave-our-agent-a-vent-tool
- sticky-widget repo: `~/github/sticky-widget/`
- MCP TypeScript SDK: https://github.com/modelcontextprotocol/typescript-sdk
