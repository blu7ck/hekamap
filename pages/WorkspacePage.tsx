import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../auth/AuthProvider';
import { 
  Plus, 
  Upload, 
  Folder, 
  File, 
  X, 
  RefreshCw, 
  ExternalLink, 
  CheckCircle2, 
  Clock, 
  AlertCircle,
  Loader2,
  Trash2
} from 'lucide-react';

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
  const [showCreateProjectModal, setShowCreateProjectModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDescription, setNewProjectDescription] = useState('');
  const [creatingProject, setCreatingProject] = useState(false);

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

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) {
      setError('Proje adı gereklidir.');
      return;
    }

    setCreatingProject(true);
    setError(null);
    setMessage(null);

    try {
      const slug = newProjectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const { data, error } = await supabase
        .from('projects')
        .insert({
          name: newProjectName.trim(),
          description: newProjectDescription.trim() || null,
          slug: slug || `project-${Date.now()}`,
          owner_id: profile?.id,
        })
        .select('id, name')
        .single();

      if (error) throw error;

      setMessage('Proje oluşturuldu.');
      setShowCreateProjectModal(false);
      setNewProjectName('');
      setNewProjectDescription('');
      await loadProjects();
      if (data) {
        setSelectedProject(data.id);
      }
    } catch (err: any) {
      setError(err.message || 'Proje oluşturulamadı.');
      console.error(err);
    } finally {
      setCreatingProject(false);
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
      case 'processing':
        return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
      case 'queued':
        return <Clock className="w-4 h-4 text-yellow-500" />;
      case 'failed':
        return <AlertCircle className="w-4 h-4 text-red-500" />;
      default:
        return <File className="w-4 h-4 text-gray-500" />;
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'completed':
        return 'Hazır';
      case 'processing':
        return 'İşleniyor';
      case 'queued':
        return 'Kuyrukta';
      case 'failed':
        return 'Hata';
      default:
        return 'Bekliyor';
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      {/* Header */}
      <div className="border-b border-gray-800 bg-gray-900/50 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-oswald font-bold tracking-tight">
              Workspace
            </h1>
            <p className="text-sm text-gray-400 mt-1">
              {profile?.email || '—'} • <span className="capitalize">{profile?.role || '—'}</span>
            </p>
          </div>
          <button
            onClick={() => signOut()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-sm font-medium"
          >
            <X className="w-4 h-4" />
            Çıkış
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6">

      {/* Messages */}
      {message && (
        <div className="mb-4 p-4 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="w-5 h-5" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="mb-4 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-4">
        {/* Projects Sidebar */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Folder className="w-5 h-5 text-emerald-500" />
                Projeler
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={loadProjects}
                  className="p-2 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors"
                  title="Yenile"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setShowCreateProjectModal(true)}
                  className="p-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black transition-colors"
                  title="Yeni Proje"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-2 max-h-[calc(100vh-300px)] overflow-y-auto">
              {projects.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Folder className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p className="text-sm">Henüz proje yok</p>
                  <button
                    onClick={() => setShowCreateProjectModal(true)}
                    className="mt-3 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-medium transition-colors inline-flex items-center gap-2"
                  >
                    <Plus className="w-4 h-4" />
                    Proje Oluştur
                  </button>
                </div>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setSelectedProject(p.id)}
                    className={`w-full rounded-lg px-4 py-3 text-left transition-all ${
                      selectedProject === p.id
                        ? 'bg-emerald-500 text-black shadow-lg shadow-emerald-500/20'
                        : 'bg-gray-800/50 hover:bg-gray-800 text-white'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <Folder className={`w-4 h-4 ${selectedProject === p.id ? 'text-black' : 'text-gray-400'}`} />
                      <span className="font-medium truncate">{p.name || p.id}</span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Assets Main Area */}
        <div className="lg:col-span-3">
          <div className="rounded-xl border border-gray-800 bg-gray-900/50 backdrop-blur-sm p-6">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-xl font-semibold flex items-center gap-2">
                  <File className="w-5 h-5 text-emerald-500" />
                  Varlıklar
                </h2>
                <p className="text-sm text-gray-400 mt-1">
                  {selectedProject ? `${assets.length} varlık` : 'Proje seçin'}
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(true)}
                disabled={!selectedProject || uploading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-500"
              >
                <Upload className="w-5 h-5" />
                Dosya Yükle
              </button>
            </div>

            {!selectedProject ? (
              <div className="text-center py-16 text-gray-500">
                <Folder className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg mb-2">Proje Seçin</p>
                <p className="text-sm">Varlıkları görmek için bir proje seçin veya yeni proje oluşturun.</p>
              </div>
            ) : assets.length === 0 ? (
              <div className="text-center py-16 text-gray-500">
                <File className="w-16 h-16 mx-auto mb-4 opacity-30" />
                <p className="text-lg mb-2">Henüz varlık yok</p>
                <p className="text-sm mb-4">Bu projeye ilk dosyanızı yükleyerek başlayın.</p>
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  İlk Dosyayı Yükle
                </button>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {assets.map((asset) => (
                  <div
                    key={asset.id}
                    className="rounded-lg border border-gray-800 bg-gray-800/30 hover:bg-gray-800/50 p-4 transition-all group"
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {getStatusIcon(asset.processing_status)}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{asset.name || asset.id}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            {asset.mime_type || 'Bilinmeyen format'}
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex flex-col gap-1">
                        <span className="text-xs px-2 py-1 rounded bg-gray-700/50 text-gray-300 inline-block w-fit">
                          {asset.asset_category === 'single_model' ? 'Tekil Model' : 'Büyük Alan'}
                        </span>
                        <span className="text-xs text-gray-500 flex items-center gap-1">
                          {getStatusIcon(asset.processing_status)}
                          {getStatusText(asset.processing_status)}
                        </span>
                      </div>
                      {asset.signed_url && asset.processing_status === 'completed' && (
                        <a
                          href={asset.signed_url}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                          title="Görüntüle"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Create Project Modal */}
      {showCreateProjectModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Plus className="w-5 h-5 text-emerald-500" />
                Yeni Proje
              </h2>
              <button
                onClick={() => {
                  setShowCreateProjectModal(false);
                  setNewProjectName('');
                  setNewProjectDescription('');
                  setError(null);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                disabled={creatingProject}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">Proje Adı *</label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  placeholder="Örn: Şehir Planlama Projesi"
                  disabled={creatingProject}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">Açıklama (Opsiyonel)</label>
                <textarea
                  value={newProjectDescription}
                  onChange={(e) => setNewProjectDescription(e.target.value)}
                  placeholder="Proje hakkında kısa bir açıklama..."
                  disabled={creatingProject}
                  rows={3}
                  className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent disabled:opacity-50 resize-none"
                />
              </div>

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => {
                    setShowCreateProjectModal(false);
                    setNewProjectName('');
                    setNewProjectDescription('');
                    setError(null);
                  }}
                  disabled={creatingProject}
                  className="px-4 py-2 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  onClick={handleCreateProject}
                  disabled={!newProjectName.trim() || creatingProject}
                  className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {creatingProject && <Loader2 className="w-4 h-4 animate-spin" />}
                  {creatingProject ? 'Oluşturuluyor...' : 'Oluştur'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-md w-full shadow-2xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Upload className="w-5 h-5 text-emerald-500" />
                Dosya Yükle
              </h2>
              <button
                onClick={() => {
                  setShowUploadModal(false);
                  setSelectedFile(null);
                  setError(null);
                  setMessage(null);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
                disabled={uploading}
              >
                <X className="w-5 h-5" />
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
                <label className="block text-sm font-medium mb-2">Dosya Seç</label>
                <div className="relative">
                  <input
                    type="file"
                    onChange={handleFileSelect}
                    disabled={uploading}
                    className="w-full text-sm text-gray-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-emerald-500 file:text-black hover:file:bg-emerald-400 file:cursor-pointer disabled:opacity-50"
                  />
                </div>
                {selectedFile && (
                  <div className="mt-3 p-3 rounded-lg bg-gray-800/50 border border-gray-700">
                    <div className="flex items-center gap-2 mb-1">
                      <File className="w-4 h-4 text-emerald-500" />
                      <span className="text-sm font-medium truncate">{selectedFile.name}</span>
                    </div>
                    <div className="text-xs text-gray-400 flex items-center gap-3 mt-2">
                      <span>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                      <span>•</span>
                      <span>Format: {detectSourceFormat(selectedFile.name, selectedFile.type || '')}</span>
                    </div>
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
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-300 flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin text-emerald-500" />
                      Yükleniyor...
                    </span>
                    <span className="font-medium text-emerald-500">{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-gray-800 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => {
                    setShowUploadModal(false);
                    setSelectedFile(null);
                    setError(null);
                    setMessage(null);
                  }}
                  disabled={uploading}
                  className="px-4 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-sm font-medium transition-colors disabled:opacity-50"
                >
                  İptal
                </button>
                <button
                  onClick={handleUploadSubmit}
                  disabled={!selectedFile || uploading}
                  className="px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Yükleniyor...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Yükle
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

