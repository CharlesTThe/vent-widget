import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/server.ts'],
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  outfile: 'dist/vent-widget.js',
  banner: { js: '#!/usr/bin/env node' },
  external: ['@modelcontextprotocol/sdk', 'uuid', 'yaml'],
});

console.log('Built dist/vent-widget.js');
