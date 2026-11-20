/** Per-device save for the paper wallet and streak. Wrapped so a blocked storage just starts fresh. */
import { newWallet, type PaperWallet } from './wallet';

const WALLET_KEY = 'vb.mini.wallet.v1';
const STREAK_KEY = 'vb.mini.streak.v1';

export function loadWallet(): PaperWallet {
  try {
    const raw = localStorage.getItem(WALLET_KEY);
    if (raw) return JSON.parse(raw) as PaperWallet;
  } catch {
    /* fresh start */
  }
  return newWallet();
}

export function saveWallet(w: PaperWallet) {
  try {
    localStorage.setItem(WALLET_KEY, JSON.stringify(w));
  } catch {
    /* ignore */
  }
}

/** Days in a row the app was opened. Updates on call. */
export function touchStreak(): number {
  const today = new Date().toDateString();
  const yesterday = new Date(Date.now() - 86_400_000).toDateString();
  try {
    const s = JSON.parse(localStorage.getItem(STREAK_KEY) ?? 'null') as { day: string; count: number } | null;
    const next = !s ? { day: today, count: 1 } : s.day === today ? s : { day: today, count: s.day === yesterday ? s.count + 1 : 1 };
    localStorage.setItem(STREAK_KEY, JSON.stringify(next));
    return next.count;
  } catch {
    return 1;
  }
}
