import YAML from 'yaml';

export type VentStatus = 'open' | 'resolved' | 'wontfix';

export interface VentFrontmatter {
  id: string;
  vented_at: string;
  project: string;
  cwd: string;
  branch: string | null;
  head_sha: string | null;
  agent: string;
  status: VentStatus;
  tags: string[];
}

const FENCE = '---';

export function serializeVent(fm: VentFrontmatter, body: string): string {
  const yamlText = YAML.stringify(fm).trimEnd();
  const trimmedBody = body.trim();
  return `${FENCE}\n${yamlText}\n${FENCE}\n${trimmedBody}\n`;
}

export interface ParsedVent {
  frontmatter: VentFrontmatter;
  body: string;
}

export function parseVent(text: string): ParsedVent {
  if (!text.startsWith(`${FENCE}\n`)) {
    throw new Error('Missing opening front-matter fence (---)');
  }
  const rest = text.slice(FENCE.length + 1);
  const closeIdx = rest.indexOf(`\n${FENCE}\n`);
  if (closeIdx === -1) {
    throw new Error('Missing closing front-matter fence (---)');
  }
  const yamlText = rest.slice(0, closeIdx);
  const body = rest.slice(closeIdx + FENCE.length + 2);
  const frontmatter = YAML.parse(yamlText) as VentFrontmatter;
  return { frontmatter, body };
}
