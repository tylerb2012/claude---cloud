// Assembles dist-paper/ into a single HTML page: React from cdnjs, everything else inline.
import { readFileSync, writeFileSync } from 'node:fs';
const js = readFileSync('dist-paper/paper.js', 'utf8').replace(/<\/script/gi, '<\\/script');
const css = readFileSync('dist-paper/paper.css', 'utf8');
const out = process.argv[2] ?? 'dist-paper/venue-bot-paper.html';
writeFileSync(out, `<title>Venue Bot Paper Trader</title>
<meta name="claude:viewport-fit-sides" content="cover">
<style>${css}</style>
<div id="root"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js"></script>
<script>${js}</script>
`);
console.log('wrote', out);
