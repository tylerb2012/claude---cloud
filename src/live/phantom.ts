/**
 * Phantom wallet, connection only. connect() gives us the public address and
 * nothing else. This app never calls signTransaction, signAllTransactions,
 * signAndSendTransaction or signMessage (a test enforces that).
 */

interface PhantomProvider {
  isPhantom?: boolean;
  connect(): Promise<{ publicKey: { toString(): string } }>;
  disconnect(): Promise<void>;
}

declare global {
  interface Window {
    phantom?: { solana?: PhantomProvider };
  }
}

export function getPhantom(): PhantomProvider | null {
  const p = typeof window !== 'undefined' ? window.phantom?.solana : undefined;
  return p?.isPhantom ? p : null;
}

export async function connectPhantom(): Promise<string> {
  const p = getPhantom();
  if (!p) throw new Error('Phantom not found in this browser.');
  const { publicKey } = await p.connect();
  return publicKey.toString();
}

export async function disconnectPhantom(): Promise<void> {
  await getPhantom()?.disconnect().catch(() => undefined);
}

/** On a phone without the extension: reopen this page inside the Phantom app's browser. */
export function phantomBrowseLink(): string {
  const url = encodeURIComponent(location.href);
  const ref = encodeURIComponent(location.origin);
  return `https://phantom.app/ul/browse/${url}?ref=${ref}`;
}
