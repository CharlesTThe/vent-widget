# vent-widget Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an MCP server, packaged as an npx-installable npm module, that exposes a `vent` tool which writes free-text frustrations from AI agents to markdown files in the active repo's `.vents/` directory.

> **Scope update (post-implementation):** The MCP surface was narrowed to a single `vent` tool. `list_vents`/`read_vent`/`resolve_vent` were removed because reading/triage happens out-of-band. See SPEC §12.

**Architecture:** Single-process Node MCP server running over stdio. Tool handlers compose four pure modules (config, frontmatter, enrichment, commit) with the filesystem. Per-repo `.vents/` directory is the sink; cwd of the host process is the anchor. Mirrors sticky-widget's structural pattern (drop-in package, small src/ surface, esbuild bundle in dist/).

**Tech Stack:** Node 20+, TypeScript 5, `@modelcontextprotocol/sdk` (official MCP TS SDK), `yaml` (front-matter), `uuid`, `vitest` (tests), `esbuild` (bundle).

**Spec:** [`SPEC.md`](./SPEC.md)

**Working directory:** `/Users/theunissencharles/github/vent-widget`

---

## File Structure

Files this plan creates, with single responsibilities:

| Path | Responsibility |
|---|---|
| `package.json` | npm metadata + scripts + bin entry for `npx` |
| `tsconfig.json` | TS compile settings |
| `build.js` | esbuild bundle to `dist/vent-widget.js` |
| `.gitignore` | ignore `node_modules/`, `dist/` is checked in (matches sticky-widget) |
| `.env.example` | document env vars |
| `src/config.ts` | parse env vars, expose typed `Config` |
| `src/frontmatter.ts` | serialize/parse YAML front-matter |
| `src/enrichment.ts` | detect git branch / sha / project name |
| `src/commit.ts` | optional `git add` / `git commit` per `VENT_COMMIT_MODE` |
| `src/tools/vent.ts` | write a vent file (composes all of the above) |
| `src/tools/list.ts` | list vents in `.vents/` with filtering |
| `src/tools/read.ts` | read one vent by id |
| `src/tools/resolve.ts` | toggle vent status |
| `src/server.ts` | MCP server entry — register tools, run stdio transport |
| `dist/vent-widget.js` | built single-file bundle with shebang |
| `README.md` | install + usage docs (sticky-widget style) |
| `examples/mcp.json` | drop-in Claude Code config |
| `tests/frontmatter.test.ts` | round-trip serialize/parse |
| `tests/enrichment.test.ts` | git metadata detection with temp repos |
| `tests/commit.test.ts` | each commit mode behaviour |
| `tests/vent.test.ts` | end-to-end vent write through the tool handler |
| `tests/list-read-resolve.test.ts` | read-side tools |
| `tests/server.test.ts` | stdio wire test with the MCP client SDK |

---

## Task 1: Scaffold the package

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `build.js`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "vent-widget",
  "version": "0.1.0",
  "description": "MCP server that lets AI agents vent friction into .vents/ markdown files in your repo",
  "type": "module",
  "main": "dist/vent-widget.js",
  "bin": {
    "vent-widget": "dist/vent-widget.js"
  },
  "files": [
    "dist/",
    "README.md",
    "SPEC.md"
  ],
  "scripts": {
    "build": "node build.js",
    "dev": "tsx src/server.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "uuid": "^9.0.1",
    "yaml": "^2.4.0"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/uuid": "^9.0.7",
    "esbuild": "^0.25.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  },
  "engines": {
    "node": ">=20"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "esModuleInterop": true,
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noEmit": true
  },
  "include": ["src/**/*", "tests/**/*", "build.js"]
}
```

- [ ] **Step 3: Create `.gitignore`**

```
node_modules/
*.log
.DS_Store
```

Note: `dist/` is NOT ignored — it's published with the package and committed (matches sticky-widget).

- [ ] **Step 4: Create `.env.example`**

```
# All optional — defaults are sane.
VENT_DIR=.vents
VENT_COMMIT_MODE=none           # none | stage | commit
VENT_MAX_BODY_LENGTH=5000
VENT_AGENT_LABEL=claude-code
# VENT_PROJECT_NAME=my-project   # auto-detected from git toplevel otherwise
# VENT_INSTRUCTIONS_PATH=/abs/path/to/extra-vent-examples.md
```

- [ ] **Step 5: Create `build.js`**

```js
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/vent-widget.js',
  banner: { js: '#!/usr/bin/env node' },
  external: [],
});

