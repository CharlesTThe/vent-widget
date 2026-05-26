import { describe, it, expect, beforeEach, vi } from 'vitest';
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

  it('logs to stderr when git binary is unavailable', async () => {
    // Re-import the module so its `gitMissingLogged` once-flag is reset.
    vi.resetModules();
    const { detectGitMetadata: detectFresh } = await import('../src/enrichment.js');

    const writeSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const originalPath = process.env.PATH;
    process.env.PATH = '';

    try {
      const dir = mkdtempSync(join(tmpdir(), 'vent-nogit-bin-'));
      const meta = detectFresh(dir);
      expect(meta.branch).toBeNull();
      expect(meta.head_sha).toBeNull();
      const logged = writeSpy.mock.calls.map((c) => String(c[0])).join('');
      expect(logged).toMatch(/git binary not found/i);
    } finally {
      process.env.PATH = originalPath;
      writeSpy.mockRestore();
    }
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
