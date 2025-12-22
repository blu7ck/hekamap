import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Trash2,
  Users,
  Eye
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

// Format info helper
const getFormatInfo = (format: string): { name: string; description: string; requiresProcessing: boolean; category: 'direct' | 'processing' } => {
  const formatLower = format.toLowerCase();
  
  // Direct viewable formats
  if (formatLower === 'glb' || formatLower === 'gltf') {
    return {
      name: 'GLB/GLTF',
      description: 'Doğrudan görüntülenebilir. Cesium tarafından desteklenen 3D model formatı.',
      requiresProcessing: false,
      category: 'direct'
    };
  }
  if (formatLower === 'geojson') {
    return {
      name: 'GeoJSON',
      description: 'Doğrudan görüntülenebilir. Vektör coğrafi veri formatı.',
      requiresProcessing: false,
      category: 'direct'
    };
  }
  if (formatLower === 'kml' || formatLower === 'kmz') {
    return {
      name: 'KML/KMZ',
      description: 'Doğrudan görüntülenebilir. Google Earth formatı.',
      requiresProcessing: false,
      category: 'direct'
    };
  }
  
  // Processing required formats
  if (formatLower === 'obj') {
    return {
      name: 'OBJ',
      description: 'İşleme gerektirir. GLB formatına dönüştürülecek.',
      requiresProcessing: true,
      category: 'processing'
    };
  }
  if (formatLower === 'fbx') {
    return {
      name: 'FBX',
      description: 'İşleme gerektirir. GLB formatına dönüştürülecek.',
      requiresProcessing: true,
      category: 'processing'
    };
  }
  if (formatLower === 'ifc') {
    return {
      name: 'IFC',
      description: 'İşleme gerektirir. BIM dosyası GLB formatına dönüştürülecek.',
      requiresProcessing: true,
      category: 'processing'
    };
  }
  if (formatLower === 'las' || formatLower === 'laz') {
    return {
      name: 'LAS/LAZ',
      description: 'İşleme gerektirir. LiDAR point cloud verisi 3D Tiles formatına dönüştürülecek.',
      requiresProcessing: true,
      category: 'processing'
    };
  }
  if (formatLower === 'zip') {
    return {
      name: 'ZIP',
      description: 'İşleme gerektirir. ZIP içindeki dosyalar (OBJ, FBX, vb.) extract edilip işlenecek.',
      requiresProcessing: true,
      category: 'processing'
    };
  }
  
  return {
    name: format || 'Bilinmeyen',
    description: 'Format bilgisi mevcut değil.',
    requiresProcessing: true,
    category: 'processing'
  };
};

