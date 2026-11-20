/** Entry for the shareable paper-trader page: Simulation only, no wallet or network access. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { simClock } from './ui/format';
import { SimView } from './ui/SimView';
import { useSimulation } from './ui/useSimulation';
import './styles.css';

function PaperApp() {
  const sim = useSimulation();
  return (
    <div className="app">
      <header className="top">
        <span className="logo-tile" aria-hidden="true">◆</span>
        <h1>Venue Bot</h1>
        <span className="pill mono">paper</span>
        <span className="top-right">
          <span className="badge" title="Every number on this screen is simulated">Simulation</span>
          <span className="pill mono clock">{simClock(sim.session.simTimeMs)}</span>
        </span>
      </header>
      <SimView sim={sim} />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PaperApp />
  </StrictMode>,
);
