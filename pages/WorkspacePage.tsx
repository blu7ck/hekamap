import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../auth/AuthProvider';

type Project = { id: string; name: string };
type Asset = { id: string; name: string; mime_type?: string; signed_url?: string };

const allowedMimeTypes = (import.meta.env.VITE_ALLOWED_UPLOAD_MIME_TYPES || '').split(',').filter(Boolean);

export const WorkspacePage: React.FC = () => {
  const { signOut, profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      void loadAssets(selectedProject);
    } else {
      setAssets([]);
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    setError(null);
    const { data, error } = await supabase.rpc('get_accessible_projects');
    if (error) {
      setError('Projeler alınamadı.');
      return;
    }
    setProjects(data || []);
    if (data && data.length > 0) {
      setSelectedProject(data[0].id);
    }
  };

  const loadAssets = async (projectId: string) => {
    setError(null);
    const { data, error } = await supabase.rpc('list_project_assets', { project_id: projectId });
    if (error) {
      setError('Varlıklar alınamadı.');
      return;
    }
    setAssets(data || []);
  };

  const requestSignedUpload = async (file: File) => {
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token;
    if (!token) throw new Error('Auth token bulunamadı.');

    const res = await fetch('/api/upload-url', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        file_name: file.name,
        mime_type: file.type,
        project_id: selectedProject,
      }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || 'Upload URL alınamadı');
    }
    return (await res.json()) as { upload_url: string; key: string; headers?: Record<string, string> };
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (allowedMimeTypes.length && !allowedMimeTypes.includes(file.type)) {
      setError('Dosya türüne izin verilmiyor.');
      return;
    }
    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const { upload_url, headers } = await requestSignedUpload(file);
      await fetch(upload_url, {
        method: 'PUT',
        headers: {
          'Content-Type': file.type,
          ...(headers || {}),
        },
        body: file,
      });
      setMessage('Yüklendi.');
      if (selectedProject) {
        await loadAssets(selectedProject);
      }
    } catch (err) {
      setError('Yükleme başarısız.');
      console.error(err);
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold">Workspace</h1>
          <p className="text-sm text-gray-400">Rol: {profile?.role || '—'}</p>
        </div>
        <button
          onClick={() => signOut()}
          className="rounded bg-gray-800 px-4 py-2 text-sm hover:bg-gray-700"
        >
          Çıkış
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-1 rounded border border-gray-800 bg-gray-900/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold">Projeler</h2>
            <button
              onClick={loadProjects}
              className="rounded bg-gray-800 px-3 py-1 text-sm hover:bg-gray-700"
            >
              Yenile
            </button>
          </div>
          <div className="space-y-2">
            {projects.length === 0 && <p className="text-sm text-gray-500">Proje bulunamadı.</p>}
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProject(p.id)}
                className={`w-full rounded px-3 py-2 text-left text-sm ${
                  selectedProject === p.id ? 'bg-emerald-500 text-black' : 'bg-gray-800 text-white'
                }`}
              >
                {p.name || p.id}
              </button>
            ))}
          </div>
        </div>

        <div className="md:col-span-2 rounded border border-gray-800 bg-gray-900/50 p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-lg font-semibold">Varlıklar</h2>
              <p className="text-xs text-gray-500">Signed URL ile GET/HEAD; inline görüntüleme.</p>
            </div>
            <label className="cursor-pointer rounded bg-emerald-500 px-3 py-2 text-sm text-black hover:bg-emerald-400">
              {uploading ? 'Yükleniyor...' : 'Yükle'}
              <input type="file" className="hidden" onChange={handleUpload} disabled={!selectedProject || uploading} />
            </label>
          </div>
          {message && <div className="mb-2 text-sm text-emerald-400">{message}</div>}
          {error && <div className="mb-2 text-sm text-red-400">{error}</div>}
          {!selectedProject && <p className="text-sm text-gray-500">Proje seçin.</p>}
          {selectedProject && assets.length === 0 && (
            <p className="text-sm text-gray-500">Bu projede varlık yok.</p>
          )}
          <div className="space-y-2">
            {assets.map((asset) => (
              <div
                key={asset.id}
                className="flex items-center justify-between rounded border border-gray-800 bg-gray-800/60 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{asset.name || asset.id}</div>
                  <div className="text-xs text-gray-400">{asset.mime_type || '—'}</div>
                </div>
                {asset.signed_url && (
                  <a
                    className="text-emerald-400 underline text-xs"
                    href={asset.signed_url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Görüntüle
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

