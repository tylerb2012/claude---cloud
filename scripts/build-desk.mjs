// Inlines desk/engine.js into desk/ui.html to make one self-contained page.
// Usage: node scripts/build-desk.mjs [out.html]   (default: dist-desk/venue-desk.html)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
const engine = readFileSync('desk/engine.js', 'utf8').replace(/^export /gm, '');
const ui = readFileSync('desk/ui.html', 'utf8');
if (!ui.includes('/*ENGINE*/')) throw new Error('placeholder missing');
const out = process.argv[2] ?? 'dist-desk/venue-desk.html';
mkdirSync(dirname(out), { recursive: true });
const page = ui.replace('/*ENGINE*/', () => engine);
writeFileSync(out, page);
console.log('wrote', out);
// a full HTML document for the deployed site (served at /desk.html next to /forward/results.json)
mkdirSync('public', { recursive: true });
writeFileSync('public/desk.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${page}\n</body>\n</html>\n`);
console.log('wrote public/desk.html');
