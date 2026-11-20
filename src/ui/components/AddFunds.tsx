import { useState } from 'react';

const ONRAMP_TEMPLATE = import.meta.env.VITE_ONRAMP_URL_TEMPLATE as string | undefined;
const ONRAMP_NAME = (import.meta.env.VITE_ONRAMP_NAME as string | undefined) || 'card provider';

export function AddFunds({ address, onClose }: { address: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <section className="sheet" role="dialog" aria-modal="true" aria-label="Add funds" onClick={(e) => e.stopPropagation()}>
        <span className="sheet-handle" aria-hidden="true" />
        <h2 className="sheet-title">Add funds to your wallet</h2>
        <p className="tiny muted">
          Money goes straight into <strong>your own</strong> wallet. This app never holds, receives or moves funds, and it
          can't trade with them.
        </p>

        <div className="fund-option">
          <strong>Apple Pay in Phantom</strong>
          <ol className="tiny">
            <li>Open the Phantom app and tap <strong>Buy</strong>.</li>
            <li>Choose SOL or USDC and an amount.</li>
            <li>Pick a provider that offers Apple Pay and confirm.</li>
          </ol>
          <p className="tiny muted">Phantom's partners do the payment and identity checks. Fees vary by provider.</p>
        </div>

        {ONRAMP_TEMPLATE && (
          <a className="btn sheet-cta link-btn" target="_blank" rel="noopener noreferrer"
            href={ONRAMP_TEMPLATE.replace('{address}', encodeURIComponent(address))}>
            Continue to {ONRAMP_NAME}
          </a>
        )}

        <div className="fund-option">
          <strong>Send from an exchange or another wallet</strong>
          <p className="mono tiny addr-full">{address}</p>
          <button className="btn" onClick={copy}>{copied ? 'Copied ✓' : 'Copy my address'}</button>
          <p className="tiny muted">Solana network only. Sending other chains' coins here can lose them.</p>
        </div>

        <p className="warn tiny">
          Never send money to an address from a video, DM or "trading bot" promo. Bots that promise fast multiples are
          the most common crypto scam.
        </p>
        <button className="btn sheet-cta" onClick={onClose}>Done</button>
      </section>
    </div>
  );
}