export const WorkspacePage: React.FC = () => {
  const { signOut, profile } = useAuth();
  const navigate = useNavigate();
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
  const [showViewerModal, setShowViewerModal] = useState(false);
  const [selectedAssetForViewer, setSelectedAssetForViewer] = useState<string | null>(null);
  const [viewerEmail, setViewerEmail] = useState('');
  const [viewerPin, setViewerPin] = useState('');
  const [creatingViewer, setCreatingViewer] = useState(false);
  const [viewers, setViewers] = useState<any[]>([]);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [deletingAsset, setDeletingAsset] = useState<string | null>(null);

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
    try {
      // Note: Function parameter is p_project_id to avoid ambiguity
      const { data, error } = await supabase.rpc('list_project_assets', { p_project_id: projectId });
      if (error) {
        console.error('loadAssets error:', error);
        setError(`Varlıklar alınamadı: ${error.message || 'Bilinmeyen hata'}`);
        return;
      }
      setAssets(data || []);
    } catch (err: any) {
      console.error('loadAssets exception:', err);
      setError(`Varlıklar alınamadı: ${err.message || 'Beklenmeyen hata'}`);
    }
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
        let timeoutId: NodeJS.Timeout;
        
        // Timeout: 5 dakika
        timeoutId = setTimeout(() => {
          xhr.abort();
          reject(new Error('Upload timeout: Dosya yükleme süresi aşıldı (5 dakika)'));
        }, 5 * 60 * 1000);

        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percent = Math.round((e.loaded / e.total) * 100);
            setUploadProgress(percent);
            console.log(`Upload progress: ${percent}%`);
          }
        });

        xhr.addEventListener('load', () => {
          clearTimeout(timeoutId);
          if (xhr.status >= 200 && xhr.status < 300) {
            console.log('Upload completed successfully');
            resolve();
          } else {
            console.error('Upload failed with status:', xhr.status, xhr.statusText);
            reject(new Error(`Upload failed with status ${xhr.status}: ${xhr.statusText || 'Unknown error'}`));
          }
        });

        xhr.addEventListener('error', () => {
          clearTimeout(timeoutId);
          console.error('Upload error event');
          reject(new Error('Upload failed: Network error'));
        });

        xhr.addEventListener('abort', () => {
          clearTimeout(timeoutId);
          console.error('Upload aborted');
          reject(new Error('Upload aborted'));
        });

        try {
          xhr.open('PUT', upload_url);
          // Headers ekle (Content-Type hariç, çünkü onu özel ayarlıyoruz)
          Object.entries(headers || {}).forEach(([k, v]) => {
            if (k.toLowerCase() !== 'content-type') {
              xhr.setRequestHeader(k, v);
            }
          });
          xhr.setRequestHeader('Content-Type', selectedFile.type || 'application/octet-stream');
          console.log('Starting upload to:', upload_url);
          xhr.send(selectedFile);
        } catch (err: any) {
          clearTimeout(timeoutId);
          console.error('Upload setup error:', err);
          reject(new Error(`Upload setup failed: ${err.message || 'Unknown error'}`));
        }
      });

      // Notify upload complete to trigger processing
      const uploadResult = await notifyUploadComplete(asset_id, assetCategory);
      
      const format = detectSourceFormat(selectedFile.name, selectedFile.type || '');
      const formatInfo = getFormatInfo(format);
      
      if (formatInfo.category === 'direct') {
        setMessage('Dosya yüklendi ve hazır! Doğrudan görüntülenebilir.');
      } else {
        setMessage('Dosya yüklendi ve işleme kuyruğuna eklendi. İşlem tamamlandığında bildirim alacaksınız.');
      }
      
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
      // 1. Kullanıcının organization'larını al
      const { data: orgs, error: orgsError } = await supabase.rpc('list_organizations');
      if (orgsError) throw orgsError;

      let orgId: string;

      // 2. Eğer organization yoksa, otomatik bir default organization oluştur
      if (!orgs || orgs.length === 0) {
        const defaultOrgName = 'My Organization';
        const defaultOrgSlug = 'my-organization';
        const { data: newOrg, error: createOrgError } = await supabase.rpc('create_organization', {
          p_name: defaultOrgName,
          p_slug: defaultOrgSlug,
          p_description: 'Default organization',
        });
        if (createOrgError) throw createOrgError;
        orgId = newOrg;
      } else {
        // İlk organization'ı kullan
        orgId = orgs[0].id;
      }

      // 3. Proje slug'ını oluştur
      const slug = newProjectName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      // 4. Projeyi organization ile oluştur (RPC fonksiyonu kullan)
      const { data: projectId, error: createError } = await supabase.rpc('create_project_with_org', {
        p_org_id: orgId,
        p_folder_id: null,
        p_name: newProjectName.trim(),
        p_slug: slug || `project-${Date.now()}`,
        p_description: newProjectDescription.trim() || null,
      });

      if (createError) throw createError;

      setMessage('Proje oluşturuldu.');
      setShowCreateProjectModal(false);
      setNewProjectName('');
      setNewProjectDescription('');
      await loadProjects();
      if (projectId) {
        setSelectedProject(projectId);
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

  // Viewer access is now handled by Cloudflare Functions, no backend API needed

  // Load viewers for project or asset
  const loadViewers = async (projectId: string, assetId?: string) => {
    setLoadingViewers(true);
    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Auth token bulunamadı.');

      const url = new URL('/api/viewer-access', window.location.origin);
      url.searchParams.set('project_id', projectId);
      if (assetId) {
        url.searchParams.set('asset_id', assetId);
      }

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Viewer listesi alınamadı');
      }

      const data = await res.json();
      setViewers(data.viewers || []);
    } catch (err: any) {
      console.error('Load viewers error:', err);
      setError('Viewer listesi alınamadı: ' + err.message);
    } finally {
      setLoadingViewers(false);
    }
  };

  // Create viewer access
  const handleCreateViewer = async () => {
    if (!selectedProject || !viewerEmail.trim() || !viewerPin.trim()) {
      setError('E-posta ve PIN gerekli');
      return;
    }

    if (!/^\d{4}$/.test(viewerPin)) {
      setError('PIN 4 haneli olmalıdır');
      return;
    }

    setCreatingViewer(true);
    setError(null);
    setMessage(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Auth token bulunamadı.');

      const res = await fetch('/api/viewer-access', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_id: selectedProject,
          asset_id: selectedAssetForViewer || null,
          email: viewerEmail.trim(),
          pin: viewerPin.trim(),
        }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Viewer erişimi oluşturulamadı');
      }

      const result = await res.json();
      setMessage(`Viewer erişimi oluşturuldu ve e-posta gönderildi: ${result.email}`);
      setViewerEmail('');
      setViewerPin('');
      await loadViewers(selectedProject, selectedAssetForViewer || undefined);
    } catch (err: any) {
      setError(err.message || 'Viewer erişimi oluşturulamadı');
    } finally {
      setCreatingViewer(false);
    }
  };

  // Delete viewer access
  const handleDeleteViewer = async (accessId: string) => {
    if (!confirm('Bu viewer erişimini silmek istediğinize emin misiniz?')) return;

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Auth token bulunamadı.');

      const url = new URL('/api/viewer-access', window.location.origin);
      url.searchParams.set('access_id', accessId);

      const res = await fetch(url.toString(), {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Viewer erişimi silinemedi');
      }

      setMessage('Viewer erişimi silindi');
      if (selectedProject) {
        await loadViewers(selectedProject, selectedAssetForViewer || undefined);
      }
    } catch (err: any) {
      setError(err.message || 'Viewer erişimi silinemedi');
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

  // Delete asset
  const handleDeleteAsset = async (assetId: string, assetName: string) => {
    if (!selectedProject) return;
    
    if (!confirm(`"${assetName}" dosyasını silmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz. Dosya R2'den ve tüm veritabanı kayıtlarından silinecektir.`)) {
      return;
    }

    setDeletingAsset(assetId);
    setError(null);
    setMessage(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Auth token bulunamadı.');

      const res = await fetch('/api/delete-asset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          project_id: selectedProject,
          asset_id: assetId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'Asset silinemedi');
      }

      const result = await res.json();
      if (result.errors && result.errors.length > 0) {
        setMessage(`Asset silindi, ancak bazı dosyalar depolamadan kaldırılamadı: ${result.errors.join(', ')}`);
      } else {
        setMessage('Asset ve tüm dosyalar başarıyla silindi.');
      }

      // Reload assets
      await loadAssets(selectedProject);
    } catch (err: any) {
      setError(err.message || 'Asset silinemedi.');
      console.error(err);
    } finally {
      setDeletingAsset(null);
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
      
      {/* Info Box */}
      {selectedProject && (
        <div className="mb-4 p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
            <div className="text-sm space-y-1">
              <p className="font-medium">Dosya Yükleme Hakkında</p>
              <ul className="list-disc list-inside space-y-1 text-blue-200/80 text-xs ml-2">
                <li><strong>Doğrudan görüntülenebilir:</strong> GLB, GLTF, GeoJSON, KML, PNG, JPEG - Anında kullanıma hazır</li>
                <li><strong>İşleme gerektirir:</strong> OBJ, FBX, IFC, LAS, LAZ, ZIP - Pipeline'da otomatik işlenir</li>
                <li><strong>ZIP dosyaları:</strong> İçindeki dosyalar otomatik extract edilip işlenir</li>
                <li><strong>Tekil Model:</strong> Küçük-orta ölçekli modeller → GLB formatına dönüştürülür</li>
                <li><strong>Büyük Alan:</strong> Şehir/kampüs/LiDAR → 3D Tiles formatına dönüştürülür</li>
              </ul>
            </div>
          </div>
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
                  {selectedProject ? (
                    <>
                      {assets.length} varlık
                      {assets.length > 0 && (
                        <>
                          {' • '}
                          {assets.filter(a => a.processing_status === 'completed').length} hazır
                          {assets.filter(a => a.processing_status === 'queued' || a.processing_status === 'processing').length > 0 && (
                            <> • {assets.filter(a => a.processing_status === 'queued' || a.processing_status === 'processing').length} işleniyor</>
                          )}
                        </>
                      )}
                    </>
                  ) : (
                    'Proje seçin'
                  )}
                </p>
              </div>
              <button
                onClick={() => setShowUploadModal(true)}
                disabled={!selectedProject || uploading}
                className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-emerald-500"
                title="3D modeller, coğrafi veriler ve görüntüler yükleyin"
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
                {assets.map((asset) => {
                  const format = detectSourceFormat(asset.name || '', asset.mime_type || '');
                  const formatInfo = getFormatInfo(format);
                  return (
                    <div
                      key={asset.id}
                      className="rounded-lg border border-gray-800 bg-gray-800/30 hover:bg-gray-800/50 p-4 transition-all group"
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          {getStatusIcon(asset.processing_status)}
                          <div className="flex-1 min-w-0">
                            <div className="font-medium truncate">{asset.name || asset.id}</div>
                            <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                              <span>{asset.mime_type || 'Bilinmeyen format'}</span>
                              {formatInfo.category === 'direct' && (
                                <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 text-[10px]">
                                  Direkt
                                </span>
                              )}
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
                          {asset.processing_status === 'queued' && (
                            <span className="text-xs text-yellow-400">
                              İşleme kuyruğunda bekleniyor...
                            </span>
                          )}
                          {asset.processing_status === 'processing' && (
                            <span className="text-xs text-blue-400">
                              İşleniyor, lütfen bekleyin...
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {asset.processing_status === 'completed' && (
                            <>
                              <button
                                onClick={() => navigate(`/viewer/${selectedProject}`)}
                                className="p-2 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 transition-colors"
                                title="Görüntüle"
                              >
                                <ExternalLink className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedAssetForViewer(asset.id);
                                  setShowViewerModal(true);
                                  void loadViewers(selectedProject!, asset.id);
                                }}
                                className="p-2 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors"
                                title="Viewer Erişimi Yönet"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleDeleteAsset(asset.id, asset.name || 'Dosya')}
                            disabled={deletingAsset === asset.id || asset.processing_status === 'processing'}
                            className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            title={
                              asset.processing_status === 'processing' 
                                ? 'İşleme devam ederken silinemez' 
                                : 'Sil (R2 ve veritabanından kalıcı olarak silinir)'
                            }
                          >
                            {deletingAsset === asset.id ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              <Trash2 className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
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
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
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
                <div className="space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-700 hover:border-emerald-500/50 hover:bg-gray-800/50 transition-all">
                    <input
                      type="radio"
                      name="category"
                      value="single_model"
                      checked={assetCategory === 'single_model'}
                      onChange={(e) => setAssetCategory(e.target.value as 'single_model')}
                      disabled={uploading}
                      className="w-4 h-4 mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="font-medium">Tekil Model</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Küçük-orta ölçekli 3D modeller (bina, obje, makine). GLB formatına dönüştürülür.
                      </div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-gray-700 hover:border-emerald-500/50 hover:bg-gray-800/50 transition-all">
                    <input
                      type="radio"
                      name="category"
                      value="large_area"
                      checked={assetCategory === 'large_area'}
                      onChange={(e) => setAssetCategory(e.target.value as 'large_area')}
                      disabled={uploading}
                      className="w-4 h-4 mt-0.5"
                    />
                    <div className="flex-1">
                      <div className="font-medium">Büyük Alan</div>
                      <div className="text-xs text-gray-400 mt-1">
                        Büyük ölçekli sahneler (şehir, kampüs, LiDAR). 3D Tiles formatına dönüştürülür.
                      </div>
                    </div>
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
                <div className="mt-2 text-xs text-gray-500">
                  <p className="mb-1"><strong>Desteklenen Formatlar:</strong></p>
                  <div className="grid grid-cols-2 gap-1 text-gray-400">
                    <div>• GLB/GLTF (direkt)</div>
                    <div>• GeoJSON (direkt)</div>
                    <div>• KML/KMZ (direkt)</div>
                    <div>• PNG/JPEG (direkt)</div>
                    <div>• OBJ (işleme)</div>
                    <div>• FBX (işleme)</div>
                    <div>• IFC (işleme)</div>
                    <div>• LAS/LAZ (işleme)</div>
                    <div>• ZIP (işleme)</div>
                  </div>
                  <p className="mt-2 text-gray-500">
                    <strong>Not:</strong> ZIP dosyaları içindeki OBJ/FBX gibi dosyalar otomatik olarak extract edilip işlenecektir.
                  </p>
                </div>
                {selectedFile && (() => {
                  const format = detectSourceFormat(selectedFile.name, selectedFile.type || '');
                  const formatInfo = getFormatInfo(format);
                  return (
                    <div className="mt-3 p-4 rounded-lg bg-gray-800/50 border border-gray-700">
                      <div className="flex items-center gap-2 mb-2">
                        <File className="w-4 h-4 text-emerald-500" />
                        <span className="text-sm font-medium truncate">{selectedFile.name}</span>
                      </div>
                      <div className="text-xs text-gray-400 flex items-center gap-3 mb-3">
                        <span>{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</span>
                        <span>•</span>
                        <span className={`px-2 py-0.5 rounded ${
                          formatInfo.category === 'direct' 
                            ? 'bg-emerald-500/20 text-emerald-400' 
                            : 'bg-yellow-500/20 text-yellow-400'
                        }`}>
                          {formatInfo.name}
                        </span>
                      </div>
                      <div className={`text-xs p-2 rounded ${
                        formatInfo.category === 'direct'
                          ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/20'
                          : 'bg-yellow-500/10 text-yellow-300 border border-yellow-500/20'
                      }`}>
                        <div className="font-medium mb-1">
                          {formatInfo.category === 'direct' ? '✓ Doğrudan Görüntülenebilir' : '⏳ İşleme Gerektirir'}
                        </div>
                        <div>{formatInfo.description}</div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Raw File Retention */}
              <div>
                <label className="block text-sm font-medium mb-2">Ham Dosya Saklama</label>
                <p className="text-xs text-gray-400 mb-3">
                  İşlenmiş dosyalar kalıcı olarak saklanır. Ham (orijinal) dosyalar için saklama süresini belirleyin.
                </p>
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
                    <p className="text-xs text-gray-500 mt-1">
                      Ham dosya belirtilen süre sonra otomatik olarak silinecektir. İşlenmiş dosya kalıcıdır.
                    </p>
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

      {/* Viewer Access Modal */}
      {showViewerModal && selectedProject && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 max-w-2xl w-full shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Eye className="w-5 h-5 text-blue-500" />
                Viewer Erişimi Yönetimi
              </h2>
              <button
                onClick={() => {
                  setShowViewerModal(false);
                  setSelectedAssetForViewer(null);
                  setViewerEmail('');
                  setViewerPin('');
                  setViewers([]);
                  setError(null);
                }}
                className="p-1.5 rounded-lg hover:bg-gray-800 text-gray-400 hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-6">
              {/* Add Viewer Form */}
              <div className="rounded-lg border border-gray-800 bg-gray-800/30 p-4">
                    <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                      <Plus className="w-4 h-4" />
                      Yeni Viewer Erişimi Oluştur
                    </h3>
                    <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium mb-2">E-posta Adresi *</label>
                    <input
                      type="email"
                      value={viewerEmail}
                      onChange={(e) => setViewerEmail(e.target.value)}
                      placeholder="viewer@example.com"
                      disabled={creatingViewer}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2">PIN (4 haneli) *</label>
                    <input
                      type="text"
                      value={viewerPin}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '').slice(0, 4);
                        setViewerPin(val);
                      }}
                      placeholder="1234"
                      maxLength={4}
                      disabled={creatingViewer}
                      className="w-full bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Viewer'a gönderilecek 4 haneli PIN. Örnek: {viewerEmail || 'example@mail.com'} + {viewerPin || '1234'}
                    </p>
                  </div>
                  <button
                    onClick={handleCreateViewer}
                    disabled={!viewerEmail.trim() || !viewerPin.trim() || creatingViewer}
                    className="w-full px-4 py-2.5 rounded-lg bg-blue-500 hover:bg-blue-400 text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {creatingViewer ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Oluşturuluyor...
                      </>
                    ) : (
                      <>
                        <Plus className="w-4 h-4" />
                        Viewer Erişimi Oluştur ve E-posta Gönder
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Viewer List */}
              <div className="rounded-lg border border-gray-800 bg-gray-800/30 p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium flex items-center gap-2">
                    <Users className="w-4 h-4" />
                    Mevcut Viewer Erişimleri
                  </h3>
                  <button
                    onClick={() => {
                      if (selectedProject) {
                        void loadViewers(selectedProject, selectedAssetForViewer || undefined);
                      }
                    }}
                    className="p-2 rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
                    disabled={loadingViewers}
                  >
                    <RefreshCw className={`w-4 h-4 ${loadingViewers ? 'animate-spin' : ''}`} />
                  </button>
                </div>

                {loadingViewers ? (
                  <div className="text-center py-8 text-gray-400">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    <p className="text-sm">Yükleniyor...</p>
                  </div>
                ) : viewers.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">Henüz viewer erişimi yok</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {viewers.map((viewer) => (
                      <div
                        key={viewer.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-gray-800/50 border border-gray-700"
                      >
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{viewer.email}</div>
                          <div className="text-xs text-gray-400 mt-1">
                            Oluşturulma: {new Date(viewer.created_at).toLocaleString('tr-TR')}
                            {viewer.last_accessed_at && (
                              <> • Son erişim: {new Date(viewer.last_accessed_at).toLocaleString('tr-TR')}</>
                            )}
                            {viewer.access_count > 0 && <> • {viewer.access_count} kez erişildi</>}
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteViewer(viewer.id)}
                          className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 transition-colors ml-2"
                          title="Sil"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

