import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (signInError) {
      setError('Giriş başarısız. Lütfen bilgileri kontrol edin.');
      return;
    }
    const redirectTo = (location.state as { from?: Location })?.from?.pathname || '/hekadmin';
    navigate(redirectTo);
  };

  return (
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-gray-800 bg-gray-900/60 p-6 shadow-lg">
        <h1 className="text-xl font-semibold mb-2">Admin Panel Girişi</h1>
        <p className="text-sm text-gray-400 mb-4">Sadece owner rolü erişebilir.</p>
        <form className="space-y-3" onSubmit={onSubmit}>
          <div>
            <label className="block text-sm text-gray-300 mb-1">E-posta</label>
            <input
              className="w-full rounded border border-gray-700 bg-gray-800 p-2 text-white"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="block text-sm text-gray-300 mb-1">Şifre</label>
            <input
              className="w-full rounded border border-gray-700 bg-gray-800 p-2 text-white"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="submit"
            className="w-full rounded bg-emerald-500 py-2 font-medium text-black hover:bg-emerald-400 disabled:opacity-60"
            disabled={loading}
          >
            {loading ? 'Giriş yapılıyor...' : 'Giriş yap'}
          </button>
        </form>
        <div className="mt-4 text-xs text-gray-500">
          Workspace için <Link className="text-emerald-400 underline" to="/workspace/login">/workspace/login</Link>
        </div>
      </div>
    </div>
  );
};

