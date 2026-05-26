import { execFileSync } from 'node:child_process';
import { relative } from 'node:path';
import type { CommitMode } from './config.js';

const MAX_COMMIT_SUMMARY = 60;

export type CommitStatus = 'ok' | 'skipped' | 'failed';

export interface CommitArgs {
  mode: CommitMode;
  cwd: string;
  file: string;
  summary: string;
}

export interface CommitResult {
  status: CommitStatus;
  reason: string | null;
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

function errMessage(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const stderr = 'stderr' in err
    ? (err as Error & { stderr?: Buffer }).stderr?.toString().trim()
    : '';
  return stderr || err.message;
}

export function handleCommit({ mode, cwd, file, summary }: CommitArgs): CommitResult {
  if (mode === 'none') return { status: 'skipped', reason: 'commit mode is none' };
  if (!isGitRepo(cwd)) return { status: 'skipped', reason: 'cwd is not a git repo' };

  const rel = relative(cwd, file);
  try {
    switch (mode) {
      case 'stage':
        git(cwd, ['add', '--', rel]);
        return { status: 'ok', reason: null };
      case 'commit': {
        git(cwd, ['add', '--', rel]);
        const shortSummary = summary.slice(0, MAX_COMMIT_SUMMARY).trim() || 'new vent';
        git(cwd, ['commit', '-q', '-m', `vent: ${shortSummary}`, '--', rel]);
        return { status: 'ok', reason: null };
      }
      default: {
        const _exhaustive: never = mode;
        return _exhaustive;
      }
    }
  } catch (err) {
    const reason = errMessage(err);
    process.stderr.write(`[vent-widget] git ${mode} failed (vent file was saved): ${reason}\n`);
    return { status: 'failed', reason };
  }
}