console.log('Built dist/vent-widget.js');
```

- [ ] **Step 6: Install deps**

Run: `npm install`
Expected: lockfile created, `node_modules/` populated, no errors.

- [ ] **Step 7: Commit**

```bash
git add package.json tsconfig.json .gitignore .env.example build.js package-lock.json
git commit -m "scaffold: package config, tsconfig, build, env example"
```

---

## Task 2: Config module

**Files:**
- Create: `src/config.ts`
- Create: `tests/config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/config.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('VENT_')) delete process.env[k];
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns defaults when no env vars set', () => {
    const cfg = loadConfig();
    expect(cfg.ventDir).toBe('.vents');
    expect(cfg.commitMode).toBe('none');
    expect(cfg.maxBodyLength).toBe(5000);
    expect(cfg.agentLabel).toBe('claude-code');
    expect(cfg.projectName).toBeUndefined();
    expect(cfg.instructionsPath).toBeUndefined();
  });

  it('reads VENT_DIR override', () => {
    process.env.VENT_DIR = '.frustrations';
    expect(loadConfig().ventDir).toBe('.frustrations');
  });

  it('accepts valid commit modes', () => {
    process.env.VENT_COMMIT_MODE = 'stage';
    expect(loadConfig().commitMode).toBe('stage');
    process.env.VENT_COMMIT_MODE = 'commit';
    expect(loadConfig().commitMode).toBe('commit');
  });

  it('rejects invalid commit mode', () => {
    process.env.VENT_COMMIT_MODE = 'banana';
    expect(() => loadConfig()).toThrow(/VENT_COMMIT_MODE/);
  });

  it('parses VENT_MAX_BODY_LENGTH as int', () => {
    process.env.VENT_MAX_BODY_LENGTH = '8000';
    expect(loadConfig().maxBodyLength).toBe(8000);
  });

  it('rejects non-numeric VENT_MAX_BODY_LENGTH', () => {
    process.env.VENT_MAX_BODY_LENGTH = 'abc';
    expect(() => loadConfig()).toThrow(/VENT_MAX_BODY_LENGTH/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/config.test.ts`
Expected: FAIL with "Cannot find module '../src/config.js'"

- [ ] **Step 3: Implement `src/config.ts`**

```ts
export type CommitMode = 'none' | 'stage' | 'commit';

export interface Config {
  ventDir: string;
  commitMode: CommitMode;
  maxBodyLength: number;
  agentLabel: string;
  projectName: string | undefined;
  instructionsPath: string | undefined;
}

const VALID_COMMIT_MODES: readonly CommitMode[] = ['none', 'stage', 'commit'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const commitModeRaw = env.VENT_COMMIT_MODE ?? 'none';
  if (!VALID_COMMIT_MODES.includes(commitModeRaw as CommitMode)) {
    throw new Error(
      `VENT_COMMIT_MODE must be one of ${VALID_COMMIT_MODES.join('|')}, got '${commitModeRaw}'`
    );
  }

  const maxBodyRaw = env.VENT_MAX_BODY_LENGTH ?? '5000';
  const maxBody = Number.parseInt(maxBodyRaw, 10);
  if (!Number.isFinite(maxBody) || maxBody <= 0) {
    throw new Error(`VENT_MAX_BODY_LENGTH must be a positive integer, got '${maxBodyRaw}'`);
  }

  return {
    ventDir: env.VENT_DIR ?? '.vents',
    commitMode: commitModeRaw as CommitMode,
    maxBodyLength: maxBody,
    agentLabel: env.VENT_AGENT_LABEL ?? 'claude-code',
    projectName: env.VENT_PROJECT_NAME || undefined,
    instructionsPath: env.VENT_INSTRUCTIONS_PATH || undefined,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/config.test.ts`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/config.ts tests/config.test.ts
git commit -m "feat: config module with env var parsing"
```

---

## Task 3: Frontmatter module

**Files:**
- Create: `src/frontmatter.ts`
- Create: `tests/frontmatter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/frontmatter.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { serializeVent, parseVent, type VentFrontmatter } from '../src/frontmatter.js';

const fm: VentFrontmatter = {
  id: 'a1b2c3d4-5e6f-7890-abcd-ef1234567890',
  vented_at: '2026-05-21T14:32:15Z',
  project: 'helix-m-sc-ai-advisory',
  cwd: '/Users/me/repos/helix',
  branch: 'feature/HMAA-241',
  head_sha: '3f8a92c',
  agent: 'claude-code',
  status: 'open',
  tags: [],
};

describe('serializeVent', () => {
  it('produces front-matter delimited by ---', () => {
    const out = serializeVent(fm, 'Body line one.\nBody line two.\n');
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toContain('id: a1b2c3d4-5e6f-7890-abcd-ef1234567890');
    expect(out).toContain('status: open');
    expect(out).toContain('Body line one.');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('trims body but preserves internal newlines', () => {
    const out = serializeVent(fm, '   \n\nHello\n\nWorld\n\n  ');
    expect(out).toContain('\nHello\n\nWorld\n');
    expect(out).not.toMatch(/Hello.*\n\s*\n\s*$/);
  });
});

describe('parseVent', () => {
  it('round-trips serialize → parse', () => {
    const body = 'Multi-line\nbody with **markdown**.';
    const text = serializeVent(fm, body);
    const parsed = parseVent(text);
    expect(parsed.frontmatter).toEqual(fm);
    expect(parsed.body.trim()).toBe(body.trim());
  });

  it('throws on missing front-matter delimiters', () => {
    expect(() => parseVent('just a body, no fence')).toThrow(/front-matter/);
  });

  it('preserves null git fields', () => {
    const withNulls = { ...fm, branch: null, head_sha: null };
    const text = serializeVent(withNulls, 'body');
    const parsed = parseVent(text);
    expect(parsed.frontmatter.branch).toBeNull();
    expect(parsed.frontmatter.head_sha).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/frontmatter.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `src/frontmatter.ts`**

```ts
import YAML from 'yaml';

export type VentStatus = 'open' | 'resolved' | 'wontfix';

export interface VentFrontmatter {
  id: string;
  vented_at: string;
  project: string;
  cwd: string;
  branch: string | null;
  head_sha: string | null;
  agent: string;
  status: VentStatus;
  tags: string[];
}

const FENCE = '---';

export function serializeVent(fm: VentFrontmatter, body: string): string {
  const yamlText = YAML.stringify(fm).trimEnd();
  const trimmedBody = body.trim();
  return `${FENCE}\n${yamlText}\n${FENCE}\n${trimmedBody}\n`;
}

export interface ParsedVent {
  frontmatter: VentFrontmatter;
  body: string;
}

export function parseVent(text: string): ParsedVent {
  if (!text.startsWith(`${FENCE}\n`)) {
    throw new Error('Missing opening front-matter fence (---)');
  }
  const rest = text.slice(FENCE.length + 1);
  const closeIdx = rest.indexOf(`\n${FENCE}\n`);
  if (closeIdx === -1) {
    throw new Error('Missing closing front-matter fence (---)');
  }
  const yamlText = rest.slice(0, closeIdx);
  const body = rest.slice(closeIdx + FENCE.length + 2);
  const frontmatter = YAML.parse(yamlText) as VentFrontmatter;
  return { frontmatter, body };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/frontmatter.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/frontmatter.ts tests/frontmatter.test.ts
git commit -m "feat: frontmatter serialize/parse with round-trip tests"
```

---

## Task 4: Enrichment module (git metadata)

**Files:**
- Create: `src/enrichment.ts`
- Create: `tests/enrichment.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/enrichment.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { detectGitMetadata, detectProjectName } from '../src/enrichment.js';

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vent-test-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email test@test.test', { cwd: dir });
  execSync('git config user.name test', { cwd: dir });
  execSync('git commit -q --allow-empty -m initial', { cwd: dir });
  return dir;
}

describe('detectGitMetadata', () => {
  it('returns branch and short sha for a fresh repo', () => {
    const dir = makeRepo();
    const meta = detectGitMetadata(dir);
    expect(meta.branch).toMatch(/^(master|main)$/);
    expect(meta.head_sha).toMatch(/^[0-9a-f]{7,}$/);
  });

  it('returns nulls when cwd is not a git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-nogit-'));
    const meta = detectGitMetadata(dir);
    expect(meta.branch).toBeNull();
    expect(meta.head_sha).toBeNull();
  });

  it('returns null sha for repo with no commits', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-empty-'));
    execSync('git init -q', { cwd: dir });
    const meta = detectGitMetadata(dir);
    expect(meta.head_sha).toBeNull();
  });
});

describe('detectProjectName', () => {
  it('uses git toplevel basename when in a repo', () => {
    const dir = makeRepo();
    const sub = join(dir, 'nested');
    mkdirSync(sub);
    expect(detectProjectName(sub)).toBe(dir.split('/').pop());
  });

  it('falls back to cwd basename when not in a repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-bare-'));
    expect(detectProjectName(dir)).toBe(dir.split('/').pop());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/enrichment.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `src/enrichment.ts`**

```ts
import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

export interface GitMetadata {
  branch: string | null;
  head_sha: string | null;
}

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

export function detectGitMetadata(cwd: string): GitMetadata {
  const branch = git(cwd, ['rev-parse', '--abbrev-ref', 'HEAD']);
  const head_sha = git(cwd, ['rev-parse', '--short', 'HEAD']);
  return { branch, head_sha };
}

export function detectProjectName(cwd: string): string {
  const toplevel = git(cwd, ['rev-parse', '--show-toplevel']);
  return basename(toplevel ?? cwd);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/enrichment.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/enrichment.ts tests/enrichment.test.ts
git commit -m "feat: git metadata detection for project/branch/sha"
```

---

## Task 5: Commit module

**Files:**
- Create: `src/commit.ts`
- Create: `tests/commit.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/commit.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { handleCommit } from '../src/commit.js';

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vent-commit-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email test@test.test', { cwd: dir });
  execSync('git config user.name test', { cwd: dir });
  execSync('git commit -q --allow-empty -m initial', { cwd: dir });
  return dir;
}

function writeVent(dir: string, name: string, body: string): string {
  const path = join(dir, name);
  writeFileSync(path, body);
  return path;
}

describe('handleCommit', () => {
  it('mode=none does nothing', () => {
    const dir = makeRepo();
    const file = writeVent(dir, 'v1.md', 'hello\n');
    handleCommit({ mode: 'none', cwd: dir, file, summary: 'hello' });
    const status = execSync('git status --porcelain', { cwd: dir }).toString();
    expect(status).toContain('?? v1.md');
  });

  it('mode=stage adds the file to the index', () => {
    const dir = makeRepo();
    const file = writeVent(dir, 'v1.md', 'hello\n');
    handleCommit({ mode: 'stage', cwd: dir, file, summary: 'hello' });
    const status = execSync('git status --porcelain', { cwd: dir }).toString();
    expect(status).toContain('A  v1.md');
  });

  it('mode=commit creates a commit with summary in message', () => {
    const dir = makeRepo();
    const file = writeVent(dir, 'v1.md', 'hello\n');
    handleCommit({ mode: 'commit', cwd: dir, file, summary: 'hello world' });
    const log = execSync('git log --oneline -1', { cwd: dir }).toString();
    expect(log).toMatch(/vent: hello world/);
  });

  it('truncates long summaries in commit messages', () => {
    const dir = makeRepo();
    const file = writeVent(dir, 'v1.md', 'x\n');
    const longSummary = 'a'.repeat(200);
    handleCommit({ mode: 'commit', cwd: dir, file, summary: longSummary });
    const log = execSync('git log --oneline -1', { cwd: dir }).toString();
    expect(log.length).toBeLessThan(120);
  });

  it('does nothing (no throw) when not in a git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-nogit-'));
    const file = writeVent(dir, 'v1.md', 'hello\n');
    expect(() =>
      handleCommit({ mode: 'commit', cwd: dir, file, summary: 'hello' })
    ).not.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/commit.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `src/commit.ts`**

```ts
import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';
import type { CommitMode } from './config.js';

const MAX_COMMIT_SUMMARY = 60;

export interface CommitArgs {
  mode: CommitMode;
  cwd: string;
  file: string;
  summary: string;
}

function isGitRepo(cwd: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--git-dir'], {
      cwd,
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    return true;
  } catch {
    return false;
  }
}

function git(cwd: string, args: string[]): void {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'ignore', 'pipe'] });
}

