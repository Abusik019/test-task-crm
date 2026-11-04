import React, { useState } from 'react';
import { Building2, AlertCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError('Неверный email или пароль');
    }
    setLoading(false);
  };

  const fillDemo = (demoEmail: string) => {
    setEmail(demoEmail);
    setPassword('Password123!');
    setError(null);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 max-w-md w-full p-6 space-y-6">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-600 text-white rounded-xl">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Вход в СтройCRM</h1>
            <p className="text-xs text-slate-500">Управление строительными объектами и задачами</p>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="manager@crm.test"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Пароль</label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-medium rounded-lg text-sm transition cursor-pointer"
          >
            {loading ? 'Вход...' : 'Войти'}
          </button>
        </form>

        <div className="pt-4 border-t border-slate-200 space-y-2">
          <p className="text-xs font-medium text-slate-500">
            Быстрое заполнение для проверки (пароль: Password123!):
          </p>
          <div className="grid grid-cols-1 gap-1.5">
            <button
              type="button"
              onClick={() => fillDemo('manager@crm.test')}
              className="text-left px-3 py-1.5 text-xs rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            >
              <strong>Постановщик:</strong> manager@crm.test
            </button>
            <button
              type="button"
              onClick={() => fillDemo('worker1@crm.test')}
              className="text-left px-3 py-1.5 text-xs rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            >
              <strong>Исполнитель 1:</strong> worker1@crm.test
            </button>
            <button
              type="button"
              onClick={() => fillDemo('worker2@crm.test')}
              className="text-left px-3 py-1.5 text-xs rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 transition cursor-pointer"
            >
              <strong>Исполнитель 2:</strong> worker2@crm.test
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}