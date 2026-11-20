import { Money } from './components/Money';
import { Sparkline } from './components/Sparkline';
import { TradeTape } from './components/TradeTape';
import { VenueCard } from './components/VenueCard';
import { signedPct, signedUsd, simClock, tone, usd } from './format';
import { useSimulation } from './useSimulation';

export function App() {
  const sim = useSimulation();
  const { cfg, session: s } = sim;
  const total = s.total;
  const pnl = total - s.startingBalance;
  const multiplier = total / s.startingBalance;
  const trades = s.tradeCount;
  const winRate = trades ? s.wins / trades : 0;
  const tape = s.trades.slice(-cfg.tapeLength).reverse();
  const progress = s.simTimeMs / cfg.sessionSimMs;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <span className="logo" aria-hidden="true">◆</span>
          <h1>Venue Dashboard</h1>
        </div>
        <span className="badge badge-sim" title="All numbers on this screen are simulated">Simulation</span>
      </header>

      <main>
        <section className="card balance" aria-label="Total simulated balance">
          <div className="balance-label">
            <span className="muted small">Simulated balance</span>
            <span className="badge badge-sim small-badge">Sim</span>
          </div>
          <Money value={total} className="big num" />
          <div className="balance-row">
            <span className={`num pnl ${tone(pnl)}`}>
              {signedUsd(pnl)} ({signedPct(pnl / s.startingBalance, 2)})
            </span>
            <span className={`chip num ${tone(multiplier - 1)}`} title="Balance divided by starting balance">
              {multiplier.toFixed(3)}×
            </span>
          </div>
          <div className="balance-row muted small">
            <span className="num">{trades} trades</span>
            <span className="num">{(winRate * 100).toFixed(0)}% win</span>
            <span className="num">Day clock {simClock(s.simTimeMs)}</span>
          </div>
          <Sparkline points={s.history} baseline={s.startingBalance} durationMs={cfg.sessionSimMs} />
          <div className="progress" role="progressbar" aria-label="Session progress"
            aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progress * 100}%` }} />
          </div>
        </section>

        <section className="card alloc" aria-label="Allocation by venue">
          <div className="alloc-bar">
            {s.venues.map((v, i) => (
              <span key={v.id} className={`accent-${cfg.venues[i].accent}`}
                style={{ flexGrow: total > 0 ? v.balance / total : 1 }} />
            ))}
          </div>
          <div className="alloc-legend">
            {s.venues.map((v, i) => (
              <span key={v.id} className="small">
                <i className={`dot accent-${cfg.venues[i].accent}`} />
                {cfg.venues[i].name} <span className="num">{total > 0 ? ((v.balance / total) * 100).toFixed(1) : '0.0'}%</span>
              </span>
            ))}
          </div>
        </section>

        <section className="card controls" aria-label="Simulation controls">
          <div className="control-row">
            <button className="btn primary" onClick={sim.startPause}>
              {sim.running ? 'Pause' : s.done ? 'New session' : s.tradeCount ? 'Resume' : 'Start'}
            </button>
            <div className="seg" role="group" aria-label="Speed">
              {cfg.speeds.map((sp) => (
                <button key={sp} className={`btn seg-btn ${sim.speed === sp ? 'on' : ''}`}
                  aria-pressed={sim.speed === sp} onClick={() => sim.setSpeed(sp)}>
                  {sp}×
                </button>
              ))}
            </div>
            <button className="btn" onClick={sim.reset}>Reset</button>
          </div>
          <div className="control-row toggles">
            <label className="toggle">
              <input type="checkbox" checked={sim.rules.takeProfitEnabled} onChange={() => sim.toggleRule('takeProfitEnabled')} />
              <span>Take-profit +{(cfg.takeProfitPct * 100).toFixed(0)}%</span>
            </label>
            <label className="toggle">
              <input type="checkbox" checked={sim.rules.stopLossEnabled} onChange={() => sim.toggleRule('stopLossEnabled')} />
              <span>Stop-loss −{(cfg.stopLossPct * 100).toFixed(0)}%</span>
            </label>
          </div>
        </section>

        {s.done && (
          <section className="card summary" aria-label="Session summary" aria-live="polite">
            <div className="balance-label">
              <h2 className="section-title">Session ended</h2>
              <span className="badge badge-sim small-badge">Simulation</span>
            </div>
            <div className="summary-grid">
              <div><span className="muted small">Final balance</span><Money value={total} className="num mid" /></div>
              <div><span className="muted small">Change</span>
                <span className={`num mid ${tone(pnl)}`}>{signedPct(pnl / s.startingBalance, 2)}</span></div>
            </div>
            <p className="small">
              <strong className="num">{sim.stats.belowStart}</strong> of <strong className="num">{sim.stats.completed}</strong> completed
              sessions on this device ended below the {usd(s.startingBalance)} start.{' '}
              <button className="linkish" onClick={sim.clearStats}>Clear count</button>
            </p>
          </section>
        )}

        <div className="venues">
          {cfg.venues.map((v, i) => (
            <VenueCard key={v.id} venue={v} state={s.venues[i]} />
          ))}
        </div>

        <TradeTape trades={tape} venues={cfg.venues} />
      </main>

      <footer className="foot small muted">
        <p>
          <strong>Everything on this screen is simulated.</strong> No account, wallet or exchange is connected, no market
          prices are used and no orders are placed. Prices are random paths generated in your browser: a fair random walk
          with an {Math.round(cfg.rugChance * 100)}% chance per trade of a rug pull, minus a {cfg.feeRate * 100}% fee on
          each buy and each sale. With these rules the expected result is a loss.
        </p>
        <p className="num">
          Seed {s.seed} · add <code>?seed={s.seed}</code> to the URL to replay this session.
        </p>
      </footer>
    </div>
  );
}
