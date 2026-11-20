export type Mode = 'sim' | 'live';

export function ModeSwitch({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <nav className="mode-switch" aria-label="Data mode">
      <div className={`mode-track ${mode}`} role="radiogroup">
        <span className="mode-thumb" aria-hidden="true" />
        <button role="radio" aria-checked={mode === 'sim'} className={mode === 'sim' ? 'on' : ''} onClick={() => onChange('sim')}>
          <i className="mode-dot sim" />Simulation
        </button>
        <button role="radio" aria-checked={mode === 'live'} className={mode === 'live' ? 'on' : ''} onClick={() => onChange('live')}>
          <i className="mode-dot live" />Live data
        </button>
      </div>
    </nav>
  );
}
