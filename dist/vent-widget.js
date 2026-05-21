#!/usr/bin/env node

// src/server.ts
import { readFileSync, existsSync as existsSync2 } from "node:fs";
import { createRequire } from "node:module";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema
} from "@modelcontextprotocol/sdk/types.js";

// src/config.ts
var VALID_COMMIT_MODES = ["none", "stage", "commit"];
function loadConfig(env = process.env) {
  const commitModeRaw = env.VENT_COMMIT_MODE ?? "none";
  if (!VALID_COMMIT_MODES.includes(commitModeRaw)) {
    throw new Error(
      `VENT_COMMIT_MODE must be one of ${VALID_COMMIT_MODES.join("|")}, got '${commitModeRaw}'`
    );
  }
  const maxBodyRaw = env.VENT_MAX_BODY_LENGTH ?? "5000";
  const maxBody = Number.parseInt(maxBodyRaw, 10);
  if (!Number.isFinite(maxBody) || maxBody <= 0) {
    throw new Error(`VENT_MAX_BODY_LENGTH must be a positive integer, got '${maxBodyRaw}'`);
  }
  const ventDir = env.VENT_DIR ?? ".vents";
  if (ventDir.startsWith("/") || ventDir.split("/").includes("..")) {
    throw new Error(
      `VENT_DIR must be a relative path inside cwd, got '${ventDir}'`
    );
  }
  return {
    ventDir,
    commitMode: commitModeRaw,
    maxBodyLength: maxBody,
    agentLabel: env.VENT_AGENT_LABEL ?? "claude-code",
    projectName: env.VENT_PROJECT_NAME || void 0,
    instructionsPath: env.VENT_INSTRUCTIONS_PATH || void 0
  };
}

