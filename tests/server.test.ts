import { describe, it, expect } from 'vitest';
import { mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SERVER_PATH = resolve(__dirname, '../src/server.ts');

async function startClient(cwd: string, extraEnv: Record<string, string> = {}) {
  const transport = new StdioClientTransport({
    command: 'tsx',
    args: [SERVER_PATH],
    cwd,
    env: { ...process.env, VENT_DIR: '.vents', ...extraEnv },
  });
  const client = new Client({ name: 'test', version: '0.0.0' }, { capabilities: {} });
  await client.connect(transport);
  return { client, transport };
}

describe('MCP server', () => {
  it('lists the vent tool', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-srv-'));
    const { client, transport } = await startClient(dir);
    try {
      const tools = await client.listTools();
      const names = tools.tools.map((t) => t.name);
      expect(names).toEqual(['vent']);
    } finally {
      await transport.close();
    }
  });

  it('calling vent tool writes a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-srvcall-'));
    const { client, transport } = await startClient(dir);
    try {
      const result = await client.callTool({
        name: 'vent',
        arguments: { message: 'thing broke' },
      });
      expect(result.isError).toBeFalsy();
      const files = readdirSync(join(dir, '.vents'));
      expect(files.length).toBe(1);
      expect(files[0]).toMatch(/\.md$/);
      const text = (result.content as Array<{ type: string; text: string }>)[0].text;
      expect(text).toMatch(/^Vented: [0-9a-f-]{36}\nFile: .+\.md$/);
    } finally {
      await transport.close();
    }
  });

  it('appends VENT_INSTRUCTIONS_PATH content to the vent tool description', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-instr-'));
    const instructionsFile = join(dir, 'extra.md');
    writeFileSync(instructionsFile, 'Project rule: always include the failing CLI command verbatim.');
    const { client, transport } = await startClient(dir, {
      VENT_INSTRUCTIONS_PATH: instructionsFile,
    });
    try {
      const tools = await client.listTools();
      const desc = tools.tools[0].description ?? '';
      expect(desc).toContain('Project rule: always include the failing CLI command verbatim.');
    } finally {
      await transport.close();
    }
  });

  it('falls back to base description when VENT_INSTRUCTIONS_PATH file is missing', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vent-instr-missing-'));
    const { client, transport } = await startClient(dir, {
      VENT_INSTRUCTIONS_PATH: join(dir, 'nonexistent.md'),
    });
    try {
      const tools = await client.listTools();
      const desc = tools.tools[0].description ?? '';
      expect(desc).toContain('DO vent when');  // base description marker
      expect(desc).not.toContain('---');  // no extras section appended
    } finally {
      await transport.close();
    }
  });
});
