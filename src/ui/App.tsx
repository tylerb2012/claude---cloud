import { useState } from 'react';
import { ModeSwitch, type Mode } from './components/ModeSwitch';
import { simClock } from './format';
import { LiveView } from './LiveView';
import { SimView } from './SimView';
import { useSimulation } from './useSimulation';

const MODE_KEY = 'mvd.mode.v1';

function loadMode(): Mode {
  try {
    return localStorage.getItem(MODE_KEY) === 'live' ? 'live' : 'sim';
  } catch {
    return 'sim';
  }
}

export function App() {
  const sim = useSimulation();
  const [mode, setModeState] = useState<Mode>(loadMode);
  const setMode = (m: Mode) => {
    setModeState(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      /* ignore */
    }
  };

  return (
    <div className="app">
      <header className="top">
        <span className="logo-tile" aria-hidden="true">◆</span>
        <h1>Venue Bot</h1>
        <span className="pill mono">{mode === 'sim' ? 'multi-venue' : 'read-only'}</span>
        <span className="top-right">
          {mode === 'sim' ? (
            <>
              <span className="badge" title="Every number on this screen is simulated">Simulation</span>
              <span className="pill mono clock">{simClock(sim.session.simTimeMs)}</span>
            </>
          ) : (
            <span className="badge badge-live" title="Real balances, read-only">Live data</span>
          )}
        </span>
      </header>

      {/* both views stay mounted so the simulation keeps its state when you switch */}
      <div hidden={mode !== 'sim'}><SimView sim={sim} /></div>
      <div hidden={mode !== 'live'}><LiveView active={mode === 'live'} /></div>

      <ModeSwitch mode={mode} onChange={setMode} />
    </div>
  );
}
