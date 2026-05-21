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

  // Defensive: UUIDv4 collision probability is vanishingly small but the spec
  // promises no silent overwrite, so we throw rather than clobber.
  if (existsSync(path)) {
    throw new Error(`vent file already exists at ${path}`);
  }

  writeFileSync(path, serializeVent(fm, trimmed));
  handleCommit({ mode: config.commitMode, cwd, file: path, summary: firstLine(trimmed) });

  return { id, path };
}
