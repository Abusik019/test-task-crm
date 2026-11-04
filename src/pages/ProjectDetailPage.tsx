import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, Plus, User as UserIcon } from 'lucide-react';
import { supabase, type Profile, type Project, type TaskWithRelations } from '../lib/supabase';
import { StatusBadge } from '../components/StatusBadge';

export function ProjectDetailPage({ profile }: { profile: Profile }) {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [workers, setWorkers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadProjectData = async () => {
    if (!id) return;

    setLoading(true);

    const [projRes, tasksRes, workersRes] = await Promise.all([
      supabase.from('projects').select('*').eq('id', id).single(),
      supabase
        .from('tasks')
        .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, role)')
        .eq('project_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'worker').order('full_name'),
    ]);

    if (projRes.data) setProject(projRes.data as Project);
    if (tasksRes.data) setTasks(tasksRes.data as TaskWithRelations[]);
    if (workersRes.data) {
      const nextWorkers = workersRes.data as Profile[];
      setWorkers(nextWorkers);
      if (nextWorkers.length > 0 && (!assigneeId || !nextWorkers.some((worker) => worker.id === assigneeId))) {
        setAssigneeId(nextWorkers[0].id);
      }
    }
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;

    const runLoad = async () => {
      if (!id) return;
      setLoading(true);

      const [projRes, tasksRes, workersRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        supabase
          .from('tasks')
          .select('*, assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, role)')
          .eq('project_id', id)
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'worker').order('full_name'),
      ]);

      if (cancelled) return;

      if (projRes.data) setProject(projRes.data as Project);
      if (tasksRes.data) setTasks(tasksRes.data as TaskWithRelations[]);
      if (workersRes.data) {
        const nextWorkers = workersRes.data as Profile[];
        setWorkers(nextWorkers);
        if (nextWorkers.length > 0) {
          setAssigneeId((currentValue) => {
            if (currentValue && nextWorkers.some((worker) => worker.id === currentValue)) {
              return currentValue;
            }
            return nextWorkers[0].id;
          });
        }
      }
      setLoading(false);
    };

    void runLoad();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !assigneeId) return;
    setSubmitting(true);

    const { error } = await supabase.from('tasks').insert({
      title: title.trim(),
      description: description.trim(),
      project_id: id,
      assignee_id: assigneeId,
      author_id: profile.id,
      status: 'new',
    });

    setSubmitting(false);
    if (error) {
      alert(error.message);
    } else {
      setTitle('');
      setDescription('');
      setIsTaskModalOpen(false);
      void loadProjectData();
    }
  };
  if (loading) return <div className="text-sm text-slate-500">Загрузка карточки объекта...</div>;
  if (!project) return <div className="text-sm text-rose-600">Объект не найден или доступ закрыт.</div>;

  return (
    <div className="space-y-6">
      <div>
        <Link
          to="/projects"
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Назад к списку объектов
        </Link>

        <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">{project.name}</h1>
            <div className="flex items-center gap-1.5 text-sm text-slate-500">
              <MapPin className="w-4 h-4 text-slate-400" />
              <span>{project.address}</span>
            </div>
          </div>

          {profile.role === 'manager' && (
            <button
              onClick={() => setIsTaskModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              Поставить задачу
            </button>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold text-slate-900">
          Задачи по объекту ({tasks.length})
        </h2>

        {tasks.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500 text-sm">
            Задач пока нет
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-200">
            {tasks.map((task) => (
              <Link
                key={task.id}
                to={`/tasks/${task.id}`}
                className="p-4 hover:bg-slate-50 transition flex items-center justify-between gap-4 block"
              >
                <div className="space-y-1 min-w-0">
                  <div className="font-medium text-slate-900 truncate">{task.title}</div>
                  <div className="flex items-center gap-3 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                      <UserIcon className="w-3.5 h-3.5" />
                      {task.assignee?.full_name || 'Не назначен'}
                    </span>
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

      {isTaskModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900">Новая задача по объекту</h3>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Название задачи</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Например: Монтаж опалубки перекрытия"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Описание</label>
                <textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Подробности и требования к выполнению..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Исполнитель</label>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm bg-white"
                >
                  {workers.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.full_name} ({w.email})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsTaskModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg cursor-pointer"
                >
                  Создать задачу
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}