// src/tools/vent.ts
import { mkdirSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";

// src/enrichment.ts
import { execFileSync } from "node:child_process";
import { basename } from "node:path";
function git(cwd, args) {
  try {
    return execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}
function detectGitMetadata(cwd) {
  const branch = git(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head_sha = git(cwd, ["rev-parse", "--short", "HEAD"]);
  return { branch, head_sha };
}
function detectProjectName(cwd) {
  const toplevel = git(cwd, ["rev-parse", "--show-toplevel"]);
  return basename(toplevel ?? cwd);
}

// src/frontmatter.ts
import YAML from "yaml";
var FENCE = "---";
function serializeVent(fm, body) {
  const yamlText = YAML.stringify(fm).trimEnd();
  const trimmedBody = body.trim();
  return `${FENCE}
${yamlText}
${FENCE}
${trimmedBody}
`;
}

// src/commit.ts
import { execFileSync as execFileSync2 } from "node:child_process";
import { relative } from "node:path";
var MAX_COMMIT_SUMMARY = 60;
function isGitRepo(cwd) {
  try {
    execFileSync2("git", ["rev-parse", "--git-dir"], {
      cwd,
      stdio: ["ignore", "ignore", "ignore"]
    });
    return true;
  } catch {
    return false;
  }
}
function git2(cwd, args) {
  execFileSync2("git", args, { cwd, stdio: ["ignore", "ignore", "pipe"] });
}
function handleCommit({ mode, cwd, file, summary }) {
  if (mode === "none") return;
  if (!isGitRepo(cwd)) return;
  const rel = relative(cwd, file);
  try {
    switch (mode) {
      case "stage":
        git2(cwd, ["add", "--", rel]);
        return;
      case "commit": {
        git2(cwd, ["add", "--", rel]);
        const shortSummary = summary.slice(0, MAX_COMMIT_SUMMARY).trim() || "new vent";
        git2(cwd, ["commit", "-q", "-m", `vent: ${shortSummary}`, "--", rel]);
        return;
      }
      default: {
        const _exhaustive = mode;
        return _exhaustive;
      }
    }
  } catch (err) {
    const stderr = err instanceof Error && "stderr" in err ? err.stderr?.toString().trim() : "";
    if (stderr) {
      process.stderr.write(`[vent-widget] git operation failed (vent file was saved): ${stderr}
`);
    }
  }
}

// src/tools/vent.ts
function isoStamp() {
  const iso = (/* @__PURE__ */ new Date()).toISOString();
  const filenameStamp = iso.replace(/:/g, "-").replace("Z", "");
  return { iso, filenameStamp };
}
function firstLine(body) {
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (t.length) return t;
  }
  return "";
}
async function handleVent({ message, cwd, config: config2 }) {
  const trimmed = message.trim();
  if (!trimmed) throw new Error("vent message is empty");
  if (trimmed.length > config2.maxBodyLength) {
    throw new Error(
      `vent message too long: ${trimmed.length} > ${config2.maxBodyLength}`
    );
  }
  const id = uuidv4();
  const { iso, filenameStamp } = isoStamp();
  const ventDir = join(cwd, config2.ventDir);
  if (!existsSync(ventDir)) mkdirSync(ventDir, { recursive: true });
  const filename = `${filenameStamp}-${id.slice(0, 4)}.md`;
  const path = join(ventDir, filename);
  const git3 = detectGitMetadata(cwd);
  const project = config2.projectName ?? detectProjectName(cwd);
  const fm = {
    id,
    vented_at: iso,
    project,
    cwd,
    branch: git3.branch,
    head_sha: git3.head_sha,
    agent: config2.agentLabel,
    status: "open",
    tags: []
  };
  if (existsSync(path)) {
    throw new Error(`vent file already exists at ${path}`);
  }
  writeFileSync(path, serializeVent(fm, trimmed));
  handleCommit({ mode: config2.commitMode, cwd, file: path, summary: firstLine(trimmed) });
  return { id, path };
}

// src/server.ts
var require2 = createRequire(import.meta.url);
var pkg = require2("../package.json");
var config = loadConfig();
var VENT_DESCRIPTION_BASE = `Submit a free-text frustration when you are repeatedly blocked or have discovered a recurring friction. The message is written to a markdown file in this repo's ${config.ventDir}/ directory so the human (or a triage agent) can investigate later.

DO vent when:
- You've tried the same fix multiple times and the underlying tool/library/API keeps misbehaving.
- You've found a months-old bug, a missing capability, or a confusing error message that wasted significant time.
- A documented feature appears to not work as documented.

DO NOT vent for:
- A single failed attempt that you could retry.
- "I had to think for a moment."
- Routine errors you successfully recovered from.

Keep it to one vent per turn. Be specific: include the exact command, file, error message, or behaviour. Future-you (or another agent) will read this with no memory of the session.`;
function buildVentDescription() {
  if (!config.instructionsPath || !existsSync2(config.instructionsPath)) {
    return VENT_DESCRIPTION_BASE;
  }
  const extra = readFileSync(config.instructionsPath, "utf8").trim();
  return `${VENT_DESCRIPTION_BASE}

---
${extra}`;
}
var VENT_DESCRIPTION = buildVentDescription();
var server = new Server(
  { name: "vent-widget", version: pkg.version },
  { capabilities: { tools: {} } }
);
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "vent",
      description: VENT_DESCRIPTION,
      inputSchema: {
        type: "object",
        properties: {
          message: { type: "string", description: "Free-text vent body." }
        },
        required: ["message"]
      }
    }
  ]
}));
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const cwd = process.cwd();
  const args = req.params.arguments ?? {};
  try {
    switch (req.params.name) {
      case "vent": {
        const r = await handleVent({ message: String(args.message ?? ""), cwd, config });
        return { content: [{ type: "text", text: `Vented: ${r.id}
File: ${r.path}` }] };
      }
      default:
        return { content: [{ type: "text", text: `Unknown tool: ${req.params.name}` }], isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});
var transport = new StdioServerTransport();
await server.connect(transport);
