import type { TimelineModel } from '../state/types';
import { formatDuration } from '../state/time';
import { Icon } from './Icon';

export function Timeline({
  model,
  maxLegend = 4,
}: {
  model: TimelineModel;
  maxLegend?: number;
}) {
  const hasSegments = model.segments.length > 0;
  return (
    <section className="timeline" aria-label="Today's focus timeline">
      <div className="timeline__head">
        <span className="timeline__title">
          <Icon name="clock" size={12} />
          Today&apos;s rhythm
        </span>
        <span className="timeline__total">
          {hasSegments
            ? `${formatDuration(model.focusMs)} focused · ${formatDuration(model.totalTrackedMs)} tracked`
            : 'No time tracked yet'}
        </span>
      </div>
      <div className="timeline__bar" role="img" aria-label="Status segments across today">
        {hasSegments ? (
          model.segments.map((segment) => (
            <span
              key={segment.id}
              className="timeline__segment"
              style={{
                flexGrow: segment.durationMs,
                ['--segment-color' as string]: segment.color,
              }}
              title={`${segment.label} · ${formatDuration(segment.durationMs)}`}
            />
          ))
        ) : (
          <span className="timeline__empty-bar" />
        )}
      </div>
      {hasSegments ? (
        <div className="timeline__legend">
          {model.totals.slice(0, maxLegend).map((total) => (
            <span className="timeline__legend-item" key={`${total.label}-${total.color}`}>
              <span
                className="timeline__legend-dot"
                style={{ ['--segment-color' as string]: total.color }}
              />
              <span className="timeline__legend-label">{total.label}</span>
              <span className="timeline__legend-value">{formatDuration(total.durationMs)}</span>
            </span>
          ))}
          {model.totals.length > maxLegend ? (
            <span className="timeline__legend-more">+{model.totals.length - maxLegend} more</span>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
