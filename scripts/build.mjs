// Bundle unico di dist/index.js: nessuna dipendenza a runtime fuori dal file, nessun modulo nativo.
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'dist/index.js',
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'esm',
  minify: false,
  sourcemap: false,
  legalComments: 'eof',
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire as __createRequire } from 'node:module';\nconst require = __createRequire(import.meta.url);",
  },
  define: { __VERSION__: JSON.stringify(pkg.version) },
  logLevel: 'info',
});
