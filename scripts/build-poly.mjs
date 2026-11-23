// Inlines poly/engine.js and poly/api.js into poly/ui.html to make one self-contained page.
// Usage: node scripts/build-poly.mjs   (writes public/poly.html, served at /poly.html)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const strip = (f) => readFileSync(f, 'utf8').replace(/^import .*$/gm, '').replace(/^export /gm, '');
const ui = readFileSync('poly/ui.html', 'utf8');
if (!ui.includes('/*ENGINE*/') || !ui.includes('/*API*/')) throw new Error('placeholder missing');
const page = ui.replace('/*ENGINE*/', () => strip('poly/engine.js')).replace('/*API*/', () => strip('poly/api.js'));
mkdirSync('public', { recursive: true });
writeFileSync('public/poly.html', `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n</head>\n<body>\n${page}\n</body>\n</html>\n`);
console.log('wrote public/poly.html');
