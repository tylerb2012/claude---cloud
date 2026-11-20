import { useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { randomSeed } from '../engine';
import { SimView } from '../ui/SimView';
import { useSimulation } from '../ui/useSimulation';
import { Avatar, burstConfetti, compact, fmtPrice, money, pct, Rolling, signed, Spark, toneOf } from './bits';
import { BOT_STRATEGIES, makeBotConfig, RISKS, type BotStrategy, type Risk } from './botConfig';
import { changePct, CHAINS, createMarket, marketCap, tickMarket, type Chain, type Token } from './market';
import { loadWallet, saveWallet, touchStreak } from './store';
import { buy, newWallet, positionValue, sell, type PaperWallet } from './wallet';

type Tab = 'discover' | 'bot' | 'wallet' | 'profile';
const TICK_MS = 1200;

function useMarket() {
  const ref = useRef(createMarket(randomSeed()));
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  useEffect(() => {
    const id = window.setInterval(() => {
      tickMarket(ref.current);
      rerender();
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, []);
  return ref.current;
}

export function MiniApp() {
  const market = useMarket();
  const [tab, setTabState] = useState<Tab>('discover');
  const setTab = (t: Tab) => {
    setTabState(t);
    window.scrollTo(0, 0);
  };
  const [wallet, setWalletState] = useState<PaperWallet>(loadWallet);
  const [open, setOpen] = useState<number | null>(null);
  const [strategy, setStrategy] = useState<BotStrategy>('momentum');
  const [risk, setRisk] = useState<Risk>('balanced');
  const botCfg = useMemo(() => makeBotConfig(strategy, risk), [strategy, risk]);
  const sim = useSimulation(botCfg);
  const [streak] = useState(touchStreak);
  const [toast, setToast] = useState<string | null>(null);

  const setWallet = (w: PaperWallet) => {
    setWalletState(w);
    saveWallet(w);
  };
  const say = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast((t) => (t === msg ? null : t)), 2600);
  };

  const byId = new Map(market.tokens.map((t) => [t.id, t]));
  // a held token can be delisted after a rug; keep its last known price at ~0
  const priceOf = (id: number) => byId.get(id)?.price ?? 0;
  const holdings = wallet.positions.reduce((s, p) => s + positionValue(p, priceOf(p.tokenId)), 0);
  const total = wallet.cash + holdings;
  const token = open !== null ? byId.get(open) : undefined;

  const doBuy = (t: Token, usd: number) => {
    setWallet(buy(wallet, t.id, t.symbol, t.price, usd));
    say(`Paper-bought ${money(Math.min(usd, wallet.cash))} of $${t.symbol}`);
  };
  const doSell = (id: number) => {
    const t = byId.get(id);
    const { wallet: w, trade } = sell(wallet, id, priceOf(id), t?.rugged ?? true);
    setWallet(w);
    if (trade) {
      say(`Sold $${trade.symbol} ${signed(trade.pnl)} (${pct(trade.pnlPct)})`);
      if (trade.pnl > 0) burstConfetti();
    }
  };

  return (
    <div className="mini">
      <div className="aurora" aria-hidden="true" />
      <header className="mini-top">
        <span className="mark" aria-hidden="true">◆</span>
        <strong className="brand">Venue Bot</strong>
        <span className="paper-pill" title="Play money and simulated prices. Nothing here is real.">PAPER</span>
        <span className="me" aria-hidden="true">PT</span>
      </header>

      <main className="mini-main">
        {tab === 'discover' && (
          <Discover market={market.tokens} tick={market.tick} total={total} start={wallet.start} sim={sim}
            onOpen={setOpen} onBot={() => setTab('bot')} />
        )}
        {tab === 'bot' && (
          <BotTab strategy={strategy} risk={risk} onStrategy={setStrategy} onRisk={setRisk} sim={sim} />
        )}
        {tab === 'wallet' && (
          <WalletTab wallet={wallet} total={total} holdings={holdings} byId={byId} onOpen={setOpen} onSell={doSell}
            onDiscover={() => setTab('discover')}
            onTopUp={() => { setWallet({ ...wallet, cash: wallet.cash + 100, start: wallet.start + 100 }); say('Added $100 of play money'); }}
            onReset={() => { setWallet(newWallet()); say('Paper wallet reset to $98'); }} />
        )}
        {tab === 'profile' && <ProfileTab wallet={wallet} streak={streak} sim={sim} />}
      </main>

      {token && (
        <TokenSheet t={token} wallet={wallet} onClose={() => setOpen(null)} onBuy={(usd) => doBuy(token, usd)} onSell={() => doSell(token.id)} />
      )}
      {toast && <div className="mini-toast" role="status">{toast}</div>}

      <nav className="tabbar" aria-label="Sections">
        {(['discover', 'bot', 'wallet', 'profile'] as Tab[]).map((t) => (
          <button key={t} className={tab === t ? 'on' : ''} aria-current={tab === t ? 'page' : undefined} onClick={() => setTab(t)}>
            <TabIcon tab={t} />
            <span>{t[0].toUpperCase() + t.slice(1)}</span>
            {t === 'bot' && sim.running && <i className="live-dot" aria-label="bot running" />}
          </button>
        ))}
      </nav>
    </div>
  );
}

type Sim = ReturnType<typeof useSimulation>;

function Discover({ market, tick, total, start, sim, onOpen, onBot }: {
  market: Token[]; tick: number; total: number; start: number; sim: Sim; onOpen: (id: number) => void; onBot: () => void;
}) {
  const [chain, setChain] = useState<Chain | 'All'>('All');
  const [q, setQ] = useState('');
  const list = market
    .filter((t) => (chain === 'All' || t.chain === chain) && (!q || (t.symbol + t.name).toLowerCase().includes(q.toLowerCase())))
    .sort((a, b) => Number(a.rugged) - Number(b.rugged) || b.volume - a.volume);
  const change = total - start;
  return (
    <>
      <section className="glass hero-card">
        <span className="label">Paper portfolio</span>
        <Rolling value={total} className="hero-num" />
        <div className="row">
          <span className={`chip ${toneOf(change)}`}>{pct(change / start, 2)}</span>
          <span className="muted">{signed(change)} since start · play money</span>
        </div>
        <div className="row two">
          <button className="btn-white" onClick={() => document.getElementById('token-search')?.focus()}>＋ Buy</button>
          <button className="btn-glass" onClick={onBot}>Auto-trade</button>
        </div>
      </section>

      <button className="glass bot-row" onClick={() => { onBot(); if (!sim.running) sim.startPause(); }}>
        <span className="bot-ico" aria-hidden="true">🤖</span>
        <span className="bot-txt">
          <strong><i className={`dot ${sim.running ? 'on' : ''}`} />AUTOTRADER {sim.running ? 'ON' : 'OFF'}</strong>
          <span className="mono muted">{sim.running ? `${sim.session.tradeCount} trades · ${money(sim.session.total)}` : 'tap to start a paper session'}</span>
        </span>
        <span className="go">{sim.running ? 'VIEW' : 'START'} ›</span>
      </button>

      <label className="search glass">
        <span aria-hidden="true">⌕</span>
        <input id="token-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a token" aria-label="Search a token" />
      </label>

      <div className="section-head">
        <h2>Trending</h2>
        <span className="muted mono">simulated · all chains</span>
      </div>
      <div className="chips" role="group" aria-label="Chain">
        {(['All', ...CHAINS] as const).map((c) => (
          <button key={c} className={chain === c ? 'on' : ''} aria-pressed={chain === c} onClick={() => setChain(c)}>{c}</button>
        ))}
      </div>

      <div className="grid">
        {list.map((t) => {
          const ch = changePct(t);
          const last = t.history[t.history.length - 2] ?? t.price;
          const dir = t.price > last ? 'up' : t.price < last ? 'down' : '';
          return (
            <button key={t.id} className={`glass token ${t.rugged ? 'rugged' : ''}`} onClick={() => onOpen(t.id)}>
              {dir && <span key={tick} className={`tick-flash ${dir}`} aria-hidden="true" />}
              <div className="token-top">
                <Avatar t={t} />
                <div className="token-name">
                  <strong>{t.symbol}</strong>
                  <span className="muted">{t.chain}</span>
                </div>
                {t.rugged && <span className="rug-chip">RUG</span>}
              </div>
              <div className="token-price">
                <span className="mono">{fmtPrice(t.price)}</span>
                <span className={`mono ${toneOf(ch)}`}>{ch >= 0 ? '▲' : '▼'} {pct(Math.abs(ch)).slice(1)}</span>
              </div>
              <Spark values={t.history} />
              <div className="token-stats mono">
                <span>MC <b>{compact(marketCap(t))}</b></span>
                <span>LIQ <b>{compact(t.liquidity)}</b></span>
              </div>
            </button>
          );
        })}
      </div>
    </>
  );
}

function TokenSheet({ t, wallet, onClose, onBuy, onSell }: { t: Token; wallet: PaperWallet; onClose: () => void; onBuy: (usd: number) => void; onSell: () => void }) {
  const pos = wallet.positions.find((p) => p.tokenId === t.id);
  const value = pos ? positionValue(pos, t.price) : 0;
  const ch = changePct(t);
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet mini-sheet" role="dialog" aria-modal="true" aria-label={`$${t.symbol}`} onClick={(e) => e.stopPropagation()}>
        <span className="sheet-handle" aria-hidden="true" />
        <div className="token-top">
          <Avatar t={t} size={52} />
          <div className="token-name">
            <strong className="big-sym">${t.symbol}</strong>
            <span className="muted">{t.name} · {t.chain} · simulated</span>
          </div>
          <span className="paper-pill">PAPER</span>
        </div>
        <div className="sheet-price">
          <span className="mono">{fmtPrice(t.price)}</span>
          <span className={`mono ${toneOf(ch)}`}>{pct(ch)}</span>
        </div>
        <Spark values={t.history} w={340} h={120} className="big-spark" />
        <div className="stat-grid mono">
          <span>Market cap<b>{compact(marketCap(t))}</b></span>
          <span>Volume<b>{compact(t.volume)}</b></span>
          <span>Liquidity<b>{compact(t.liquidity)}</b></span>
          <span>Age<b>{t.age} ticks</b></span>
        </div>
        <div className={`flags ${t.flags.length ? 'bad' : 'good'}`}>
          <strong>{t.rugged ? '🚨 Rugged' : t.flags.length ? `⚠️ ${t.flags.length} red flag${t.flags.length > 1 ? 's' : ''}` : '✅ No red flags'}</strong>
          {t.flags.length > 0 && <ul>{t.flags.map((f) => <li key={f}>{f}</li>)}</ul>}
          <span className="muted tiny-txt">Tokens with more red flags rug more often in this simulator, as they tend to in real markets.</span>
        </div>
        {pos && (
          <div className="glass holding-box">
            <span>Your paper position</span>
            <strong className="mono">{money(value)} <span className={toneOf(value - pos.cost)}>{signed(value - pos.cost)}</span></strong>
            <button className="btn-glass" onClick={onSell}>Sell all</button>
          </div>
        )}
        <div className="amounts">
          {[5, 10, 25].map((a) => (
            <button key={a} className="btn-glass" disabled={wallet.cash < 0.01 || t.rugged} onClick={() => onBuy(a)}>{money(a).replace('.00', '')}</button>
          ))}
          <button className="btn-glass" disabled={wallet.cash < 0.01 || t.rugged} onClick={() => onBuy(wallet.cash)}>Max</button>
        </div>
        <p className="muted tiny-txt">Paper buy with play money ({money(wallet.cash)} available). 1% fee each way. No real coins or orders.</p>
        <button className="btn-white wide" onClick={onClose}>Close</button>
      </section>
    </div>
  );
}

function BotTab({ strategy, risk, onStrategy, onRisk, sim }: { strategy: BotStrategy; risk: Risk; onStrategy: (s: BotStrategy) => void; onRisk: (r: Risk) => void; sim: Sim }) {
  return (
    <>
      <h1 className="page-title">Autotrading</h1>
      <section className="glass intro">
        <strong>Let the bot work the paper market</strong>
        <p className="muted">Pick a strategy and a risk level, then start a session. Nine agents trade one simulated day across three venues. Every number is play money.</p>
      </section>
      <div className="section-head"><h2>Strategy</h2></div>
      <div className="strategies" role="radiogroup" aria-label="Strategy">
        {BOT_STRATEGIES.map((s, i) => (
          <button key={s.id} role="radio" aria-checked={strategy === s.id} className={`glass strat ${strategy === s.id ? 'on' : ''}`} onClick={() => onStrategy(s.id)}>
            <span className="strat-num">{s.icon}<small>{i + 1}</small></span>
            <span className="strat-txt"><strong>{s.name}</strong><span className="muted">{s.blurb}</span></span>
            <span className="radio" aria-hidden="true" />
          </button>
        ))}
      </div>
      <div className="section-head"><h2>Risk level</h2></div>
      <div className="seg-risk" role="radiogroup" aria-label="Risk level">
        {RISKS.map((r) => (
          <button key={r.id} role="radio" aria-checked={risk === r.id} className={risk === r.id ? `on ${r.id}` : ''} onClick={() => onRisk(r.id)}>
            {r.name}
            <small>{Math.round(r.positionSizePct * 100)}% size · SL −{Math.round(r.stopLossPct * 100)}%</small>
          </button>
        ))}
      </div>
      <p className="muted tiny-txt center">Changing strategy or risk starts a fresh session.</p>
      <div className="embedded-sim">
        <SimView sim={sim} />
      </div>
    </>
  );
}

function WalletTab({ wallet, total, holdings, byId, onOpen, onSell, onDiscover, onTopUp, onReset }: {
  wallet: PaperWallet; total: number; holdings: number; byId: Map<number, Token>; onOpen: (id: number) => void; onSell: (id: number) => void;
  onDiscover: () => void; onTopUp: () => void; onReset: () => void;
}) {
  const [confirmReset, setConfirmReset] = useState(false);
  const change = total - wallet.start;
  return (
    <>
      <h1 className="page-title">Wallet</h1>
      <section className="glass hero-card">
        <span className="label">Paper balance</span>
        <Rolling value={total} className="hero-num" />
        <div className="row">
          <span className={`chip ${toneOf(change)}`}>{signed(change)}</span>
          <span className="muted">{money(wallet.cash)} cash · {money(holdings)} in tokens</span>
        </div>
        <div className="actions4">
          <button onClick={onDiscover}><span>＋</span>Buy</button>
          <button onClick={onTopUp}><span>🎁</span>Play $100</button>
          <button onClick={() => wallet.positions.forEach((p) => onSell(p.tokenId))} disabled={!wallet.positions.length}><span>⇣</span>Sell all</button>
          <button onClick={() => (confirmReset ? (onReset(), setConfirmReset(false)) : setConfirmReset(true))}>
            <span>↺</span>{confirmReset ? 'Sure?' : 'Reset'}
          </button>
        </div>
      </section>

      <div className="section-head"><h2>Holdings</h2></div>
      {wallet.positions.length === 0 ? (
        <div className="empty glass">
          <span aria-hidden="true">📈</span>
          <strong>No holdings yet</strong>
          <span className="muted">Paper-buy a token from Discover. Your positions show up here.</span>
        </div>
      ) : (
        <ul className="list">
          {wallet.positions.map((p) => {
            const t = byId.get(p.tokenId);
            const v = positionValue(p, t?.price ?? 0);
            const rugged = !t || t.rugged;
            return (
              <li key={p.tokenId}>
                <button className={`glass hold ${rugged ? 'shake' : ''}`} onClick={() => t && onOpen(t.id)}>
                  <Avatar t={t ?? { emoji: '💀', hue: 0 }} size={38} />
                  <span className="hold-name"><strong>${p.symbol}</strong><span className="muted mono">cost {money(p.cost)}</span></span>
                  {rugged && <span className="rug-chip">RUG</span>}
                  <span className="hold-val mono"><strong>{money(v)}</strong><span className={toneOf(v - p.cost)}>{pct(v / p.cost - 1)}</span></span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="section-head"><h2>History</h2><span className="muted mono">{wallet.history.length} closed</span></div>
      {wallet.history.length === 0 ? (
        <p className="muted center">Closed trades appear here.</p>
      ) : (
        <ul className="list hist mono">
          {wallet.history.slice(0, 15).map((h) => (
            <li key={h.closedAt + h.symbol}>
              <span>${h.symbol}{h.rugged ? ' 💀' : ''}</span>
              <span className="muted">{money(h.cost)} → {money(h.proceeds)}</span>
              <span className={toneOf(h.pnl)}>{signed(h.pnl)}</span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function ProfileTab({ wallet, streak, sim }: { wallet: PaperWallet; streak: number; sim: Sim }) {
  const h = wallet.history;
  const wins = h.filter((x) => x.pnl > 0).length;
  const realized = h.reduce((s, x) => s + x.pnl, 0);
  const best = h.reduce((m, x) => Math.max(m, x.pnlPct), -1);
  const badges = [
    { icon: '🎯', name: 'First trade', got: h.length > 0 },
    { icon: '💚', name: 'First profit', got: wins > 0 },
    { icon: '💀', name: 'Survived a rug', got: h.some((x) => x.rugged) },
    { icon: '💯', name: '+100% club', got: best >= 1 },
    { icon: '✂️', name: 'Cut a loser early', got: h.some((x) => x.pnlPct < 0 && x.pnlPct > -0.1) },
    { icon: '🤖', name: '10 bot sessions', got: sim.stats.completed >= 10 },
    { icon: '🔥', name: '3-day streak', got: streak >= 3 },
    { icon: '🧘', name: '10 trades, still above start', got: h.length >= 10 && realized >= 0 },
  ];
  return (
    <>
      <section className="profile-head">
        <span className="me big" aria-hidden="true">PT</span>
        <div>
          <h1 className="page-title">Paper trader</h1>
          <span className="muted">🔥 {streak}-day streak · {badges.filter((b) => b.got).length}/{badges.length} badges</span>
        </div>
      </section>
      <div className="stat-tiles">
        <div className="glass"><span className="muted">Realized P&L</span><strong className={`mono ${toneOf(realized)}`}>{signed(realized)}</strong></div>
        <div className="glass"><span className="muted">Win rate</span><strong className="mono">{h.length ? Math.round((wins / h.length) * 100) : 0}%</strong></div>
        <div className="glass"><span className="muted">Bot sessions</span><strong className="mono">{sim.stats.completed}</strong></div>
        <div className="glass"><span className="muted">Ended below start</span><strong className="mono">{sim.stats.belowStart}/{sim.stats.completed}</strong></div>
      </div>
      <div className="section-head"><h2>Badges</h2></div>
      <div className="badges">
        {badges.map((b) => (
          <div key={b.name} className={`glass badge-tile ${b.got ? 'got' : ''}`}>
            <span aria-hidden="true">{b.icon}</span>
            <small>{b.name}</small>
          </div>
        ))}
      </div>
      <section className="glass safety">
        <strong>🛡️ Spot a scam bot</strong>
        <ul>
          <li>It makes a wallet for you and asks you to deposit to it: they hold the keys.</li>
          <li>It promises a bot that runs for days "hands-off" with no way to watch or stop it.</li>
          <li>It pays you for inviting friends who deposit.</li>
          <li>Withdrawals stall, or need an "unlock" fee.</li>
        </ul>
        <span className="muted">This app never asks for deposits, keys or invites. Everything here is play money.</span>
      </section>
    </>
  );
}

function TabIcon({ tab }: { tab: Tab }) {
  const p = { width: 24, height: 24, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (tab === 'discover') return <svg {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>;
  if (tab === 'bot') return <svg {...p}><rect x="4" y="8" width="16" height="12" rx="3" /><path d="M12 4v4M9 14h.01M15 14h.01" /></svg>;
  if (tab === 'wallet') return <svg {...p}><rect x="3" y="6" width="18" height="14" rx="3" /><path d="M16 13h.01M3 10h18" /></svg>;
  return <svg {...p}><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>;
}
