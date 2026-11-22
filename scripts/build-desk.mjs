// Inlines desk/engine.js into desk/ui.html to make one self-contained page.
// Usage: node scripts/build-desk.mjs [out.html]   (default: dist-desk/venue-desk.html)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const engine = readFileSync('desk/engine.js', 'utf8').replace(/^export /gm, '');
const ui = readFileSync('desk/ui.html', 'utf8');
if (!ui.includes('/*ENGINE*/')) throw new Error('placeholder missing');
const out = process.argv[2] ?? 'dist-desk/venue-desk.html';
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, ui.replace('/*ENGINE*/', () => engine));
console.log('wrote', out);
