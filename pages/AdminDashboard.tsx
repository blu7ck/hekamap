import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../auth/AuthProvider';

type UserRole = 'owner' | 'admin' | 'moderator' | 'user' | 'viewer';

type UserRow = {
  id: string;
  email?: string;
  role?: UserRole;
  username?: string;
  full_name?: string;
};

type Stats = {
  totalUsers: number;
  owners: number;
  admins: number;
  moderators: number;
  projects: number;
  topics: number;
  pendingReports: number;
};

type ReportRow = {
  id: string;
  report_type: string;
  status: string;
  reason: string;
  created_at: string;
};

// Backend API URL - environment variable'dan al, yoksa default değer
const getBackendApiUrl = (): string => {
  const env = import.meta.env as { VITE_BACKEND_API_URL?: string };
  return env.VITE_BACKEND_API_URL || 'http://localhost:3000';
};

export const AdminDashboard: React.FC = () => {
  const { signOut, session } = useAuth();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [loadingStats, setLoadingStats] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newAdminEmail, setNewAdminEmail] = useState('');
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [changingRole, setChangingRole] = useState<string | null>(null);

  useEffect(() => {
    void Promise.all([loadUsers(), loadStats(), loadReports()]);
  }, []);

  const getAuthToken = async (): Promise<string | null> => {
    if (session?.access_token) {
      return session.access_token;
    }
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token || null;
  };

  const loadUsers = async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) {
        setError('Oturum bulunamadı.');
        setLoadingUsers(false);
        return;
      }

      const backendUrl = getBackendApiUrl();
      const res = await fetch(`${backendUrl}/api/admin/users?page=1&limit=100`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Kullanıcılar yüklenemedi');
      }

      const data = await res.json();
      setUsers(data.users || []);
    } catch (err: any) {
      console.error('Load users error:', err);
      setError(err.message || 'Kullanıcılar yüklenemedi.');
      // Fallback: Supabase'den direkt yükle (eski yöntem)
      const { data, error: supabaseError } = await supabase
        .from('user_profiles')
        .select('id, role, email, username, full_name')
        .order('email', { ascending: true });
      if (!supabaseError && data) {
        setUsers(data);
      }
    } finally {
      setLoadingUsers(false);
    }
  };

  const loadStats = async () => {
    setLoadingStats(true);
    try {
      const [
        usersCount,
        ownersCount,
        adminsCount,
        moderatorsCount,
        projectsCount,
        topicsCount,
        pendingReportsCount,
      ] = await Promise.all([
        supabase.from('user_profiles').select('*', { count: 'exact', head: true }),
        supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'owner'),
        supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'admin'),
        supabase
          .from('user_profiles')
          .select('*', { count: 'exact', head: true })
          .eq('role', 'moderator'),
        supabase.from('projects').select('*', { count: 'exact', head: true }),
        supabase.from('topics').select('*', { count: 'exact', head: true }),
        supabase
          .from('reports')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ]);

      setStats({
        totalUsers: usersCount.count ?? 0,
        owners: ownersCount.count ?? 0,
        admins: adminsCount.count ?? 0,
        moderators: moderatorsCount.count ?? 0,
        projects: projectsCount.count ?? 0,
        topics: topicsCount.count ?? 0,
        pendingReports: pendingReportsCount.count ?? 0,
      });
    } catch (err) {
      console.warn('Stats load failed', err);
    } finally {
      setLoadingStats(false);
    }
  };

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      const { data, error } = await supabase
        .from('reports')
        .select('id, report_type, status, reason, created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) {
        console.warn('Reports load failed', error.message);
        return;
      }
      setReports(data || []);
    } finally {
      setLoadingReports(false);
    }
  };

  const changeRole = async (userId: string, newRole: UserRole) => {
    setError(null);
    setMessage(null);
    setChangingRole(userId);

    try {
      const token = await getAuthToken();
      if (!token) {
        setError('Oturum bulunamadı.');
        setChangingRole(null);
        return;
      }

      const backendUrl = getBackendApiUrl();
      const res = await fetch(`${backendUrl}/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          newRole,
          reason: `Role changed to ${newRole} via admin panel`,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Rol güncellenemedi');
      }

      const result = await res.json();
      setMessage(`Rol güncellendi: ${result.previousRole} → ${result.newRole}`);
      await Promise.all([loadUsers(), loadStats()]);
    } catch (err: any) {
      console.error('Change role error:', err);
      setError('Rol güncellenemedi: ' + err.message);
    } finally {
      setChangingRole(null);
    }
  };

  const resetPassword = async (userId: string) => {
    if (!confirm('Bu kullanıcının şifresini yenilemek istediğinize emin misiniz?')) return;

    setError(null);
    setMessage(null);
    const token = await getAuthToken();
    if (!token) {
      setError('Auth token bulunamadı.');
      return;
    }

    try {
      const res = await fetch('/api/reset-admin-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ user_id: userId }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Şifre yenileme başarısız');
        return;
      }

      setMessage(`Şifre yenilendi ve ${data.email} adresine gönderildi.`);
    } catch (err: any) {
      setError('Şifre yenileme başarısız: ' + err.message);
    }
  };

  const updateReportStatus = async (reportId: string, status: string) => {
    setError(null);
    setMessage(null);
    const { error } = await supabase
      .from('reports')
      .update({ status })
      .eq('id', reportId);
    if (error) {
      setError('Rapor güncellenemedi: ' + error.message);
      return;
    }
    setMessage('Rapor durumu güncellendi');
    await Promise.all([loadReports(), loadStats()]);
  };

  const createAdminUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newAdminEmail.trim().toLowerCase();
    if (!email || !email.includes('@')) {
      setError('Geçerli bir e-posta girin.');
      return;
    }
    setError(null);
    setMessage(null);
    setGeneratedPassword(null);
    setCreatingAdmin(true);
    try {
      const token = await getAuthToken();
      if (!token) {
        setError('Oturum bulunamadı.');
        return;
      }
      const res = await fetch('/api/create-admin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const text = await res.text();
        setError(text || 'Admin oluşturulamadı.');
        return;
      }
      const data = await res.json();
      setMessage(`Admin kullanıcısı oluşturuldu: ${data.email}`);
      setGeneratedPassword(data.generatedPassword);
      setNewAdminEmail('');
      await Promise.all([loadUsers(), loadStats()]);
    } catch (err: any) {
      setError(err?.message || 'Admin oluşturulamadı.');
    } finally {
      setCreatingAdmin(false);
    }
  };

  const getRoleButtonClass = (role: UserRole) => {
    switch (role) {
      case 'owner':
        return 'rounded bg-purple-600 px-2 py-1 text-xs text-white hover:bg-purple-500';
      case 'admin':
        return 'rounded bg-blue-500 px-2 py-1 text-xs text-black hover:bg-blue-400';
      case 'moderator':
        return 'rounded bg-amber-500 px-2 py-1 text-xs text-black hover:bg-amber-400';
      case 'user':
        return 'rounded bg-gray-700 px-2 py-1 text-xs text-white hover:bg-gray-600';
      case 'viewer':
        return 'rounded bg-gray-800 px-2 py-1 text-xs text-gray-300 hover:bg-gray-700';
      default:
        return 'rounded bg-gray-700 px-2 py-1 text-xs text-white hover:bg-gray-600';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Admin Panel (Owner)</h1>
          <p className="text-sm text-gray-400">
            Kullanıcı yönetimi, forum/rapor denetimi ve proje istatistikleri.
          </p>
        </div>
        <button
          onClick={() => signOut()}
          className="rounded bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
        >
          Çıkış
        </button>
      </div>

      {/* Dashboard & istatistikler */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          <p className="text-xs uppercase tracking-widest text-gray-400">Toplam Kullanıcı</p>
          <p className="mt-2 text-3xl font-bold">
            {loadingStats && !stats ? '—' : stats?.totalUsers ?? '0'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Owner: {stats?.owners ?? 0} · Admin: {stats?.admins ?? 0} · Mod: {stats?.moderators ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          <p className="text-xs uppercase tracking-widest text-gray-400">Projeler</p>
          <p className="mt-2 text-3xl font-bold">
            {loadingStats && !stats ? '—' : stats?.projects ?? '0'}
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Forum başlıkları: {stats?.topics ?? 0}
          </p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          <p className="text-xs uppercase tracking-widest text-gray-400">Raporlar</p>
          <p className="mt-2 text-3xl font-bold text-amber-400">
            {loadingStats && !stats ? '—' : stats?.pendingReports ?? 0}
          </p>
          <p className="mt-1 text-xs text-gray-500">Bekleyen inceleme</p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 p-4">
          <p className="text-xs uppercase tracking-widest text-gray-400">Roller</p>
          <p className="mt-2 text-lg font-semibold text-gray-300">Yönetim</p>
          <p className="mt-1 text-xs text-gray-500">
            Owner · Admin · Moderator · User · Viewer
          </p>
        </div>
      </div>

      {message && <div className="text-sm text-emerald-400">{message}</div>}
      {error && <div className="text-sm text-red-400">{error}</div>}
      {generatedPassword && (
        <div className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/40 rounded p-3">
          <p className="font-semibold mb-1">Oluşturulan geçici şifre (sadece owner görebilir):</p>
          <code className="break-all text-amber-100">{generatedPassword}</code>
          <p className="mt-1">
            Bu şifreyi yalnızca güvenli bir kanaldan yeni admin ile paylaş. Prod ortamda bu adım
            e-posta ile otomatikleştirilmeli.
          </p>
        </div>
      )}

      {/* Kullanıcı yönetimi + Rapor inceleme + Forum özet */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Kullanıcı yönetimi */}
        <div className="lg:col-span-2 rounded border border-gray-800 bg-gray-900/60 p-4">
          <div className="flex flex-col gap-4 mb-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-semibold">Kullanıcılar</h2>
              <p className="text-xs text-gray-500">
                Sadece owner bu ekrana erişebilir ve rol yönetimi yapabilir.
              </p>
            </div>
            <div className="flex flex-col gap-2 md:items-end">
              <form className="flex flex-col gap-2 md:flex-row md:items-center" onSubmit={createAdminUser}>
                <input
                  type="email"
                  required
                  className="w-full md:w-64 rounded border border-gray-700 bg-black/40 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="admin@hekamap.com"
                  value={newAdminEmail}
                  onChange={(e) => setNewAdminEmail(e.target.value)}
                />
                <button
                  type="submit"
                  disabled={creatingAdmin}
                  className="rounded bg-emerald-500 px-3 py-1 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
                >
                  {creatingAdmin ? 'Oluşturuluyor...' : 'Admin Oluştur + Şifre Üret'}
                </button>
              </form>
              <button
                onClick={loadUsers}
                className="self-start md:self-end rounded bg-gray-800 px-3 py-1 text-sm hover:bg-gray-700"
                disabled={loadingUsers}
              >
                Listeyi Yenile
              </button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-gray-400">
                  <th className="px-3 py-2 text-left">Email / Username</th>
                  <th className="px-3 py-2 text-left">Rol</th>
                  <th className="px-3 py-2 text-left">Aksiyon</th>
                </tr>
              </thead>
              <tbody>
                {loadingUsers && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-gray-400">
                      Yükleniyor...
                    </td>
                  </tr>
                )}
                {!loadingUsers && users.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-3 py-4 text-center text-gray-500">
                      Kullanıcı bulunamadı.
                    </td>
                  </tr>
                )}
                {!loadingUsers &&
                  users.map((user) => (
                    <tr key={user.id} className="border-t border-gray-800">
                      <td className="px-3 py-2">
                        <div>{user.email || user.username || user.id}</div>
                        {user.full_name && (
                          <div className="text-xs text-gray-500">{user.full_name}</div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <span className="capitalize font-medium">{user.role || '—'}</span>
                      </td>
                      <td className="px-3 py-2 space-x-1">
                        <button
                          className={getRoleButtonClass('owner')}
                          onClick={() => changeRole(user.id, 'owner')}
                          disabled={changingRole === user.id || user.role === 'owner'}
                          title="Owner"
                        >
                          Owner
                        </button>
                        <button
                          className={getRoleButtonClass('admin')}
                          onClick={() => changeRole(user.id, 'admin')}
                          disabled={changingRole === user.id || user.role === 'admin'}
                          title="Admin"
                        >
                          Admin
                        </button>
                        <button
                          className={getRoleButtonClass('moderator')}
                          onClick={() => changeRole(user.id, 'moderator')}
                          disabled={changingRole === user.id || user.role === 'moderator'}
                          title="Moderator"
                        >
                          Mod
                        </button>
                        <button
                          className={getRoleButtonClass('user')}
                          onClick={() => changeRole(user.id, 'user')}
                          disabled={changingRole === user.id || user.role === 'user'}
                          title="User"
                        >
                          User
                        </button>
                        <button
                          className={getRoleButtonClass('viewer')}
                          onClick={() => changeRole(user.id, 'viewer')}
                          disabled={changingRole === user.id || user.role === 'viewer'}
                          title="Viewer"
                        >
                          Viewer
                        </button>
                        {(user.role === 'admin' || user.role === 'owner') && (
                          <button
                            className="rounded bg-amber-500 px-2 py-1 text-xs text-black hover:bg-amber-400 ml-1"
                            onClick={() => resetPassword(user.id)}
                            title="Şifre yenile ve e-posta gönder"
                          >
                            Şifre Yenile
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rapor inceleme + Forum yönetimi (pasif) */}
        <div className="space-y-4">
          {/* Rapor inceleme */}
          <div className="rounded border border-gray-800 bg-gray-900/60 p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Raporlar</h2>
              <button
                onClick={loadReports}
                className="rounded bg-gray-800 px-3 py-1 text-sm hover:bg-gray-700"
                disabled={loadingReports}
              >
                Yenile
              </button>
            </div>
            {loadingReports && <p className="text-sm text-gray-400">Yükleniyor...</p>}
            {!loadingReports && reports.length === 0 && (
              <p className="text-sm text-gray-500">Aktif rapor bulunmuyor.</p>
            )}
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
              {reports.map((r) => (
                <div
                  key={r.id}
                  className="rounded border border-gray-800 bg-gray-950/60 p-3 text-xs space-y-1"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold capitalize">{r.report_type}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                        r.status === 'pending'
                          ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                          : r.status === 'resolved'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : 'bg-gray-600/30 text-gray-300 border border-gray-600/40'
                      }`}
                    >
                      {r.status}
                    </span>
                  </div>
                  <p className="text-gray-300 line-clamp-3">{r.reason}</p>
                  <p className="text-[10px] text-gray-500">
                    {new Date(r.created_at).toLocaleString('tr-TR')}
                  </p>
                  <div className="flex gap-2 pt-1">
                    <button
                      className="rounded bg-emerald-500/20 px-2 py-1 text-[10px] text-emerald-300 hover:bg-emerald-500/30"
                      onClick={() => updateReportStatus(r.id, 'resolved')}
                    >
                      Çözüldü
                    </button>
                    <button
                      className="rounded bg-gray-700/40 px-2 py-1 text-[10px] text-gray-200 hover:bg-gray-600/60"
                      onClick={() => updateReportStatus(r.id, 'reviewed')}
                    >
                      İncelendi
                    </button>
                    <button
                      className="ml-auto rounded bg-red-500/20 px-2 py-1 text-[10px] text-red-300 hover:bg-red-500/30"
                      onClick={() => updateReportStatus(r.id, 'dismissed')}
                    >
                      Geçersiz
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Forum yönetimi (pasif) */}
          <div className="rounded border border-gray-800 bg-gray-900/60 p-4">
            <h2 className="text-lg font-semibold mb-2">Forum Yönetimi</h2>
            <p className="text-xs text-gray-400 mb-3">
              Community/forum yapısı şema olarak hazır; arayüz şu anda pasif. İleride kategori,
              konu ve rapor yönetimi buradan açılacak.
            </p>
            <ul className="text-xs text-gray-300 space-y-1 list-disc list-inside">
              <li>Kategoriler (`categories`)</li>
              <li>Konular (`topics`)</li>
              <li>Gönderiler (`posts`), oylar (`votes`)</li>
              <li>Raporlar (`reports`) ve güvenlik olayları (`security_events`)</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
