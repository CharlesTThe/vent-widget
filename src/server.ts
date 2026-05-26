import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { loadConfig } from './config.js';
import { handleVent } from './tools/vent.js';

const config = loadConfig();

const VENT_DESCRIPTION_BASE = `Submit a free-text frustration when you are repeatedly blocked or have discovered a recurring friction. The message is written to a markdown file in this repo's ${config.ventDir}/ directory so the human (or a triage agent) can investigate later.

DO vent when:
- You've tried the same fix multiple times and the underlying tool/library/API keeps misbehaving.
- You've found a months-old bug, a missing capability, or a confusing error message that wasted significant time.
- A documented feature appears to not work as documented.

DO NOT vent for:
- A single failed attempt that you could retry.
- "I had to think for a moment."
- Routine errors you successfully recovered from.

Keep it to one vent per turn. Be specific: include the exact command, file, error message, or behaviour. Future-you (or another agent) will read this with no memory of the session.`;

function buildVentDescription(): string {
  if (!config.instructionsPath || !existsSync(config.instructionsPath)) {
    return VENT_DESCRIPTION_BASE;
  }
  const extra = readFileSync(config.instructionsPath, 'utf8').trim();
  return `${VENT_DESCRIPTION_BASE}\n\n---\n${extra}`;
}

const VENT_DESCRIPTION = buildVentDescription();

const server = new Server(
  { name: 'vent-widget', version: pkg.version },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: 'vent',
      description: VENT_DESCRIPTION,
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Free-text vent body.' },
        },
        required: ['message'],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const cwd = process.cwd();
  const args = (req.params.arguments ?? {}) as Record<string, unknown>;
  try {
    switch (req.params.name) {
      case 'vent': {
        const r = await handleVent({ message: String(args.message ?? ''), cwd, config });
        const lines = [`Vented: ${r.id}`, `File: ${r.path}`];
        if (r.fallback) {
          lines.push(`Note: primary vent dir was unwritable (${r.fallbackReason}). Saved to fallback path above.`);
        }
        if (r.commitStatus === 'failed') {
          lines.push(`Commit: failed — ${r.commitReason}. Vent file IS saved; only the git operation failed.`);
        } else if (r.commitStatus === 'ok') {
          lines.push(`Commit: ${config.commitMode === 'commit' ? 'committed' : 'staged'}`);
        }
        return { content: [{ type: 'text', text: lines.join('\n') }] };
      }
      default:
        return { content: [{ type: 'text', text: `Unknown tool: ${req.params.name}` }], isError: true };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: 'text', text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
