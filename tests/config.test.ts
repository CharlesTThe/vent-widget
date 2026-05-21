import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';

describe('loadConfig', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('VENT_')) delete process.env[k];
    }
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('returns defaults when no env vars set', () => {
    const cfg = loadConfig();
    expect(cfg.ventDir).toBe('.vents');
    expect(cfg.commitMode).toBe('none');
    expect(cfg.maxBodyLength).toBe(5000);
    expect(cfg.agentLabel).toBe('claude-code');
    expect(cfg.projectName).toBeUndefined();
    expect(cfg.instructionsPath).toBeUndefined();
  });

  it('reads VENT_DIR override', () => {
    process.env.VENT_DIR = '.frustrations';
    expect(loadConfig().ventDir).toBe('.frustrations');
  });

  it('accepts valid commit modes', () => {
    process.env.VENT_COMMIT_MODE = 'stage';
    expect(loadConfig().commitMode).toBe('stage');
    process.env.VENT_COMMIT_MODE = 'commit';
    expect(loadConfig().commitMode).toBe('commit');
  });

  it('rejects invalid commit mode', () => {
    process.env.VENT_COMMIT_MODE = 'banana';
    expect(() => loadConfig()).toThrow(/VENT_COMMIT_MODE/);
  });

  it('parses VENT_MAX_BODY_LENGTH as int', () => {
    process.env.VENT_MAX_BODY_LENGTH = '8000';
    expect(loadConfig().maxBodyLength).toBe(8000);
  });

  it('rejects non-numeric VENT_MAX_BODY_LENGTH', () => {
    process.env.VENT_MAX_BODY_LENGTH = 'abc';
    expect(() => loadConfig()).toThrow(/VENT_MAX_BODY_LENGTH/);
  });

  it('rejects absolute VENT_DIR', () => {
    process.env.VENT_DIR = '/tmp/vents';
    expect(() => loadConfig()).toThrow(/VENT_DIR/);
  });

  it('rejects VENT_DIR with ..', () => {
    process.env.VENT_DIR = '../escape';
    expect(() => loadConfig()).toThrow(/VENT_DIR/);
  });
});
