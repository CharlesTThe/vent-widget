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
