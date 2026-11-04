import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { supabase, type Profile, type TaskWithRelations } from '../lib/supabase';
import { StatusBadge } from '../components/StatusBadge';

export function MyTasksPage({ profile }: { profile: Profile }) {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadTasks = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('tasks')
        .select('*, project:projects(id, name, address)')
        .eq('assignee_id', profile.id)
        .order('created_at', { ascending: false });

      if (!cancelled) {
        setTasks((data ?? []) as TaskWithRelations[]);
        setLoading(false);
      }
    };

    void loadTasks();

    return () => {
      cancelled = true;
    };
  }, [profile.id]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Мои задачи</h1>
        <p className="text-sm text-slate-500">Все задачи, назначенные вам на строительных объектах</p>
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Загрузка ваших задач...</div>
      ) : tasks.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
          Вам пока не назначено ни одной задачи
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-200">
          {tasks.map((task) => (
            <Link
              key={task.id}
              to={`/tasks/${task.id}`}
              className="p-4 hover:bg-slate-50 transition flex items-center justify-between gap-4"
            >
              <div className="space-y-1 min-w-0">
                <div className="font-medium text-slate-900 truncate">{task.title}</div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <Building2 className="w-3.5 h-3.5 text-slate-400" />
                  <span>{task.project?.name}</span>
                  <span>•</span>
                  <span>{new Date(task.created_at).toLocaleDateString('ru-RU')}</span>
                </div>
              </div>
              <StatusBadge status={task.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}