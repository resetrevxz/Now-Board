import { getBridge } from '../lib/bridge';
import { Icon } from './Icon';

export function WindowControls({ maximized }: { maximized: boolean }) {
  const bridge = getBridge();
  if (!bridge) return null;
  return (
    <div className="window-controls no-drag">
      <button
        type="button"
        className="window-btn"
        aria-label="Minimize window"
        title="Minimize"
        onClick={() => void bridge.minimize()}
      >
        <Icon name="minimize" size={15} />
      </button>
      <button
        type="button"
        className="window-btn"
        aria-label={maximized ? 'Restore window' : 'Maximize window'}
        title={maximized ? 'Restore' : 'Maximize'}
        onClick={() => void bridge.toggleMaximize()}
      >
        <Icon name={maximized ? 'restore' : 'maximize'} size={14} />
      </button>
      <button
        type="button"
        className="window-btn window-btn--close"
        aria-label="Close Now Board"
        title="Close"
        onClick={() => void bridge.close()}
      >
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
