import { BrandMark } from '../components/BrandMark';
import { Icon } from '../components/Icon';
import { Button } from '../components/ui';

export function LoadingScreen({ message = 'Opening your board…' }: { message?: string }) {
  return (
    <div className="state-screen" aria-busy="true" aria-live="polite">
      <div className="state-screen__brand">
        <span className="brand-mark">
          <BrandMark />
        </span>
        <span>Now Board</span>
      </div>
      <div className="loading-mark" aria-hidden="true">
        <span className="loading-mark__ring" />
        <span className="loading-mark__dot" />
      </div>
      <p className="state-screen__title">{message}</p>
      <p className="state-screen__detail">A calm place to land. No account, no cloud.</p>
      <div className="loading-skeleton" aria-hidden="true">
        <span className="loading-skeleton__title" />
        <span className="loading-skeleton__line" />
        <span className="loading-skeleton__line loading-skeleton__line--short" />
      </div>
    </div>
  );
}

export function ErrorScreen({
  message,
  dataDir,
  backupCount,
  canRestore,
  busy,
  onRetry,
  onRestore,
  onReset,
  onReveal,
}: {
  message: string;
  dataDir: string;
  backupCount: number;
  canRestore: boolean;
  busy: boolean;
  onRetry: () => void;
  onRestore: () => void;
  onReset: () => void;
  onReveal: () => void;
}) {
  return (
    <div className="state-screen state-screen--error">
      <div className="state-screen__brand">
        <span className="brand-mark">
          <BrandMark />
        </span>
        <span>Now Board</span>
      </div>
      <div className="error-mark" aria-hidden="true">
        <Icon name="shield" size={22} />
      </div>
      <h1 className="state-screen__title">The board could not open.</h1>
      <p className="state-screen__detail state-screen__detail--error" role="alert">
        {message}
      </p>
      {dataDir ? (
        <>
          <p className="state-screen__note">
            Your existing data has not been deleted. The board file lives here:
          </p>
          <div className="settings-path state-screen__path">{dataDir}</div>
        </>
      ) : null}
      <div className="state-screen__actions">
        <Button variant="accent" onClick={onRetry} disabled={busy}>
          Try again
        </Button>
        {canRestore ? (
          <Button variant="secondary" icon="reset" onClick={onRestore} disabled={busy}>
            {busy ? 'Restoring…' : `Restore backup${backupCount > 1 ? ` (${backupCount})` : ''}`}
          </Button>
        ) : null}
        {dataDir ? (
          <Button variant="ghost" icon="folder" onClick={onReveal}>
            Show folder
          </Button>
        ) : null}
      </div>
      <button type="button" className="state-screen__reset" onClick={onReset} disabled={busy}>
        Start fresh instead…
      </button>
      <p className="state-screen__footnote">
        {canRestore
          ? 'Restoring uses the most recent daily backup. A copy of the current file is archived first.'
          : 'Nothing is sent anywhere. You can inspect the file yourself before deciding.'}
      </p>
    </div>
  );
}

export function PanicScreen({ onExit }: { onExit: () => void }) {
  return (
    <div className="panic" role="dialog" aria-modal="true" aria-label="Privacy screen">
      <div className="panic__glow" aria-hidden="true" />
      <div className="panic__brand">
        <span className="brand-mark">
          <BrandMark />
        </span>
        <span>Now Board</span>
      </div>
      <div className="panic__frame">
        <span className="panic__eyebrow">Stepped away</span>
        <h1 className="panic__title">Be right back.</h1>
        <p className="panic__detail">
          The board is private until you return. Nothing on this screen reveals what you were
          working on.
        </p>
      </div>
      <div className="panic__footer">
        <span className="panic__hint">
          <span className="live-dot" aria-hidden="true" />
          Privacy screen
        </span>
        <button type="button" className="panic__exit" onClick={onExit}>
          <span>Return</span>
          <span className="panic__exit-key">Esc</span>
        </button>
      </div>
    </div>
  );
}
