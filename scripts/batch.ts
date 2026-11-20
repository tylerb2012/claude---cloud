/**
 * Runs many simulated sessions and prints aggregate results, to check the
 * simulation is not secretly generous.
 *
 *   npm run batch -- --runs 5000 --seed 1
 */
import { DEFAULT_CONFIG, SimSession } from '../src/engine';

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
