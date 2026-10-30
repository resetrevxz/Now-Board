import { useEffect } from 'react';

export function AmbientBackground({
  background = 'gradient',
  motion = false,
  reduceMotion = false,
}: {
  background?: 'gradient' | 'solid';
  motion?: boolean;
  reduceMotion?: boolean;
}) {
  // Pause the drift while the window is hidden so an enabled ambient effect does
  // not keep the compositor working in the background.
  useEffect(() => {
    const root = document.documentElement;
    const sync = () => {
      root.dataset.pageHidden = document.hidden ? 'true' : 'false';
    };
    sync();
    document.addEventListener('visibilitychange', sync);
    return () => document.removeEventListener('visibilitychange', sync);
  }, []);

  return (
    <div
      className="ambient"
      data-ambient={motion && !reduceMotion ? 'on' : 'off'}
      data-background={background}
      aria-hidden="true"
    >
      <div className="ambient__wash" />
      <div className="ambient__orb ambient__orb--a" />
      <div className="ambient__orb ambient__orb--b" />
    </div>
  );
}
