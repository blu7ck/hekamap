import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../auth/AuthProvider';

type Project = { id: string; name: string };
type Asset = {
  id: string;
  name: string;
  mime_type?: string;
  signed_url?: string;
  processing_status?: string;
  asset_category?: string;
};

const allowedMimeTypes = (import.meta.env.VITE_ALLOWED_UPLOAD_MIME_TYPES || '').split(',').filter(Boolean);

// Format detection helper
const detectSourceFormat = (fileName: string, mimeType: string): string => {
  const lower = fileName.toLowerCase();
  const ext = lower.split('.').pop() || '';
  if (ext === 'glb') return 'glb';
  if (ext === 'obj') return 'obj';
  if (ext === 'fbx') return 'fbx';
  if (ext === 'las') return 'las';
  if (ext === 'laz') return 'laz';
  if (ext === 'ifc') return 'ifc';
  if (ext === 'zip') return 'zip';
  if (ext === 'geojson' || ext === 'json') return 'geojson';
  if (ext === 'kml' || ext === 'kmz') return 'kml';
  // fallback by mime
  if (mimeType.includes('gltf')) return 'glb';
  if (mimeType.includes('geo+json')) return 'geojson';
  return 'other';
};

export const WorkspacePage: React.FC = () => {
  const { signOut, profile } = useAuth();
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<string | null>(null);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [assetCategory, setAssetCategory] = useState<'single_model' | 'large_area'>('single_model');
  const [keepRawForever, setKeepRawForever] = useState(true);
  const [retentionDays, setRetentionDays] = useState<number>(30);
  const [uploadProgress, setUploadProgress] = useState(0);

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

  const requestSignedUpload = async (
    file: File,
    category: 'single_model' | 'large_area',
    retentionDays: number | null
  ) => {
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
        mime_type: file.type || 'application/octet-stream',
        project_id: selectedProject,
        asset_category: category,
        raw_file_retention_days: retentionDays,
        file_size_bytes: file.size,
      }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || 'Upload URL alınamadı');
    }
    return (await res.json()) as {
      upload_url: string;
      key: string;
      asset_id: string;
      headers?: Record<string, string>;
    };
  };

  const notifyUploadComplete = async (assetId: string, category: 'single_model' | 'large_area') => {
    const session = (await supabase.auth.getSession()).data.session;
    const token = session?.access_token;
    if (!token) throw new Error('Auth token bulunamadı.');

    const res = await fetch('/api/upload-complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        project_id: selectedProject,
        asset_id: assetId,
        asset_category: category,
      }),
    });
    if (!res.ok) {
      const msg = await res.text();
      throw new Error(msg || 'Upload complete notification failed');
    }
    return (await res.json()) as { ok: boolean; job_id?: string };
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (allowedMimeTypes.length && !allowedMimeTypes.includes(file.type)) {
      setError('Dosya türüne izin verilmiyor.');
      return;
    }
    setSelectedFile(file);
    setError(null);
  };

  const handleUploadSubmit = async () => {
    if (!selectedFile || !selectedProject) return;

    setUploading(true);
    setError(null);
    setMessage(null);
    setUploadProgress(0);

    try {
      const retention = keepRawForever ? null : Math.max(1, Math.floor(retentionDays));
      const { upload_url, asset_id, headers } = await requestSignedUpload(
        selectedFile,
        assetCategory,
        retention
      );

      // Upload file with progress tracking
      const xhr = new XMLHttpRequest();
      await new Promise<void>((resolve, reject) => {
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.addEventListener('load', () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve();
          } else {
            reject(new Error(`Upload failed with status ${xhr.status}`));
          }
        });
        xhr.addEventListener('error', () => reject(new Error('Upload failed')));
        xhr.open('PUT', upload_url);
        Object.entries(headers || {}).forEach(([k, v]) => {
          if (k.toLowerCase() !== 'content-type') {
            xhr.setRequestHeader(k, v);
          }
        });
        xhr.setRequestHeader('Content-Type', selectedFile.type || 'application/octet-stream');
        xhr.send(selectedFile);
      });

      // Notify upload complete to trigger processing
      await notifyUploadComplete(asset_id, assetCategory);

      setMessage('Dosya yüklendi ve işleme kuyruğuna eklendi.');
      setShowUploadModal(false);
      setSelectedFile(null);
      setUploadProgress(0);

      if (selectedProject) {
        await loadAssets(selectedProject);
      }
    } catch (err: any) {
      setError(err.message || 'Yükleme başarısız.');
      console.error(err);
    } finally {
      setUploading(false);
      setUploadProgress(0);
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
            <button
              onClick={() => setShowUploadModal(true)}
              disabled={!selectedProject || uploading}
              className="rounded bg-emerald-500 px-3 py-2 text-sm text-black hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Yükle
            </button>
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
                  <div className="text-xs text-gray-400">
                    {asset.mime_type || '—'} • {asset.asset_category || '—'} •{' '}
                    {asset.processing_status === 'queued' && '⏳ Kuyrukta'}
                    {asset.processing_status === 'processing' && '⚙️ İşleniyor'}
                    {asset.processing_status === 'completed' && '✅ Hazır'}
                    {asset.processing_status === 'failed' && '❌ Hata'}
                    {!asset.processing_status && '—'}
                  </div>
                </div>
                {asset.signed_url && asset.processing_status === 'completed' && (
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

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 max-w-md w-full">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Dosya Yükle</h2>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setError(null);
                  setMessage(null);
                }}
                className="text-gray-400 hover:text-white"
                disabled={uploading}
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              {/* Asset Category Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Kategori</label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="category"
                      value="single_model"
                      checked={assetCategory === 'single_model'}
                      onChange={(e) => setAssetCategory(e.target.value as 'single_model')}
                      disabled={uploading}
                      className="w-4 h-4"
                    />
                    <span>Tekil Model (GLB)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="category"
                      value="large_area"
                      checked={assetCategory === 'large_area'}
                      onChange={(e) => setAssetCategory(e.target.value as 'large_area')}
                      disabled={uploading}
                      className="w-4 h-4"
                    />
                    <span>Büyük Alan (3D Tiles)</span>
                  </label>
                </div>
              </div>

              {/* File Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">Dosya</label>
                <input
                  type="file"
                  onChange={handleFileSelect}
                  disabled={uploading}
                  className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-emerald-500 file:text-black hover:file:bg-emerald-400"
                />
                {selectedFile && (
                  <div className="mt-2 text-xs text-gray-400">
                    {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                    <br />
                    Format: {detectSourceFormat(selectedFile.name, selectedFile.type || '')}
                  </div>
                )}
              </div>

              {/* Raw File Retention */}
              <div>
                <label className="block text-sm font-medium mb-2">Ham Dosya Saklama</label>
                <label className="flex items-center gap-2 cursor-pointer mb-2">
                  <input
                    type="checkbox"
                    checked={keepRawForever}
                    onChange={(e) => setKeepRawForever(e.target.checked)}
                    disabled={uploading}
                    className="w-4 h-4"
                  />
                  <span>Süresiz sakla</span>
                </label>
                {!keepRawForever && (
                  <div className="mt-2">
                    <label className="block text-xs text-gray-400 mb-1">Kaç gün sonra silinsin?</label>
                    <input
                      type="number"
                      min="1"
                      value={retentionDays}
                      onChange={(e) => setRetentionDays(Math.max(1, parseInt(e.target.value) || 30))}
                      disabled={uploading}
                      className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm"
                    />
                  </div>
                )}
              </div>

              {/* Upload Progress */}
              {uploading && (
                <div>
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>Yükleniyor...</span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2">
                    <div
                      className="bg-emerald-500 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Messages */}
              {error && <div className="text-sm text-red-400">{error}</div>}
              {message && <div className="text-sm text-emerald-400">{message}</div>}

              {/* Actions */}
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                    setError(null);
                    setMessage(null);
                  }}
                  disabled={uploading}
                  className="px-4 py-2 rounded bg-gray-800 text-sm hover:bg-gray-700 disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  onClick={handleUploadSubmit}
                  disabled={!selectedFile || uploading}
                  className="px-4 py-2 rounded bg-emerald-500 text-black text-sm hover:bg-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? 'Yükleniyor...' : 'Yükle'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

