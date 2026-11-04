import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Pencil, Trash2, MapPin } from 'lucide-react';
import { supabase, type Profile, type Project, type ProjectWithTasks } from '../lib/supabase';

export function ProjectsListPage({ profile }: { profile: Profile }) {
  const [projects, setProjects] = useState<ProjectWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadProjects = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('projects')
      .select('*, tasks(id, status)')
      .order('created_at', { ascending: false });

    setProjects((data ?? []) as ProjectWithTasks[]);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;

    const runLoad = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('projects')
        .select('*, tasks(id, status)')
        .order('created_at', { ascending: false });

      if (!cancelled) {
        setProjects((data ?? []) as ProjectWithTasks[]);
        setLoading(false);
      }
    };

    void runLoad();

    return () => {
      cancelled = true;
    };
  }, []);

  const openCreateModal = () => {
    setEditingProject(null);
    setName('');
    setAddress('');
    setIsModalOpen(true);
  };

  const openEditModal = (project: Project, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEditingProject(project);
    setName(project.name);
    setAddress(project.address);
    setIsModalOpen(true);
  };

  const handleSaveProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);

    if (editingProject) {
      const { error } = await supabase
        .from('projects')
        .update({ name: name.trim(), address: address.trim() })
        .eq('id', editingProject.id);
      if (error) alert(error.message);
    } else {
      const { error } = await supabase
        .from('projects')
        .insert({ name: name.trim(), address: address.trim() });
      if (error) alert(error.message);
    }

    setSubmitting(false);
    setIsModalOpen(false);
    void loadProjects();
  };

  const handleDeleteProject = async (id: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Удалить этот объект вместе со всеми его задачами?')) return;

    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) alert(error.message);
    else void loadProjects();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Строительные объекты</h1>
          <p className="text-sm text-slate-500">
            {profile.role === 'manager'
              ? 'Все объекты компании'
              : 'Объекты, в которых вам назначены задачи'}
          </p>
        </div>

        {profile.role === 'manager' && (
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Добавить объект
          </button>
        )}
      </div>

      {loading ? (
        <div className="text-sm text-slate-500">Загрузка объектов...</div>
      ) : projects.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
          Нет доступных объектов
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => (
            <Link
              key={project.id}
              to={`/projects/${project.id}`}
              className="bg-white rounded-xl border border-slate-200 p-5 hover:border-blue-400 hover:shadow-sm transition flex flex-col justify-between gap-4"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h2 className="font-semibold text-slate-900 text-lg">{project.name}</h2>
                  {profile.role === 'manager' && (
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={(e) => openEditModal(project, e)}
                        className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-md transition"
                        title="Редактировать"
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => handleDeleteProject(project.id, e)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition"
                        title="Удалить"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-1.5 text-sm text-slate-500">
                  <MapPin className="w-4 h-4 shrink-0 text-slate-400" />
                  <span>{project.address}</span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
                <span>
                  Задач: <strong>{project.tasks?.length || 0}</strong>
                </span>
                <span className="text-blue-600 font-medium">Открыть карточку &rarr;</span>
              </div>
            </Link>
          ))}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl max-w-md w-full p-6 space-y-4 shadow-lg">
            <h3 className="text-lg font-bold text-slate-900">
              {editingProject ? 'Редактировать объект' : 'Новый строительный объект'}
            </h3>
            <form onSubmit={handleSaveProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Название</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Например: ЖК «Северный Парк»"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Адрес</label>
                <input
                  type="text"
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="г. Москва, ул. Дыбенко, вл. 7"
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="submit"
                  disabled={submitting}
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