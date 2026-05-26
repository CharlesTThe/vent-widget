import { execFileSync } from 'node:child_process';
import { basename } from 'node:path';

export interface GitMetadata {
  branch: string | null;
  head_sha: string | null;
}

let gitMissingLogged = false;

function git(cwd: string, args: string[]): string | null {
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch (err) {
    // ENOENT = git binary not on PATH. Distinct from "not a git repo" (exit 128).
    // Log once per process so we don't spam stderr on every vent.
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      (err as { code?: string }).code === 'ENOENT' &&
      !gitMissingLogged
    ) {
      gitMissingLogged = true;
      process.stderr.write(
        '[vent-widget] git binary not found on PATH — vents will lack branch/sha metadata.\n'
      );
    }
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
