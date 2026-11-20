import { useCallback, useEffect, useState } from 'react';
import { connectPhantom, disconnectPhantom, getPhantom, phantomBrowseLink } from '../live/phantom';
import { DEFAULT_RPC, isValidAddress, KNOWN_MINTS, loadWallet, type WalletSnapshot } from '../live/solana';
import { AddFunds } from './components/AddFunds';
import { usd } from './format';

const RPC_URL = (import.meta.env.VITE_SOLANA_RPC_URL as string | undefined) || DEFAULT_RPC;
const WALLET_KEY = 'mvd.wallet.v1';
const REFRESH_MS = 60_000;

type Source = 'phantom' | 'watch';
interface Saved {
  address: string;
  source: Source;
}

function loadSaved(): Saved | null {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    return raw ? (JSON.parse(raw) as Saved) : null;
  } catch {
    return null;
  }
}
function save(v: Saved | null) {
  try {
    if (v) localStorage.setItem(WALLET_KEY, JSON.stringify(v));
    else localStorage.removeItem(WALLET_KEY);
  } catch {
    /* ignore */
  }
}

function tokenUsd(mint: string, amount: number, prices: Record<string, number>): string {
  const id = KNOWN_MINTS[mint]?.coingeckoId;
  return id && prices[id] !== undefined ? usd(amount * prices[id]) : 'unpriced';
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const fmtAmt = (n: number) => n.toLocaleString('en-US', { maximumFractionDigits: n < 1 ? 6 : 4 });
const ago = (t: number | null) => {
  if (!t) return 'pending';
  const s = Math.max(0, Date.now() / 1000 - t);
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};

export function LiveView({ active }: { active: boolean }) {
  const [wallet, setWallet] = useState<Saved | null>(loadSaved);
  const [snap, setSnap] = useState<WalletSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [funds, setFunds] = useState(false);
  const hasPhantom = getPhantom() !== null;

  const refresh = useCallback(async (address: string) => {
    setLoading(true);
    setError(null);
    try {
      setSnap(await loadWallet(RPC_URL, address));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!active || !wallet) return;
    refresh(wallet.address);
    const id = window.setInterval(() => refresh(wallet.address), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [active, wallet, refresh]);

  const use = (v: Saved) => {
    save(v);
    setSnap(null);
    setWallet(v);
  };

  const onPhantom = async () => {
    setError(null);
    try {
      use({ address: await connectPhantom(), source: 'phantom' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Phantom connection was cancelled.');
    }
  };

  const onWatch = () => {
    const a = input.trim();
    if (!isValidAddress(a)) {
      setError("That doesn't look like a Solana address.");
      return;
    }
    use({ address: a, source: 'watch' });
  };

  const onDisconnect = async () => {
    if (wallet?.source === 'phantom') await disconnectPhantom();
    save(null);
    setWallet(null);
    setSnap(null);
  };

  if (!wallet) {
    return (
      <main>
        <section className="card connect">
          <h2 className="section-title">Connect a wallet, read-only</h2>
          <p className="tiny muted">
            The dashboard only reads your public address and balances. It never asks to sign anything, so it can't move,
            trade or withdraw funds.
          </p>
          {hasPhantom ? (
            <button className="btn primary wide" onClick={onPhantom}>Connect Phantom</button>
          ) : (
            <a className="btn primary wide link-btn" href={phantomBrowseLink()}>Open in the Phantom app</a>
          )}
          <div className="or tiny muted">or watch any public address</div>
          <div className="watch-row">
            <input className="input mono" placeholder="Solana address" value={input} spellCheck={false}
              autoCapitalize="off" autoCorrect="off" onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onWatch()} aria-label="Solana address" />
            <button className="btn" onClick={onWatch}>Watch</button>
          </div>
          {error && <p className="error tiny">{error}</p>}
        </section>
        <LiveFooter />
      </main>
    );
  }

  return (
    <main>
      <section className="hero" aria-label="Wallet balance">
        <p className="mono tiny muted">
          {wallet.source === 'phantom' ? 'phantom' : 'watch-only'} · {short(wallet.address)} · solana mainnet
        </p>
        <div className="live-hero">
          <span className="big mono">
            {snap?.pricedUsd != null ? usd(snap.pricedUsd) : snap ? `${fmtAmt(snap.sol)} SOL` : '—'}
          </span>
          <button className="btn icon" onClick={() => refresh(wallet.address)} disabled={loading} aria-label="Refresh" title="Refresh">
            {loading ? '…' : '↻'}
          </button>
        </div>
        {snap && (
          <p className="mono tiny muted">
            {fmtAmt(snap.sol)} SOL
            {snap.prices.solana !== undefined && ` @ ${usd(snap.prices.solana)}`} · updated {new Date(snap.fetchedAt).toLocaleTimeString()}
          </p>
        )}
        {snap && snap.pricedUsd === null && <p className="warn tiny">Prices are unavailable, so no dollar total is shown.</p>}
        {snap && snap.unpricedTokens > 0 && (
          <p className="tiny muted">
            {snap.unpricedTokens} token{snap.unpricedTokens > 1 ? 's' : ''} without a price {snap.unpricedTokens > 1 ? 'are' : 'is'} listed
            below but not counted in the total, so it may be lower than your real balance, never higher.
          </p>
        )}
        {error && <p className="error tiny">{error}</p>}
      </section>

      <div className="live-actions">
        <button className="btn primary" onClick={() => setFunds(true)}>＋ Add funds</button>
        <button className="btn" onClick={onDisconnect}>Disconnect</button>
      </div>

      <section className="card">
        <h2 className="section-title">Holdings</h2>
        {!snap ? (
          <p className="tiny muted mono">{loading ? 'loading…' : 'no data yet'}</p>
        ) : (
          <ul className="holdings mono">
            <li>
              <span>SOL</span>
              <span>{fmtAmt(snap.sol)}</span>
              <span className="muted">{snap.prices.solana !== undefined ? usd(snap.sol * snap.prices.solana) : 'unpriced'}</span>
            </li>
            {snap.tokens.map((t) => (
              <li key={t.mint}>
                <span title={t.mint}>{t.symbol ?? short(t.mint)}</span>
                <span>{fmtAmt(t.amount)}</span>
                <span className="muted">{tokenUsd(t.mint, t.amount, snap.prices)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card">
        <div className="tape-head">
          <h2 className="section-title">Recent activity</h2>
          <span className="mono tiny muted">on-chain</span>
        </div>
        {!snap || snap.activity.length === 0 ? (
          <p className="tiny muted mono">{snap ? 'no transactions found' : '—'}</p>
        ) : (
          <ol className="activity mono">
            {snap.activity.map((a) => (
              <li key={a.signature}>
                <span className="muted">{ago(a.blockTime)}</span>
                <a href={`https://solscan.io/tx/${a.signature}`} target="_blank" rel="noopener noreferrer">{short(a.signature)}</a>
                <span className={a.failed ? 'down' : 'up'}>{a.failed ? 'failed' : 'ok'}</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      <LiveFooter />
      {funds && <AddFunds address={wallet.address} onClose={() => setFunds(false)} />}
    </main>
  );
}

function LiveFooter() {
  return (
    <footer className="foot tiny muted">
      <p>
        <strong>Live data is real and read-only.</strong> Balances come straight from the Solana blockchain, and prices come
        from CoinGecko. The app only knows your public address: it has no permission to sign, so it cannot trade, send or
        withdraw. The bots don't trade here. They only run in Simulation.
      </p>
    </footer>
  );
}
