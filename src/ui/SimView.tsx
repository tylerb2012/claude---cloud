import type { Trade } from '../engine';
import { Chart } from './components/Chart';
import { Recap } from './components/Recap';
import { Toast } from './components/Toast';
import { TradeTape } from './components/TradeTape';
import { VenueCard } from './components/VenueCard';
import { elapsed, signedUsd, tone } from './format';
import type { useSimulation } from './useSimulation';

export function SimView({ sim }: { sim: ReturnType<typeof useSimulation> }) {
  const { cfg, session: s } = sim;
  const total = s.total;
  const pnl = total - s.startingBalance;
  const trades = s.tradeCount;
  const winRate = trades ? s.wins / trades : 0;
  const agentCount = cfg.venues.reduce((n, v) => n + v.agents.length, 0);
  const latest = s.trades.at(-1);
  const [whole, cents] = total.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).split('.');

  // last trade per venue and per agent, scanning backwards once
  const lastByVenue = new Map<string, Trade>();
  const lastByAgent = new Map<string, Trade>();
  for (let i = s.trades.length - 1; i >= 0 && lastByAgent.size < agentCount; i--) {
    const t = s.trades[i];
    if (!lastByVenue.has(t.venueId)) lastByVenue.set(t.venueId, t);
    const k = `${t.venueId}:${t.agentIndex}`;
    if (!lastByAgent.has(k)) lastByAgent.set(k, t);
  }
  const toastVenue = sim.toast ? cfg.venues.find((v) => v.id === sim.toast!.venueId) : undefined;

  return (
    <div>
      {sim.toast && toastVenue && <Toast trade={sim.toast} venue={toastVenue} />}


      <main>
        <section className="hero" aria-label="Total simulated balance">
          <p className="mono tiny muted">
            {cfg.venues.length} venues · {agentCount} agents · {elapsed(s.simTimeMs)} of 24h
          </p>
          <div className="hero-row">
            <div className="hero-left">
              <span className="big mono">${whole}<span className="cents">.{cents}</span></span>
              <span className="mono tiny muted">
                in ${s.startingBalance} · {trades} trades · {Math.round(winRate * 100)}% win
              </span>
            </div>
            <div className="hero-mid">
              <span className={`mono pnl ${tone(pnl)}`}>{signedUsd(pnl)}</span>
              <span className="chip mono" title="Balance divided by starting balance">{(total / s.startingBalance).toFixed(2)}×</span>
            </div>
            <div className="chart-box">
              <Chart points={s.history} venues={s.venues} accents={cfg.venues.map((v) => v.accent)} durationMs={cfg.sessionSimMs} />
            </div>
          </div>
        </section>

        <section className="alloc" aria-label="Allocation by venue">
          <div className="alloc-bar">
            {s.venues.map((v, i) => (
              <span key={v.id} className={`accent-${cfg.venues[i].accent}`} style={{ flexGrow: total > 0 ? v.balance / total : 1 }} />
            ))}
          </div>
          <div className="alloc-legend mono">
            {s.venues.map((v, i) => (
              <span key={v.id} className={`accent-${cfg.venues[i].accent}`}>
                <i className="dot" />
                {cfg.venues[i].name.toUpperCase()} {total > 0 ? Math.round((v.balance / total) * 100) : 0}%
              </span>
            ))}
          </div>
        </section>

        <section className="controls" aria-label="Simulation controls">
          <button className="btn primary" onClick={sim.startPause} aria-label={sim.running ? 'Pause' : 'Start'}>
            {sim.running ? '❚❚ Pause' : s.done ? '▶ New' : s.tradeCount ? '▶ Resume' : '▶ Start'}
          </button>
          <div className="seg" role="group" aria-label="Speed">
            {cfg.speeds.map((sp) => (
              <button key={sp} className={`seg-btn mono ${sim.speed === sp ? 'on' : ''}`} aria-pressed={sim.speed === sp}
                onClick={() => sim.setSpeed(sp)}>{sp}×</button>
            ))}
          </div>
          <button className="btn icon" onClick={sim.reset} aria-label="Reset" title="Reset">↺</button>
          <div className="rule-row">
            <button className={`rule mono ${sim.rules.takeProfitEnabled ? 'on' : ''}`} aria-pressed={sim.rules.takeProfitEnabled}
              onClick={() => sim.toggleRule('takeProfitEnabled')}>TP +{Math.round(cfg.takeProfitPct * 100)}%</button>
            <button className={`rule mono ${sim.rules.stopLossEnabled ? 'on' : ''}`} aria-pressed={sim.rules.stopLossEnabled}
              onClick={() => sim.toggleRule('stopLossEnabled')}>SL −{Math.round(cfg.stopLossPct * 100)}%</button>
            {s.done && !sim.recapOpen && <button className="rule mono on" onClick={sim.openRecap}>Recap</button>}
          </div>
        </section>

        {cfg.venues.map((v, i) => (
          <VenueCard key={v.id} venue={v} state={s.venues[i]} lastTrade={lastByVenue.get(v.id)}
            agentLastTrade={v.agents.map((_, ai) => lastByAgent.get(`${v.id}:${ai}`))} latestTradeId={latest?.id ?? null} />
        ))}

        <TradeTape trades={s.trades.slice(-cfg.tapeLength).reverse()} venues={cfg.venues} total={trades} agentCount={agentCount} />
      </main>

      <footer className="foot tiny muted">
        <p>
          <strong>Everything on this screen is simulated.</strong> No account, wallet or exchange is connected, no market
          prices are used and no orders are placed. Prices are random paths generated in your browser: a fair random walk
          with an {Math.round(cfg.rugChance * 100)}% chance per trade of a rug pull, minus a {cfg.feeRate * 100}% fee on
          each buy and each sale. With these rules the expected result is a loss. Agent percentages are each agent's
          simulated win rate, not a confidence score.
        </p>
        <p className="mono">seed {s.seed} · add ?seed={s.seed} to the URL to replay</p>
      </footer>

      {sim.recapOpen && s.done && (
        <Recap session={s} venues={cfg.venues} stats={sim.stats} onAgain={sim.again} onClose={sim.closeRecap} onClearStats={sim.clearStats} />
      )}
    </div>
  );
}
