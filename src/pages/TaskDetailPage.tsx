import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Clock,
  CheckCircle2,
  AlertCircle,
} from 'lucide-react';
import {
  supabase,
  type Profile,
  type TaskHistoryItem,
  type TaskStatus,
  type TaskWithRelations,
  getAvailableTransitions,
} from '../lib/supabase';
import { StatusBadge } from '../components/StatusBadge';

export function TaskDetailPage({ profile }: { profile: Profile }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [task, setTask] = useState<TaskWithRelations | null>(null);
  const [history, setHistory] = useState<TaskHistoryItem[]>([]);
  const [workers, setWorkers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);

  const [comment, setComment] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [submittingStatus, setSubmittingStatus] = useState(false);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editAssigneeId, setEditAssigneeId] = useState('');

  const loadTaskData = async () => {
    if (!id) return;

    setLoading(true);

    const [taskRes, histRes, workersRes] = await Promise.all([
      supabase
        .from('tasks')
        .select(
          `*,
          project:projects(id, name, address),
          assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, role),
          author:profiles!tasks_author_id_fkey(id, full_name, email, role)`
        )
        .eq('id', id)
        .single(),
      supabase
        .from('task_history')
        .select('*, actor:profiles!task_history_changed_by_fkey(id, full_name, email, role)')
        .eq('task_id', id)
        .order('created_at', { ascending: false }),
      supabase.from('profiles').select('*').eq('role', 'worker').order('full_name'),
    ]);

    if (taskRes.data) {
      const nextTask = taskRes.data as TaskWithRelations;
      setTask(nextTask);
      setEditTitle(nextTask.title);
      setEditDescription(nextTask.description || '');
      setEditAssigneeId(nextTask.assignee_id);
    }
    if (histRes.data) setHistory(histRes.data as TaskHistoryItem[]);
    if (workersRes.data) setWorkers(workersRes.data as Profile[]);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;

    const runLoad = async () => {
      if (!id) return;
      setLoading(true);

      const [taskRes, histRes, workersRes] = await Promise.all([
        supabase
          .from('tasks')
          .select(
            `*,
            project:projects(id, name, address),
            assignee:profiles!tasks_assignee_id_fkey(id, full_name, email, role),
            author:profiles!tasks_author_id_fkey(id, full_name, email, role)`
          )
          .eq('id', id)
          .single(),
        supabase
          .from('task_history')
          .select('*, actor:profiles!task_history_changed_by_fkey(id, full_name, email, role)')
          .eq('task_id', id)
          .order('created_at', { ascending: false }),
        supabase.from('profiles').select('*').eq('role', 'worker').order('full_name'),
      ]);

      if (cancelled) return;

      if (taskRes.data) {
        const nextTask = taskRes.data as TaskWithRelations;
        setTask(nextTask);
        setEditTitle(nextTask.title);
        setEditDescription(nextTask.description || '');
        setEditAssigneeId(nextTask.assignee_id);
      }
      if (histRes.data) setHistory(histRes.data as TaskHistoryItem[]);
      if (workersRes.data) setWorkers(workersRes.data as Profile[]);
      setLoading(false);
    };

    void runLoad();

    return () => {
      cancelled = true;
    };
  }, [id]);

  const handleStatusTransition = async (nextStatus: TaskStatus, requiresComment?: boolean) => {
    if (!task) return;
    setActionError(null);

    if (requiresComment && !comment.trim()) {
      setActionError('При возврате задачи на доработку необходимо указать комментарий');
      return;
    }

    setSubmittingStatus(true);
    const { error } = await supabase.rpc('change_task_status', {
      p_task_id: task.id,
      p_new_status: nextStatus,
      p_comment: comment.trim() || null,
    });

    setSubmittingStatus(false);
    if (error) {
      setActionError(error.message);
    } else {
      setComment('');
      void loadTaskData();
    }
  };
  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!task) return;

    const { error } = await supabase
      .from('tasks')
      .update({
        title: editTitle.trim(),
        description: editDescription.trim(),
        assignee_id: editAssigneeId,
      })
      .eq('id', task.id);

    if (error) {
      alert(error.message);
    } else {
      setIsEditModalOpen(false);
      void loadTaskData();
    }
  };

  const handleDeleteTask = async () => {
    if (!task || !confirm('Удалить эту задачу?')) return;
    const projectId = task.project_id;
    const { error } = await supabase.from('tasks').delete().eq('id', task.id);
    if (error) {
      alert(error.message);
    } else {
      navigate(`/projects/${projectId}`);
    }
  };

  if (loading) return <div className="text-sm text-slate-500">Загрузка карточки задачи...</div>;
  if (!task) return <div className="text-sm text-rose-600">Задача не найдена или у вас нет к ней доступа.</div>;

  const availableActions = getAvailableTransitions(task, profile);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link
          to={`/projects/${task.project_id}`}
          className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="w-4 h-4" />
          К объекту: {task.project?.name || 'Объект'}
        </Link>

        {profile.role === 'manager' && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
            >
              <Pencil className="w-3.5 h-3.5" />
              Редактировать
            </button>
            <button
              onClick={handleDeleteTask}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 bg-white border border-rose-200 rounded-lg hover:bg-rose-50 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Удалить
            </button>
          </div>
        )}
      </div>

      {/* Основная карточка данных задачи */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-100 pb-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-bold text-slate-900">{task.title}</h1>
            <p className="text-xs text-slate-500">
              Создана: {new Date(task.created_at).toLocaleString('ru-RU')}
            </p>
          </div>
          <StatusBadge status={task.status} />
        </div>

        <div className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Описание</h3>
          <p className="text-sm text-slate-700 whitespace-pre-line">
            {task.description || 'Описание не указано'}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-slate-100 text-sm">
          <div>
            <span className="text-xs text-slate-400 block">Строительный объект</span>
            <Link
              to={`/projects/${task.project_id}`}
              className="font-medium text-blue-600 hover:underline"
            >
              {task.project?.name}
            </Link>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Исполнитель</span>
            <span className="font-medium text-slate-900">{task.assignee?.full_name}</span>
          </div>
          <div>
            <span className="text-xs text-slate-400 block">Автор (Постановщик)</span>
            <span className="font-medium text-slate-900">{task.author?.full_name}</span>
          </div>
        </div>
      </div>

      {/* Блок доступных действий по смене статуса */}
      {availableActions.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
          <h2 className="text-base font-semibold text-slate-900">Доступные действия</h2>

          {actionError && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{actionError}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Комментарий к смене статуса{' '}
              {availableActions.some((a) => a.requiresComment) && (
                <span className="text-rose-600">(обязателен при возврате на доработку)</span>
              )}
            </label>
            <textarea
              rows={2}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Напишите комментарий или причину возврата..."
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {availableActions.map((action) => {
              const btnStyle =
                action.variant === 'success'
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                  : action.variant === 'danger'
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-blue-600 hover:bg-blue-700 text-white';

              return (
                <button
                  key={action.nextStatus}
                  disabled={submittingStatus}
                  onClick={() => handleStatusTransition(action.nextStatus, action.requiresComment)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition cursor-pointer disabled:opacity-50 ${btnStyle}`}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {action.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* История смены статусов задачи */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-slate-400" />
          <h2 className="text-base font-semibold text-slate-900">История изменений статуса</h2>
        </div>

        {history.length === 0 ? (
          <p className="text-sm text-slate-500">История пуста</p>
        ) : (
          <div className="space-y-4">
            {history.map((item) => (
              <div
                key={item.id}
                className="p-4 rounded-lg bg-slate-50 border border-slate-200/80 space-y-2 text-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-medium text-slate-900">
                    {item.actor?.full_name || 'Пользователь'}
                  </div>
                  <div className="text-xs text-slate-500">
                    {new Date(item.created_at).toLocaleString('ru-RU')}
                  </div>
                </div>

                <div className="flex items-center gap-2 text-xs">
                  {item.old_status ? (
                    <>
                      <StatusBadge status={item.old_status} />
                      <span className="text-slate-400">&rarr;</span>
                      <StatusBadge status={item.new_status} />
                    </>
                  ) : (
                    <>
                      <span className="text-slate-500">Создана в статусе:</span>
                      <StatusBadge status={item.new_status} />
                    </>
                  )}
                </div>

                {item.comment && (
                  <div className="text-slate-700 bg-white p-2.5 rounded border border-slate-200 text-xs">
                    {item.comment}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Модалка редактирования задачи (для Постановщика) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-lg w-full p-6 space-y-4 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900">Редактировать задачу</h3>
            <form onSubmit={handleUpdateTask} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Название</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Описание</label>
                <textarea
                  rows={3}
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Исполнитель</label>
                <select
                  value={editAssigneeId}
                  onChange={(e) => setEditAssigneeId(e.target.value)}
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
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg cursor-pointer"
                >
                  Сохранить
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}