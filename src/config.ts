export type CommitMode = 'none' | 'stage' | 'commit';

export interface Config {
  ventDir: string;
  commitMode: CommitMode;
  maxBodyLength: number;
  agentLabel: string;
  projectName: string | undefined;
  instructionsPath: string | undefined;
}

const VALID_COMMIT_MODES: readonly CommitMode[] = ['none', 'stage', 'commit'];

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const commitModeRaw = env.VENT_COMMIT_MODE ?? 'none';
  if (!VALID_COMMIT_MODES.includes(commitModeRaw as CommitMode)) {
    throw new Error(
      `VENT_COMMIT_MODE must be one of ${VALID_COMMIT_MODES.join('|')}, got '${commitModeRaw}'`
    );
  }

  const maxBodyRaw = env.VENT_MAX_BODY_LENGTH ?? '5000';
  const maxBody = Number.parseInt(maxBodyRaw, 10);
  if (!Number.isFinite(maxBody) || maxBody <= 0) {
    throw new Error(`VENT_MAX_BODY_LENGTH must be a positive integer, got '${maxBodyRaw}'`);
  }

  const ventDir = env.VENT_DIR ?? '.vents';
  if (ventDir.startsWith('/') || ventDir.split('/').includes('..')) {
    throw new Error(
      `VENT_DIR must be a relative path inside cwd, got '${ventDir}'`
    );
  }

  return {
    ventDir,
    commitMode: commitModeRaw as CommitMode,
    maxBodyLength: maxBody,
    agentLabel: env.VENT_AGENT_LABEL ?? 'claude-code',
    projectName: env.VENT_PROJECT_NAME || undefined,
    instructionsPath: env.VENT_INSTRUCTIONS_PATH || undefined,
  };
}
