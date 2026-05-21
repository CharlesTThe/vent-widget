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
    switch (mode) {
      case 'stage':
        git(cwd, ['add', '--', rel]);
        return;
      case 'commit': {
        git(cwd, ['add', '--', rel]);
        const shortSummary = summary.slice(0, MAX_COMMIT_SUMMARY).trim() || 'new vent';
        git(cwd, ['commit', '-q', '-m', `vent: ${shortSummary}`, '--', rel]);
        return;
      }
      default: {
        const _exhaustive: never = mode;
        return _exhaustive;
      }
    }
  } catch (err) {
    // Best effort — never fail the vent because of a git operation,
    // but log stderr so misconfiguration (missing hooks, locked index) is debuggable.
    const stderr = err instanceof Error && 'stderr' in err
      ? (err as Error & { stderr?: Buffer }).stderr?.toString().trim()
      : '';
    if (stderr) {
      process.stderr.write(`[vent-widget] git operation failed (vent file was saved): ${stderr}\n`);
    }
  }
}
