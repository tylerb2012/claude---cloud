import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { DEFAULT_CONFIG, randomSeed, SimSession, type RuleState, type Trade } from '../engine';

/** Trades at least this big (as % of stake) pop a toast. */
const TOAST_MIN_PCT = 0.1;
const TOAST_MS = 2600;

const STATS_KEY = 'mvd.sessionStats.v1';

export interface SessionStats {
  completed: number;
  belowStart: number;
}

function loadStats(): SessionStats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (raw) return JSON.parse(raw) as SessionStats;
  } catch {
    /* storage unavailable: start fresh */
  }
  return { completed: 0, belowStart: 0 };
}

function saveStats(s: SessionStats) {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/** Seed priority: ?seed= in the URL, then VITE_SIM_SEED, then config.seed, else random. */
function fixedSeed(): number | null {
  const fromUrl = new URLSearchParams(location.search).get('seed');
  if (fromUrl && !Number.isNaN(Number(fromUrl))) return Number(fromUrl);
  const fromEnv = import.meta.env.VITE_SIM_SEED;
  if (fromEnv && !Number.isNaN(Number(fromEnv))) return Number(fromEnv);
  return DEFAULT_CONFIG.seed;
}

export function useSimulation() {
  const cfg = DEFAULT_CONFIG;
  const [rules, setRules] = useState<RuleState>({
    takeProfitEnabled: cfg.takeProfitEnabled,
    stopLossEnabled: cfg.stopLossEnabled,
    chartRules: cfg.chartRulesEnabled,
  });
  const sessionRef = useRef<SimSession>(new SimSession(cfg, fixedSeed() ?? randomSeed(), rules));
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(cfg.speeds[0]);
  const [stats, setStats] = useState<SessionStats>(loadStats);
  const [, rerender] = useReducer((x: number) => x + 1, 0);
  const countedRef = useRef(false);
  const [toast, setToast] = useState<Trade | null>(null);
  const toastAtRef = useRef(0);
  const [recapOpen, setRecapOpen] = useState(false);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(id);
  }, [toast]);

  useEffect(() => {
    if (!running) return;
    let last = performance.now();
    const msPerRealMs = cfg.sessionSimMs / (cfg.realSecondsPerSessionAt1x * 1000);
    const id = window.setInterval(() => {
      const now = performance.now();
      const s = sessionRef.current;
      const closed = s.advanceTo(s.simTimeMs + (now - last) * speed * msPerRealMs);
      last = now;
      const big = closed.filter((t) => Math.abs(t.pnlPct) >= TOAST_MIN_PCT).sort((a, b) => Math.abs(b.pnl) - Math.abs(a.pnl))[0];
      if (big && now - toastAtRef.current > TOAST_MS) {
        toastAtRef.current = now;
        setToast(big);
      }
      rerender(); // the clock moves even when no trade closed
      if (s.done) {
        setRunning(false);
        if (!countedRef.current) {
          setRecapOpen(true);
          countedRef.current = true;
          setStats((prev) => {
            const next = {
              completed: prev.completed + 1,
              belowStart: prev.belowStart + (s.total < s.startingBalance ? 1 : 0),
            };
            saveStats(next);
            return next;
          });
        }
      }
    }, 100);
    return () => window.clearInterval(id);
  }, [running, speed, cfg]);

  const toggleRule = useCallback((key: keyof RuleState) => {
    setRules((r) => {
      const next = { ...r, [key]: !r[key] };
      sessionRef.current.rules = next; // applies to trades from now on
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setRunning(false);
    setRecapOpen(false);
    setToast(null);
    countedRef.current = false;
    sessionRef.current = new SimSession(cfg, fixedSeed() ?? randomSeed(), rules);
    rerender();
  }, [cfg, rules]);

  const startPause = useCallback(() => {
    if (sessionRef.current.done) {
      countedRef.current = false;
      sessionRef.current = new SimSession(cfg, fixedSeed() ?? randomSeed(), rules);
      setRecapOpen(false);
    }
    setRunning((r) => !r);
  }, [cfg, rules]);

  const clearStats = useCallback(() => {
    const zero = { completed: 0, belowStart: 0 };
    saveStats(zero);
    setStats(zero);
  }, []);

  const again = useCallback(() => {
    countedRef.current = false;
    sessionRef.current = new SimSession(cfg, fixedSeed() ?? randomSeed(), rules);
    setRecapOpen(false);
    setRunning(true);
  }, [cfg, rules]);

  return {
    cfg, session: sessionRef.current, running, speed, setSpeed, rules, toggleRule, reset, startPause,
    stats, clearStats, toast, recapOpen, closeRecap: () => setRecapOpen(false), openRecap: () => setRecapOpen(true), again,
  };
}
