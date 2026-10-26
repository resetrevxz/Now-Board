export function AmbientBackground({
  background = 'gradient',
  motion = true,
  reduceMotion = false,
}: {
  background?: 'gradient' | 'solid';
  motion?: boolean;
  reduceMotion?: boolean;
}) {
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
