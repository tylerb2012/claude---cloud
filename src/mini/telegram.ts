/**
 * Telegram Mini App glue. Everything is optional: outside Telegram (a normal
 * browser or the shared page) window.Telegram is missing and these calls do nothing.
 * Uses only display features: theme, height, back button, haptics and the user's
 * first name. No payments, no wallet, no bot token.
 */

interface TgBackButton {
  show(): void;
  hide(): void;
  onClick(cb: () => void): void;
  offClick(cb: () => void): void;
}

interface TgWebApp {
  ready(): void;
  expand(): void;
  colorScheme?: 'light' | 'dark';
  themeParams?: { bg_color?: string; secondary_bg_color?: string };
  initDataUnsafe?: { user?: { first_name?: string; last_name?: string } };
  setHeaderColor?(color: string): void;
  setBackgroundColor?(color: string): void;
  disableVerticalSwipes?(): void;
  onEvent?(event: 'themeChanged', cb: () => void): void;
  BackButton?: TgBackButton;
  HapticFeedback?: {
    impactOccurred(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(type: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TgWebApp };
  }
}

export function tg(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  const w = window.Telegram?.WebApp;
  // the SDK defines WebApp even in a normal browser; only treat it as Telegram when it has launch data
  return w && (w.initDataUnsafe?.user || w.colorScheme) ? w : null;
}

export const inTelegram = () => tg() !== null;

/** Call once on start: tells Telegram the app is ready, fills the screen and follows Telegram's theme. */
export function initTelegram(): void {
  const w = tg();
  if (!w) return;
  w.ready();
  w.expand();
  w.disableVerticalSwipes?.(); // so scrolling the coin list doesn't close the app
  const apply = () => {
    document.documentElement.dataset.theme = w.colorScheme === 'light' ? 'light' : 'dark';
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
    if (bg) {
      w.setHeaderColor?.(bg);
      w.setBackgroundColor?.(bg);
    }
  };
  apply();
  w.onEvent?.('themeChanged', apply);
}

export function telegramFirstName(): string | null {
  return tg()?.initDataUnsafe?.user?.first_name ?? null;
}

export function haptic(kind: 'tap' | 'select' | 'success' | 'error'): void {
  const h = tg()?.HapticFeedback;
  if (!h) return;
  if (kind === 'tap') h.impactOccurred('light');
  else if (kind === 'select') h.selectionChanged();
  else h.notificationOccurred(kind);
}

/** Shows Telegram's back button while `active`, calling onBack when it's tapped. Returns a cleanup function. */
export function bindBackButton(active: boolean, onBack: () => void): () => void {
  const b = tg()?.BackButton;
  if (!b || !active) return () => undefined;
  b.onClick(onBack);
  b.show();
  return () => {
    b.offClick(onBack);
    b.hide();
  };
}
