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

  it('reports ok status on successful commit', () => {
    const dir = makeRepo();
    const file = writeVent(dir, 'ok.md', 'hi\n');
    const result = handleCommit({ mode: 'commit', cwd: dir, file, summary: 'test ok' });
    expect(result.status).toBe('ok');
    expect(result.reason).toBeNull();
  });

  it('reports skipped status when mode=none', () => {
    const dir = makeRepo();
    const file = writeVent(dir, 'skip.md', 'hi\n');
    const result = handleCommit({ mode: 'none', cwd: dir, file, summary: 'x' });
    expect(result.status).toBe('skipped');
  });

  it('reports skipped status when not a git repo', () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-nogit-skip-'));
    const file = writeVent(dir, 'skip.md', 'hi\n');
    const result = handleCommit({ mode: 'commit', cwd: dir, file, summary: 'x' });
    expect(result.status).toBe('skipped');
  });

  it('reports failed status when git index is locked', () => {
    const dir = makeRepo();
    const file = writeVent(dir, 'lock.md', 'hi\n');
    // Simulate a locked index — git refuses to add/commit
    writeFileSync(join(dir, '.git', 'index.lock'), '');

    const result = handleCommit({ mode: 'commit', cwd: dir, file, summary: 'test' });
    expect(result.status).toBe('failed');
    expect(result.reason).toMatch(/index\.lock|already exists|unable to/i);
  });
});
