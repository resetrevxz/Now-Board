import { useEffect, useState } from 'react';
import type { PresentViewModel } from '../state/types';
import { PresentScreen } from '../components/PresentScreen';
import { BrandMark } from '../components/BrandMark';
import { Icon } from '../components/Icon';

function isSnapshot(value: unknown): value is PresentViewModel {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return Boolean(record.status && record.settings && record.timeline);
}

export function ShareApp() {
  const [view, setView] = useState<PresentViewModel | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);

  useEffect(() => {
    document.title = 'Now Board — Live';
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let controller: AbortController | null = null;

    const load = async () => {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch('/api/state', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (!response.ok) throw new Error(`The board did not answer (${response.status}).`);
        const payload: unknown = await response.json();
        if (!alive) return;
        if (isSnapshot(payload)) {
          setView(payload);
          setError(null);
        } else {
          setView(null);
          setError(null);
        }
      } catch (caught) {
        if (!alive) return;
        if (caught instanceof DOMException && caught.name === 'AbortError') return;
        setError(
          caught instanceof Error
            ? caught.message
            : 'The live board could not be reached.',
        );
      } finally {
        if (alive) timer = setTimeout(load, 12_000);
      }
    };

    void load();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      controller?.abort();
    };
  }, [attempts]);

  useEffect(() => {
    if (view) document.title = `${view.settings.boardName} — Live`;
  }, [view]);

  if (view) return <PresentScreen view={view} share />;

  return (
    <div className="share-wait">
      <div className="share-wait__brand">
        <span className="brand-mark">
          <BrandMark />
        </span>
        <span>Now Board</span>
      </div>
      <div className="share-wait__frame">
        <span className="share-wait__pulse" aria-hidden="true">
          <span />
        </span>
        <span className="eyebrow">Read-only share</span>
        <h1 className="share-wait__title">
          {error ? 'Waiting for the board.' : 'The board is quiet.'}
        </h1>
        <p className="share-wait__detail">
          {error
            ? error
            : 'Keep Now Board open on the desktop. This view refreshes as soon as the live board is published.'}
        </p>
        <div className="share-wait__hint">
          <Icon name="shield" size={13} />
          Private tasks, goals and notes never leave the desktop app.
        </div>
        <button
          type="button"
          className="btn btn--subtle btn--sm"
          onClick={() => setAttempts((value) => value + 1)}
        >
          <span className="btn__label">Refresh now</span>
        </button>
      </div>
      <p className="share-wait__foot">Local network only · No account · No telemetry</p>
    </div>
  );
}
