import { describe, it, expect } from 'vitest';
import { serializeVent, parseVent, type VentFrontmatter } from '../src/frontmatter.js';

const fm: VentFrontmatter = {
  id: 'a1b2c3d4-5e6f-7890-abcd-ef1234567890',
  vented_at: '2026-05-21T14:32:15Z',
  project: 'helix-m-sc-ai-advisory',
  cwd: '/Users/me/repos/helix',
  branch: 'feature/HMAA-241',
  head_sha: '3f8a92c',
  agent: 'claude-code',
  status: 'open',
  tags: [],
};

describe('serializeVent', () => {
  it('produces front-matter delimited by ---', () => {
    const out = serializeVent(fm, 'Body line one.\nBody line two.\n');
    expect(out.startsWith('---\n')).toBe(true);
    expect(out).toContain('id: a1b2c3d4-5e6f-7890-abcd-ef1234567890');
    expect(out).toContain('status: open');
    expect(out).toContain('Body line one.');
    expect(out.endsWith('\n')).toBe(true);
  });

  it('trims body but preserves internal newlines', () => {
    const out = serializeVent(fm, '   \n\nHello\n\nWorld\n\n  ');
    expect(out).toContain('\nHello\n\nWorld\n');
    expect(out).not.toMatch(/Hello.*\n\s*\n\s*$/);
  });
});

describe('parseVent', () => {
  it('round-trips serialize → parse', () => {
    const body = 'Multi-line\nbody with **markdown**.';
    const text = serializeVent(fm, body);
    const parsed = parseVent(text);
    expect(parsed.frontmatter).toEqual(fm);
    expect(parsed.body.trim()).toBe(body.trim());
  });

  it('throws on missing front-matter delimiters', () => {
    expect(() => parseVent('just a body, no fence')).toThrow(/front-matter/);
  });

  it('preserves null git fields', () => {
    const withNulls = { ...fm, branch: null, head_sha: null };
    const text = serializeVent(withNulls, 'body');
    const parsed = parseVent(text);
    expect(parsed.frontmatter.branch).toBeNull();
    expect(parsed.frontmatter.head_sha).toBeNull();
  });
});