export function handleCommit({ mode, cwd, file, summary }: CommitArgs): void {
  if (mode === 'none') return;
  if (!isGitRepo(cwd)) return;

  const rel = relative(cwd, file);
  try {
    git(cwd, ['add', '--', rel]);
    if (mode === 'commit') {
      const shortSummary = summary.slice(0, MAX_COMMIT_SUMMARY).trim() || 'new vent';
      git(cwd, ['commit', '-q', '-m', `vent: ${shortSummary}`, '--', rel]);
    }
  } catch {
    // Best effort — never fail the vent because of a git operation.
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/commit.test.ts`
Expected: all 5 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/commit.ts tests/commit.test.ts
git commit -m "feat: optional staged/commit modes for vent files"
```

---

## Task 6: `vent` tool handler

**Files:**
- Create: `src/tools/vent.ts`
- Create: `tests/vent.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/vent.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execSync } from 'node:child_process';
import { handleVent } from '../src/tools/vent.js';
import { loadConfig } from '../src/config.js';
import { parseVent } from '../src/frontmatter.js';

function makeRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), 'vent-handler-'));
  execSync('git init -q', { cwd: dir });
  execSync('git config user.email t@t.t', { cwd: dir });
  execSync('git config user.name t', { cwd: dir });
  execSync('git commit -q --allow-empty -m initial', { cwd: dir });
  return dir;
}

describe('handleVent', () => {
  it('writes a markdown file with the body and front-matter', async () => {
    const dir = makeRepo();
    const cfg = loadConfig({});
    const result = await handleVent({
      message: 'code--copy fails with spaces in filename',
      cwd: dir,
      config: cfg,
    });

    expect(result.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(existsSync(result.path)).toBe(true);

    const text = readFileSync(result.path, 'utf8');
    const { frontmatter, body } = parseVent(text);
    expect(frontmatter.id).toBe(result.id);
    expect(frontmatter.status).toBe('open');
    expect(frontmatter.agent).toBe('claude-code');
    expect(frontmatter.branch).toMatch(/^(master|main)$/);
    expect(body.trim()).toBe('code--copy fails with spaces in filename');
  });

  it('creates the .vents directory if missing', async () => {
    const dir = makeRepo();
    expect(existsSync(join(dir, '.vents'))).toBe(false);
    await handleVent({ message: 'x', cwd: dir, config: loadConfig({}) });
    expect(existsSync(join(dir, '.vents'))).toBe(true);
  });

  it('respects custom VENT_DIR', async () => {
    const dir = makeRepo();
    const cfg = loadConfig({ VENT_DIR: '.frustrations' });
    await handleVent({ message: 'x', cwd: dir, config: cfg });
    expect(readdirSync(join(dir, '.frustrations')).length).toBe(1);
  });

  it('rejects empty message after trim', async () => {
    const dir = makeRepo();
    await expect(
      handleVent({ message: '   \n\n  ', cwd: dir, config: loadConfig({}) })
    ).rejects.toThrow(/empty/);
  });

  it('rejects message above max length', async () => {
    const dir = makeRepo();
    const cfg = loadConfig({ VENT_MAX_BODY_LENGTH: '20' });
    await expect(
      handleVent({ message: 'x'.repeat(21), cwd: dir, config: cfg })
    ).rejects.toThrow(/too long/);
  });

  it('writes succeed even when cwd is not a git repo', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-nogit-'));
    const result = await handleVent({
      message: 'no git here',
      cwd: dir,
      config: loadConfig({}),
    });
    const { frontmatter } = parseVent(readFileSync(result.path, 'utf8'));
    expect(frontmatter.branch).toBeNull();
    expect(frontmatter.head_sha).toBeNull();
  });

  it('stages the file when commit mode is stage', async () => {
    const dir = makeRepo();
    const cfg = loadConfig({ VENT_COMMIT_MODE: 'stage' });
    const result = await handleVent({ message: 'x', cwd: dir, config: cfg });
    const status = execSync('git status --porcelain', { cwd: dir }).toString();
    const rel = result.path.replace(`${dir}/`, '');
    expect(status).toContain(`A  ${rel}`);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/vent.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `src/tools/vent.ts`**

```ts
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Config } from '../config.js';
import { detectGitMetadata, detectProjectName } from '../enrichment.js';
import { serializeVent, type VentFrontmatter } from '../frontmatter.js';
import { handleCommit } from '../commit.js';

export interface VentArgs {
  message: string;
  cwd: string;
  config: Config;
}

export interface VentResult {
  id: string;
  path: string;
}

function isoStamp(): { iso: string; filenameStamp: string } {
  const iso = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const filenameStamp = iso.replace(/:/g, '-').replace('Z', '');
  return { iso, filenameStamp };
}

function firstLine(body: string): string {
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (t.length) return t;
  }
  return '';
}

