/**
 * Runs many simulated sessions and prints aggregate results, to check the
 * simulation is not secretly generous.
 *
 *   npm run batch -- --runs 5000 --seed 1
 */
import { DEFAULT_CONFIG, makeConfig, SimSession, STRATEGIES, type StrategyId } from '../src/engine';

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

const runs = arg('runs', 1000);
const baseSeed = arg('seed', 1);
const cfg = DEFAULT_CONFIG;

const finals: number[] = [];
let trades = 0, wins = 0, rugs = 0, tp = 0, sl = 0, fees = 0;
for (let i = 0; i < runs; i++) {
  const s = new SimSession(cfg, baseSeed + i);
  s.runToEnd();
  finals.push(s.total);
  for (const t of s.trades) {
    trades++;
    if (t.pnl > 0) wins++;
    if (t.reason === 'rug') rugs++;
    if (t.reason === 'take-profit') tp++;
    if (t.reason === 'stop-loss') sl++;
    fees += t.fees;
  }
}
finals.sort((a, b) => a - b);
const avg = finals.reduce((a, b) => a + b, 0) / runs;
const below = finals.filter((f) => f < cfg.startingBalance).length;
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const usd = (x: number) => `$${x.toFixed(2)}`;

console.log(`Simulated sessions: ${runs} (seeds ${baseSeed}..${baseSeed + runs - 1})`);
console.log(`Starting balance:   ${usd(cfg.startingBalance)}`);
console.log(`Average final:      ${usd(avg)}  (${pct(avg / cfg.startingBalance - 1)})`);
console.log(`Median final:       ${usd(finals[Math.floor(runs / 2)])}`);
console.log(`Best / worst:       ${usd(finals[runs - 1])} / ${usd(finals[0])}`);
console.log(`Ended below start:  ${pct(below / runs)}  (${below} of ${runs})`);
console.log(`Trade win rate:     ${pct(wins / trades)}  (${trades} trades)`);
console.log(`Exit mix:           TP ${pct(tp / trades)}, SL ${pct(sl / trades)}, rug ${pct(rugs / trades)}, time ${pct((trades - tp - sl - rugs) / trades)}`);
console.log(`Avg fees/session:   ${usd(fees / runs)}`);
if (avg >= cfg.startingBalance) {
  console.log('\nWARNING: average result is not negative. Check the config: the simulation may be too generous.');
}

// ---- Chart techniques vs. buying blind -------------------------------------
// Per-trade results are the fair comparison: a technique that trades less will
// lose less per day without being any better at picking trades.
console.log('\nChart techniques (per trade, same seeds):');
const blindCfg = makeConfig({ chartRulesEnabled: false });
const per = new Map<string, { n: number; wins: number; pnlPct: number }>();
let blindFinal = 0;
for (let i = 0; i < runs; i++) {
  const b = new SimSession(blindCfg, baseSeed + i);
  b.runToEnd();
  blindFinal += b.total;
  for (const t of b.trades) add('blind', t.pnlPct);
  const c = new SimSession(cfg, baseSeed + i);
  c.runToEnd();
  for (const t of c.trades) add(t.strategy, t.pnlPct);
}
function add(k: string, p: number) {
  const r = per.get(k) ?? { n: 0, wins: 0, pnlPct: 0 };
  r.n++;
  r.pnlPct += p;
  if (p > 0) r.wins++;
  per.set(k, r);
}
for (const [k, r] of [...per.entries()].sort((a, b) => b[1].pnlPct / b[1].n - a[1].pnlPct / a[1].n)) {
  const label = STRATEGIES[k as StrategyId].label.padEnd(10);
  console.log(`  ${label} ${String(r.n).padStart(7)} trades   avg ${pct(r.pnlPct / r.n).padStart(6)} per trade   win ${pct(r.wins / r.n)}`);
}
console.log(`  Average final balance: chart rules ${usd(avg)} vs buying blind ${usd(blindFinal / runs)}`);
console.log('  Prices in this simulator are a random walk, so no technique can predict them. Differences come');
console.log('  from trading less often and holding for less time (fewer trades still open when a rug hits),');
console.log('  not from picking better trades. Every technique loses about the 2% round-trip fee per trade.');
