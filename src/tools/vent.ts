import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { v4 as uuidv4 } from 'uuid';
import type { Config } from '../config.js';
import { detectGitMetadata, detectProjectName } from '../enrichment.js';
import { serializeVent, type VentFrontmatter } from '../frontmatter.js';
import { handleCommit, type CommitStatus } from '../commit.js';

export interface VentArgs {
  message: string;
  cwd: string;
  config: Config;
}

export interface VentResult {
  id: string;
  path: string;
  fallback: boolean;
  fallbackReason: string | null;
  commitStatus: CommitStatus;
  commitReason: string | null;
}

function isoStamp(): { iso: string; filenameStamp: string } {
  const iso = new Date().toISOString();
  // 2026-05-21T14:32:15.123Z → 2026-05-21T14-32-15.123
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
  if (trimmed.length > config.maxBodyLength) {
    throw new Error(
      `vent message too long: ${trimmed.length} > ${config.maxBodyLength}`
    );
  }

  const id = uuidv4();
  const { iso, filenameStamp } = isoStamp();
  const filename = `${filenameStamp}-${id.slice(0, 4)}.md`;

  const primaryDir = join(cwd, config.ventDir);
  const primaryPath = join(primaryDir, filename);

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

  // Defensive: UUIDv4 collision probability is vanishingly small but the spec
  // promises no silent overwrite, so we throw rather than clobber.
  if (existsSync(primaryPath)) {
    throw new Error(`vent file already exists at ${primaryPath}`);
  }

  const serialized = serializeVent(fm, trimmed);

  let path = primaryPath;
  let fallback = false;
  let fallbackReason: string | null = null;

  try {
    if (!existsSync(primaryDir)) mkdirSync(primaryDir, { recursive: true });
    writeFileSync(primaryPath, serialized);
  } catch (err) {
    fallback = true;
    fallbackReason = err instanceof Error ? err.message : String(err);
    const fallbackDir = join(tmpdir(), 'vent-widget-fallback');
    if (!existsSync(fallbackDir)) mkdirSync(fallbackDir, { recursive: true });
    path = join(fallbackDir, filename);
    writeFileSync(path, serialized);
    process.stderr.write(
      `[vent-widget] could not write to ${primaryDir} (${fallbackReason}); ` +
      `vent saved to fallback: ${path}\n`
    );
  }

  const commit = handleCommit({ mode: config.commitMode, cwd, file: path, summary: firstLine(trimmed) });

  return { id, path, fallback, fallbackReason, commitStatus: commit.status, commitReason: commit.reason };
}
