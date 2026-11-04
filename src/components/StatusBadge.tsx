import { type TaskStatus, STATUS_LABELS, STATUS_BADGE_STYLES } from '../lib/supabase';

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${STATUS_BADGE_STYLES[status]}`}
    >
      {STATUS_LABELS[status]}
    </span>
  );
}