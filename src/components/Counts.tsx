import type { QueueCounts } from '../srs/scheduler';

export function Counts({ counts }: { counts?: QueueCounts }) {
  return (
    <span className="counts" aria-label="Новые / Изучаемые / К повторению">
      <span className="count-new" title="Новые">
        {counts?.new ?? '·'}
      </span>
      <span className="count-learn" title="Изучаемые">
        {counts?.learn ?? '·'}
      </span>
      <span className="count-due" title="К повторению">
        {counts?.due ?? '·'}
      </span>
    </span>
  );
}