export async function handleVent({ message, cwd, config }: VentArgs): Promise<VentResult> {
  const trimmed = message.trim();
  if (!trimmed) throw new Error('vent message is empty');
  if (message.length > config.maxBodyLength) {
    throw new Error(
      `vent message too long: ${message.length} > ${config.maxBodyLength}`
    );
  }

  const id = uuidv4();
  const { iso, filenameStamp } = isoStamp();
  const ventDir = join(cwd, config.ventDir);
  if (!existsSync(ventDir)) mkdirSync(ventDir, { recursive: true });

  const filename = `${filenameStamp}-${id.slice(0, 4)}.md`;
  const path = join(ventDir, filename);

  const git = detectGitMetadata(cwd);
  const project = config.projectName ?? detectProjectName(cwd);

  const fm: VentFrontmatter = {
    id,
    vented_at: iso,
    project,
    cwd,
    branch: git.branch,
    head_sha: git.head_sha,
    agent: config.agentLabel,
    status: 'open',
    tags: [],
  };

  writeFileSync(path, serializeVent(fm, trimmed));
  handleCommit({ mode: config.commitMode, cwd, file: path, summary: firstLine(trimmed) });

  return { id, path };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/vent.test.ts`
Expected: all 7 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/vent.ts tests/vent.test.ts
git commit -m "feat: vent tool handler — write markdown vent files"
```

---

## Task 7: `list_vents`, `read_vent`, `resolve_vent` tools

**Files:**
- Create: `src/tools/list.ts`
- Create: `src/tools/read.ts`
- Create: `src/tools/resolve.ts`
- Create: `tests/list-read-resolve.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/list-read-resolve.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handleVent } from '../src/tools/vent.js';
import { handleList } from '../src/tools/list.js';
import { handleRead } from '../src/tools/read.js';
import { handleResolve } from '../src/tools/resolve.js';
import { loadConfig } from '../src/config.js';
import { parseVent } from '../src/frontmatter.js';

async function seedVents(dir: string, n: number): Promise<string[]> {
  const cfg = loadConfig({});
  const ids: string[] = [];
  for (let i = 0; i < n; i++) {
    const r = await handleVent({
      message: `vent number ${i}\nsecond line ${i}`,
      cwd: dir,
      config: cfg,
    });
    ids.push(r.id);
    await new Promise((res) => setTimeout(res, 5));
  }
  return ids;
}

describe('handleList', () => {
  it('returns all open vents by default, most recent first', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-list-'));
    const ids = await seedVents(dir, 3);
    const result = handleList({ cwd: dir, config: loadConfig({}), status: 'open' });
    expect(result.length).toBe(3);
    expect(result[0].id).toBe(ids[2]);
    expect(result[0].summary).toMatch(/^vent number 2$/);
    expect(result[0].status).toBe('open');
  });

  it('respects the limit arg', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-listlim-'));
    await seedVents(dir, 5);
    expect(handleList({ cwd: dir, config: loadConfig({}), limit: 2 }).length).toBe(2);
  });

  it('returns [] when .vents directory does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-listnone-'));
    expect(handleList({ cwd: dir, config: loadConfig({}) })).toEqual([]);
  });

  it('filters by status=all to include resolved', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-listall-'));
    const ids = await seedVents(dir, 2);
    handleResolve({ cwd: dir, config: loadConfig({}), id: ids[0], status: 'resolved' });
    expect(handleList({ cwd: dir, config: loadConfig({}), status: 'open' }).length).toBe(1);
    expect(handleList({ cwd: dir, config: loadConfig({}), status: 'all' }).length).toBe(2);
  });
});

describe('handleRead', () => {
  it('returns full body and front-matter by id', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-read-'));
    const ids = await seedVents(dir, 1);
    const result = handleRead({ cwd: dir, config: loadConfig({}), id: ids[0] });
    expect(result.frontmatter.id).toBe(ids[0]);
    expect(result.body).toContain('second line 0');
  });

  it('throws when id not found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-read404-'));
    expect(() =>
      handleRead({ cwd: dir, config: loadConfig({}), id: 'nope' })
    ).toThrow(/not found/);
  });
});

describe('handleResolve', () => {
  it('changes status from open to resolved', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-res-'));
    const ids = await seedVents(dir, 1);
    handleResolve({ cwd: dir, config: loadConfig({}), id: ids[0], status: 'resolved' });
    const result = handleRead({ cwd: dir, config: loadConfig({}), id: ids[0] });
    expect(result.frontmatter.status).toBe('resolved');
  });

  it('supports wontfix', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-wf-'));
    const ids = await seedVents(dir, 1);
    handleResolve({ cwd: dir, config: loadConfig({}), id: ids[0], status: 'wontfix' });
    expect(
      handleRead({ cwd: dir, config: loadConfig({}), id: ids[0] }).frontmatter.status
    ).toBe('wontfix');
  });

  it('throws when id not found', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-res404-'));
    expect(() =>
      handleResolve({ cwd: dir, config: loadConfig({}), id: 'nope', status: 'resolved' })
    ).toThrow(/not found/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/list-read-resolve.test.ts`
Expected: FAIL with "Cannot find module".

- [ ] **Step 3: Implement `src/tools/list.ts`**

```ts
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.js';
import { parseVent, type VentStatus } from '../frontmatter.js';

export type ListStatusFilter = VentStatus | 'all';

export interface ListArgs {
  cwd: string;
  config: Config;
  status?: ListStatusFilter;
  limit?: number;
}

export interface ListEntry {
  id: string;
  filename: string;
  vented_at: string;
  status: VentStatus;
  summary: string;
}

const SUMMARY_MAX = 120;

function summarize(body: string): string {
  for (const line of body.split('\n')) {
    const t = line.trim();
    if (t.length) return t.slice(0, SUMMARY_MAX);
  }
  return '';
}

export function handleList({
  cwd,
  config,
  status = 'open',
  limit = 50,
}: ListArgs): ListEntry[] {
  const ventDir = join(cwd, config.ventDir);
  if (!existsSync(ventDir)) return [];

  const files = readdirSync(ventDir)
    .filter((n) => n.endsWith('.md'))
    .sort()
    .reverse();

  const out: ListEntry[] = [];
  for (const filename of files) {
    if (out.length >= limit) break;
    const text = readFileSync(join(ventDir, filename), 'utf8');
    try {
      const { frontmatter, body } = parseVent(text);
      if (status !== 'all' && frontmatter.status !== status) continue;
      out.push({
        id: frontmatter.id,
        filename,
        vented_at: frontmatter.vented_at,
        status: frontmatter.status,
        summary: summarize(body),
      });
    } catch {
      // skip malformed files silently
    }
  }
  return out;
}
```

- [ ] **Step 4: Implement `src/tools/read.ts`**

```ts
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.js';
import { parseVent, type VentFrontmatter } from '../frontmatter.js';

export interface ReadArgs {
  cwd: string;
  config: Config;
  id: string;
}

export interface ReadResult {
  frontmatter: VentFrontmatter;
  body: string;
  filename: string;
}

export function findVentFileById(cwd: string, ventDir: string, id: string): string | null {
  const dir = join(cwd, ventDir);
  if (!existsSync(dir)) return null;
  for (const filename of readdirSync(dir)) {
    if (!filename.endsWith('.md')) continue;
    const text = readFileSync(join(dir, filename), 'utf8');
    try {
      const { frontmatter } = parseVent(text);
      if (frontmatter.id === id) return filename;
    } catch {
      // skip
    }
  }
  return null;
}

export function handleRead({ cwd, config, id }: ReadArgs): ReadResult {
  const filename = findVentFileById(cwd, config.ventDir, id);
  if (!filename) throw new Error(`vent not found: ${id}`);
  const text = readFileSync(join(cwd, config.ventDir, filename), 'utf8');
  const { frontmatter, body } = parseVent(text);
  return { frontmatter, body, filename };
}
```

- [ ] **Step 5: Implement `src/tools/resolve.ts`**

```ts
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Config } from '../config.js';
import { parseVent, serializeVent, type VentStatus } from '../frontmatter.js';
import { findVentFileById } from './read.js';

export interface ResolveArgs {
  cwd: string;
  config: Config;
  id: string;
  status: Extract<VentStatus, 'resolved' | 'wontfix'>;
}

export function handleResolve({ cwd, config, id, status }: ResolveArgs): void {
  const filename = findVentFileById(cwd, config.ventDir, id);
  if (!filename) throw new Error(`vent not found: ${id}`);
  const path = join(cwd, config.ventDir, filename);
  const text = readFileSync(path, 'utf8');
  const { frontmatter, body } = parseVent(text);
  const updated = { ...frontmatter, status };
  writeFileSync(path, serializeVent(updated, body));
}
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npm test -- tests/list-read-resolve.test.ts`
Expected: all 9 tests PASS.

- [ ] **Step 7: Commit**

```bash
git add src/tools/list.ts src/tools/read.ts src/tools/resolve.ts tests/list-read-resolve.test.ts
git commit -m "feat: list/read/resolve tool handlers"
```

---

## Task 8: MCP server entry — register tools over stdio

**Files:**
- Create: `src/server.ts`
- Create: `tests/server.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/server.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function startClient(cwd: string) {
  const transport = new StdioClientTransport({
    command: 'tsx',
    args: ['src/server.ts'],
    cwd,
    env: { ...process.env, VENT_DIR: '.vents' },
  });
  const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

describe('MCP server', () => {
  it('lists the four expected tools', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-srv-'));
    const { client, transport } = await startClient(process.cwd());
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name).sort();
      expect(names).toEqual(['list_vents', 'read_vent', 'resolve_vent', 'vent']);
    } finally {
      await transport.close();
    }
  });

  it('calling vent tool writes a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-srvcall-'));
    const { client, transport } = await startClient(dir);
    try {
      const result = await client.callTool({
        name: 'vent',
        arguments: { message: 'thing broke' },
      });
      expect(result.isError).toBeFalsy();
      const files = readdirSync(join(dir, '.vents'));
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/\.md$/);
    } finally {
      await transport.close();
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server.test.ts`
Expected: FAIL with "Cannot find module" or server-spawn error.

- [ ] **Step 3: Implement `src/server.ts`**

```ts
#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { handleVent } from './tools/vent.js';
import { handleList } from './tools/list.js';
import { handleRead } from './tools/read.js';
import { handleResolve } from './tools/resolve.js';

const config = loadConfig();

const VENT_DESCRIPTION_BASE = `Submit a free-text frustration when you are repeatedly blocked or have discovered a recurring friction. The message is written to a markdown file in this repo's ${config.ventDir}/ directory so the human (or a triage agent) can investigate later.

DO vent when:
- You've tried the same fix multiple times and the underlying tool/library/API keeps misbehaving.
- You've found a months-old bug, a missing capability, or a confusing error message that wasted significant time.
- A documented feature appears to not work as documented.

DO NOT vent for:
- A single failed attempt that you could retry.
- "I had to think for a moment."
- Routine errors you successfully recovered from.

Keep it to one vent per turn. Be specific: include the exact command, file, error message, or behaviour. Future-you (or another agent) will read this with no memory of the session.`;

function buildVentDescription(): string {
  if (!config.instructionsPath || !existsSync(config.instructionsPath)) {
    return VENT_DESCRIPTION_BASE;
  }
  const extra = readFileSync(config.instructionsPath, 'utf8').trim();
  return `${VENT_DESCRIPTION_BASE}\n\n---\n${extra}`;
}

const server = new Server(
  { name: 'vent-widget', version: '0.1.0' },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'vent',
      description: buildVentDescription(),
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Free-text vent body.' },
        },
        required: ['message'],
      },
    },
    {
      name: 'list_vents',
      description: 'List vents in the current repo. Returns id, filename, timestamp, status, and a short summary.',
      inputSchema: {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['open', 'resolved', 'wontfix', 'all'],
            description: 'Filter by status. Default: open.',
          },
          limit: { type: 'number', description: 'Max entries. Default: 50.' },
        },
      },
    },
    {
      name: 'read_vent',
      description: 'Read a single vent by id. Returns front-matter + body.',
      inputSchema: {
        type: 'object',
        properties: { id: { type: 'string' } },
        required: ['id'],
      },
    },
    {
      name: 'resolve_vent',
      description: 'Mark a vent as resolved or wontfix.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['resolved', 'wontfix'] },
        },
        required: ['id', 'status'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const cwd = process.cwd();
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  try {
    switch (req.params.name) {
      case 'vent': {
        const r = await handleVent({ message: String(args.message ?? ''), cwd, config });
        return { content: [{ type: 'text', text: `Vented: ${r.id}\nFile: ${r.path}` }] };
      }
      case 'list_vents': {
        const entries = handleList({
          cwd,
          config,
          status: (args.status as any) ?? 'open',
          limit: typeof args.limit === 'number' ? args.limit : undefined,
        });
        return { content: [{ type: 'text', text: JSON.stringify(entries, null, 2) }] };
      }
      case 'read_vent': {
        const r = handleRead({ cwd, config, id: String(args.id) });
        return {
          content: [
            { type: 'text', text: JSON.stringify(r.frontmatter, null, 2) },
            { type: 'text', text: r.body },
          ],
        };
      }
      case 'resolve_vent': {
        handleResolve({
          cwd,
          config,
          id: String(args.id),
          status: args.status as 'resolved' | 'wontfix',
        });
        return { content: [{ type: 'text', text: `Resolved: ${args.id} → ${args.status}` }] };
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/server.test.ts`
Expected: both tests PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests across all files PASS.

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/server.ts tests/server.test.ts
git commit -m "feat: MCP server entry — register vent/list/read/resolve over stdio"
```

---

## Task 9: Build the dist bundle

**Files:**
- Modify: `dist/vent-widget.js` (generated)

- [ ] **Step 1: Run the build**

Run: `npm run build`
Expected: "Built dist/vent-widget.js" message.

- [ ] **Step 2: Verify the bundle is executable**

Run: `chmod +x dist/vent-widget.js && head -1 dist/vent-widget.js`
Expected: `#!/usr/bin/env node`

- [ ] **Step 3: Sanity test the bundle**

Create a throwaway dir and run the bundle directly, feed it an MCP list-tools request, confirm it responds.

```bash
mkdir -p /tmp/vent-smoke && cd /tmp/vent-smoke
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node /Users/theunissencharles/github/vent-widget/dist/vent-widget.js
```

Expected: JSON response listing four tools (`vent`, `list_vents`, `read_vent`, `resolve_vent`). The process may stay open waiting for more input — kill with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add dist/vent-widget.js
git commit -m "build: bundle to dist/vent-widget.js"
```

---

## Task 10: examples/mcp.json + README

**Files:**
- Create: `examples/mcp.json`
- Create: `README.md`

- [ ] **Step 1: Create `examples/mcp.json`**

```json
{
  "mcpServers": {
    "vent": {
      "command": "npx",
      "args": ["-y", "vent-widget"],
      "env": {
        "VENT_COMMIT_MODE": "none",
        "VENT_AGENT_LABEL": "claude-code"
      }
    }
  }
}
```

- [ ] **Step 2: Create `README.md`**

```markdown
# vent-widget

A drop-in MCP server that lets AI coding agents (Claude Code, claude.ai chat, anything MCP-compatible) submit free-text frustrations as markdown files in your repo's `.vents/` directory.

Inspired by [Lovable's "vent tool"](https://lovable.dev/blog/we-gave-our-agent-a-vent-tool). Structurally modelled on [sticky-widget](../sticky-widget).

**Why:** agents constantly hit friction they can't fix and can't communicate. Give them a one-shot tool to dump frustration, capture it next to the code, triage it later (or wire up a triage agent).

---

## Install

Add to your MCP client's config — for Claude Code, edit `~/.claude/mcp.json`:

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

For claude.ai chat, register the same command as a custom MCP server.

That's it. The next time an agent gets stuck and uses the `vent` tool, you'll find the markdown file in `<your-repo>/.vents/`.

---

## How it works

The agent calls one of these tools:

| Tool | Purpose |
|---|---|
| `vent` | Submit a free-text frustration. One arg: `message`. |
| `list_vents` | List vents in the current repo (filter by status, default `open`). |
| `read_vent` | Read one vent by id. |
| `resolve_vent` | Mark a vent `resolved` or `wontfix`. |

Each vent becomes a file like:

```
.vents/2026-05-21T14-32-15-a1b2.md
```

```markdown
---
id: a1b2c3d4-5e6f-7890-abcd-ef1234567890
vented_at: 2026-05-21T14:32:15Z
project: my-repo
cwd: /Users/me/code/my-repo
branch: feature/x
head_sha: 3f8a92c
agent: claude-code
status: open
tags: []
---
code--copy consistently fails for files with spaces in the name...
```

---

## Config

All env vars are optional.

| Var | Default | Purpose |
|---|---|---|
| `VENT_DIR` | `.vents` | Output dir (relative to cwd). |
| `VENT_COMMIT_MODE` | `none` | `none` / `stage` / `commit`. See below. |
| `VENT_MAX_BODY_LENGTH` | `5000` | Reject messages longer than this. |
| `VENT_AGENT_LABEL` | `claude-code` | Override the `agent:` field. |
| `VENT_PROJECT_NAME` | auto | Override the `project:` field (default = git toplevel basename). |
| `VENT_INSTRUCTIONS_PATH` | unset | Path to a markdown file appended to the `vent` tool description — customize the guidance/examples the agent sees. |

### Commit modes

- **`none`** — write the file and stop. The cleanest default; lets your normal commit flow pick it up.
- **`stage`** — write + `git add` the vent file. Survives `git reset --hard HEAD`.
- **`commit`** — write + `git add` + dedicated commit (`vent: <first line>`). Vents are durable across any non-destructive operation.

---

## Customizing the prompt

Want to tune what the agent vents about? Point `VENT_INSTRUCTIONS_PATH` at a markdown file. Its contents are appended to the `vent` tool description shown to the agent.

```markdown
# extra-vent-examples.md
**Good vents in this project:**
- "The `streaming_extract` agent timed out 3 times in a row when run against test-input-2.xlsx with sheets > 50."
- "The Jira MCP `pullRequestSubmission` transition fails when assigneeAccountId is set."

**Don't vent for:**
- Routine "tool not found" that I resolve by adjusting PATH.
```

---

## Develop

```bash
npm install
npm test
npm run build
```

The build produces a single bundled `dist/vent-widget.js` with a shebang — that's what `npx` runs.

---

## See also

- [SPEC.md](./SPEC.md) — the design doc this implementation follows.
- [Lovable blog post](https://lovable.dev/blog/we-gave-our-agent-a-vent-tool) — the original inspiration.
```

- [ ] **Step 3: Commit**

```bash
git add examples/mcp.json README.md
git commit -m "docs: README + drop-in mcp.json example"
```

---

## Task 11: Wire into local Claude Code config (smoke test)

**Files:**
- Modify: `~/.claude/mcp.json` (or wherever the user keeps their MCP config — confirm before editing)

- [ ] **Step 1: Confirm the user's MCP config location**

Run: `ls -la ~/.claude/mcp.json ~/.claude/settings.json 2>&1 | head -5`
Ask the user which file to add the `vent` server to (do NOT edit silently — this touches their global Claude Code setup).

- [ ] **Step 2: Add a local-path entry pointing at the built bundle**

For a local smoke test (before publishing to npm), use the absolute path rather than `npx`:

```json
{
  "mcpServers": {
    "vent": {
      "command": "node",
      "args": ["/Users/theunissencharles/github/vent-widget/dist/vent-widget.js"]
    }
  }
}
```

- [ ] **Step 3: Restart Claude Code**

The user restarts Claude Code and confirms in a new session that the `vent` tool appears in the available tool list.

- [ ] **Step 4: Trigger a vent**

In a Claude Code session, ask the model to submit a test vent. Confirm `.vents/<timestamp>-<id>.md` is created in the current repo with the expected front-matter.

- [ ] **Step 5: No commit needed for this task** — it only touches the user's MCP config.

---

## Self-Review Notes

- **Spec coverage:**
  - §3 shape (Node + TS + MCP SDK) → Task 1
  - §4 four tools → Tasks 6, 7, 8
  - §4.1 vent tool description → Task 8 (`VENT_DESCRIPTION_BASE`)
  - §5 file format (ISO-prefixed filename, YAML front-matter, all 9 fields) → Tasks 3, 6
  - §6 all six env vars → Task 2
  - §7 three commit modes → Task 5
  - §8 repo structure → Tasks 1, 6, 7, 8
  - §9 install path → Tasks 10, 11
  - §10 validation rules (required message, max length, dir creation, never fail on git error) → Tasks 5, 6
  - §11 error handling philosophy → Tasks 5, 6, 8
  - §14 testing strategy (unit + temp-repo integration + MCP wire test) → Tasks 2–8
- **Placeholder scan:** none found.
- **Type consistency:** `Config`, `VentFrontmatter`, `VentStatus`, `CommitMode`, `ListStatusFilter` all flow consistently across tasks. `handleVent`/`handleList`/`handleRead`/`handleResolve` signatures match between definition (Tasks 6, 7) and usage in server (Task 8).
