import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase env vars: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type UserRole = 'manager' | 'worker';
export type TaskStatus = 'new' | 'in_progress' | 'in_review' | 'accepted' | 'needs_revision';

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
}

export interface Project {
  id: string;
  name: string;
  address: string;
  created_at: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  project_id: string;
  assignee_id: string;
  author_id: string;
  status: TaskStatus;
  created_at: string;
  project?: { id: string; name: string; address: string };
  assignee?: Profile;
  author?: Profile;
}

export interface TaskHistoryItem {
  id: string;
  task_id: string;
  changed_by: string;
  old_status: TaskStatus | null;
  new_status: TaskStatus;
  comment: string | null;
  created_at: string;
  actor?: Profile;
}

export type ProjectWithTasks = Project & {
  tasks: { id: string; status: TaskStatus }[];
};

export type TaskWithRelations = Task & {
  project?: Project;
  assignee?: Profile;
  author?: Profile;
};

export type TaskHistoryWithActor = TaskHistoryItem & {
  actor?: Profile;
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  new: 'Новая',
  in_progress: 'В работе',
  in_review: 'На проверке',
  accepted: 'Принята',
  needs_revision: 'На доработке',
};

export const STATUS_BADGE_STYLES: Record<TaskStatus, string> = {
  new: 'bg-slate-100 text-slate-700 border-slate-300',
  in_progress: 'bg-blue-50 text-blue-700 border-blue-200',
  in_review: 'bg-amber-50 text-amber-700 border-amber-200',
  accepted: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  needs_revision: 'bg-rose-50 text-rose-700 border-rose-200',
};

export function getAvailableTransitions(
  task: Task,
  currentUser: Profile
): { nextStatus: TaskStatus; label: string; requiresComment?: boolean; variant: 'primary' | 'success' | 'danger' }[] {
  const isAssignedWorker = task.assignee_id === currentUser.id;
  const isManager = currentUser.role === 'manager';

  if (task.status === 'new' && isAssignedWorker) {
    return [{ nextStatus: 'in_progress', label: 'Взять в работу', variant: 'primary' }];
  }
  if (task.status === 'in_progress' && isAssignedWorker) {
    return [{ nextStatus: 'in_review', label: 'Отправить на проверку', variant: 'primary' }];
  }
  if (task.status === 'needs_revision' && isAssignedWorker) {
    return [{ nextStatus: 'in_progress', label: 'Вернуть в работу', variant: 'primary' }];
  }
  if (task.status === 'in_review' && isManager) {
    return [
      { nextStatus: 'accepted', label: 'Принять задачу', variant: 'success' },
      { nextStatus: 'needs_revision', label: 'Вернуть на доработку', requiresComment: true, variant: 'danger' },
    ];
  }
  return [];
}