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
