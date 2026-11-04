import { Link, useLocation } from 'react-router-dom';
import { Building2, ClipboardList, LogOut } from 'lucide-react';
import type { Profile } from '../lib/supabase';

interface NavbarProps {
  profile: Profile;
  onLogout: () => void;
}

export function Navbar({ profile, onLogout }: NavbarProps) {
  const location = useLocation();
  const isProjectsActive = location.pathname.startsWith('/projects');
  const isMyTasksActive = location.pathname.startsWith('/my-tasks');

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
      <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-6">
          <Link to="/projects" className="flex items-center gap-2 font-bold text-slate-900 text-lg">
            <Building2 className="w-6 h-6 text-blue-600" />
            <span>СтройCRM</span>
          </Link>

          <nav className="flex items-center gap-1">
            <Link
              to="/projects"
              className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                isProjectsActive
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Объекты
            </Link>

            {profile.role === 'worker' && (
              <Link
                to="/my-tasks"
                className={`px-3 py-2 rounded-lg text-sm font-medium transition flex items-center gap-1.5 ${
                  isMyTasksActive
                    ? 'bg-blue-50 text-blue-700'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ClipboardList className="w-4 h-4" />
                Мои задачи
              </Link>
            )}
          </nav>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-medium text-slate-900">{profile.full_name}</div>
            <div className="text-xs text-slate-500">
              {profile.role === 'manager' ? 'Постановщик' : 'Исполнитель'} ({profile.email})
            </div>
          </div>
          <button
            onClick={onLogout}
            title="Выйти"
            className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition cursor-pointer"
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
}