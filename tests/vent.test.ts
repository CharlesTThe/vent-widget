import { describe, it, expect } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
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

  it('creates a commit when commit mode is commit', async () => {
    const dir = makeRepo();
    const cfg = loadConfig({ VENT_COMMIT_MODE: 'commit' });
    await handleVent({
      message: 'the scheduler is broken again',
      cwd: dir,
      config: cfg,
    });
    const log = execSync('git log --oneline -1', { cwd: dir }).toString();
    expect(log).toMatch(/vent: the scheduler is broken again/);
  });

  it('falls back to os.tmpdir when ventDir is unwritable', async () => {
    const cwd = mkdtempSync(join(tmpdir(), 'vent-eacces-'));
    // Pre-create .vents as read-only so creating new files inside fails with EACCES
    mkdirSync(join(cwd, '.vents'));
    chmodSync(join(cwd, '.vents'), 0o500); // r-x: cannot create new files

    try {
      const result = await handleVent({
        message: 'cannot write here',
        cwd,
        config: loadConfig({}),
      });
      // Vent must NOT be lost — it lands in tmpdir as fallback
      expect(result.fallback).toBe(true);
      expect(result.path.startsWith(tmpdir())).toBe(true);
      expect(result.fallbackReason).toMatch(/EACCES|permission/i);
      expect(readFileSync(result.path, 'utf8')).toContain('cannot write here');
    } finally {
      chmodSync(join(cwd, '.vents'), 0o700); // restore so cleanup works
    }
  });
});
