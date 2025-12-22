import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../auth/AuthProvider';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import * as Cesium from 'cesium';
import { Lock, Loader2 } from 'lucide-react';

declare const CESIUM_BASE_URL: string;

type AssetMeta = {
  id: string;
  name: string;
  mime_type?: string;
  asset_key: string;
  asset_type?: 'tileset' | 'imagery' | 'other';
};

type SignedAsset = AssetMeta & { signed_url: string };

const setCesiumBase = () => {
  const base = typeof CESIUM_BASE_URL !== 'undefined' ? CESIUM_BASE_URL : '/cesium';
  // @ts-expect-error buildModuleUrl exists in Cesium namespace
  if (Cesium.buildModuleUrl) Cesium.buildModuleUrl.setBaseUrl(base);
};

export const CesiumViewerPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const { profile, user } = useAuth();
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const watermarkRef = useRef<(() => void) | null>(null);

  const [assets, setAssets] = useState<SignedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  // Viewer access PIN verification
  const viewerToken = searchParams.get('token');
  const [pinVerified, setPinVerified] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [viewerAccessInfo, setViewerAccessInfo] = useState<{ project_id: string; asset_id?: string; email: string } | null>(null);

  useEffect(() => {
    setCesiumBase();
  }, []);

  // Check if viewer access is required
  useEffect(() => {
    if (!projectId) return;
    
    if (!viewerToken) {
      // No token, check if user is authenticated and owns the project
      if (user && profile) {
        void checkProjectAccess(projectId);
      } else {
        setPinVerified(false);
      }
    } else {
      // Token provided, PIN verification required
      setPinVerified(null);
    }
  }, [viewerToken, user, profile, projectId]);

  const checkProjectAccess = async (pid: string) => {
    if (!user || !profile) {
      setPinVerified(false);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, owner_id')
        .eq('id', pid)
        .single();
      
      if (error || !data) {
        setPinVerified(false);
        return;
      }
      
      // If user owns the project, allow access
      if (data.owner_id === profile.id) {
        setPinVerified(true);
        void loadAndSignAssets(pid);
      } else {
        setPinVerified(false);
      }
    } catch (err) {
      console.error('Project access check error:', err);
      setPinVerified(false);
    }
  };

  const verifyPin = async () => {
    if (!viewerToken || !pinInput.trim() || !/^\d{4}$/.test(pinInput)) {
      setError('Lütfen 4 haneli bir PIN girin');
      return;
    }

    setVerifyingPin(true);
    setError(null);

    try {
      const res = await fetch('/api/verify-viewer-pin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: viewerToken,
          pin: pinInput.trim(),
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'PIN doğrulanamadı' }));
        throw new Error(errorData.error || 'PIN doğrulanamadı');
      }

      const data = await res.json();
      if (data.valid) {
        setPinVerified(true);
        setViewerAccessInfo({
          project_id: data.project_id,
          asset_id: data.asset_id,
          email: data.email,
        });
        void loadAndSignAssets(data.project_id, data.asset_id);
      } else {
        setError('Geçersiz PIN');
      }
    } catch (err: any) {
      setError(err.message || 'PIN doğrulanamadı');
    } finally {
      setVerifyingPin(false);
    }
  };

  useEffect(() => {
    if (!projectId || pinVerified !== true) return;
    // If no viewer token, load assets normally
    if (!viewerToken) {
      void loadAndSignAssets(projectId);
    }
  }, [projectId, pinVerified, viewerToken]);

  useEffect(() => {
    if (!viewerContainerRef.current || viewerRef.current) return;
    setCesiumBase();
    const viewer = new Cesium.Viewer(viewerContainerRef.current, {
      requestRenderMode: true,
      timeline: false,
      animation: false,
      homeButton: false,
      geocoder: false,
      fullscreenButton: false,
    });
    viewerRef.current = viewer;

    // Watermark
    const watermark = () => {
      const ctx = viewer.canvas.getContext('2d');
      if (!ctx) return;
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'white';
      ctx.font = '12px sans-serif';
      const text = `${profile?.email || user?.email || 'user'} | ${new Date().toISOString()}`;
      ctx.fillText(text, 12, viewer.canvas.height - 12);
      ctx.restore();
    };
    watermarkRef.current = watermark;
    viewer.scene.postRender.addEventListener(watermark);

    // Light hardening: disable right-click
    viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);

    return () => {
      if (watermarkRef.current) {
        viewer.scene.postRender.removeEventListener(watermarkRef.current);
      }
      viewer.destroy();
      viewerRef.current = null;
    };
  }, [profile, user]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || assets.length === 0) return;
    
    // Ensure viewer is fully initialized
    if (!viewer.cesiumWidget || !viewer.scene || !viewer.entities) {
      console.warn('Viewer not fully initialized yet');
      return;
    }
    
    // Additional check: ensure scene is ready
    if (!viewer.scene.globe || !viewer.scene.primitives) {
      console.warn('Scene not fully initialized yet');
      return;
    }

    const primitives: (Cesium.Cesium3DTileset | Cesium.Model | Cesium.DataSource)[] = [];
    const dataSources: Cesium.DataSource[] = [];

    (async () => {
      try {
        for (const asset of assets) {
          const mime = asset.mime_type?.toLowerCase() || '';
          const url = asset.signed_url;

          // 3D Tiles (B3DM, I3DM, PNTS, CMPT)
          if (
            mime === 'application/octet-stream' ||
            asset.asset_type === 'tileset' ||
            asset.name?.endsWith('.b3dm') ||
            asset.name?.endsWith('.i3dm') ||
            asset.name?.endsWith('.pnts') ||
            asset.name?.endsWith('.cmpt')
          ) {
            const tileset = await Cesium.Cesium3DTileset.fromUrl(url);
            viewer.scene.primitives.add(tileset);
            primitives.push(tileset);
            await viewer.zoomTo(tileset);
          }
          // glTF/GLB Models
          else if (mime === 'model/gltf-binary' || mime === 'model/gltf+json' || asset.name?.endsWith('.gltf') || asset.name?.endsWith('.glb')) {
            // Use Entity with modelGraphics - more reliable than Model.fromGltf
            try {
              const entity = viewer.entities.add({
                name: asset.name,
                model: {
                  uri: url,
                  minimumPixelSize: 128,
                  maximumScale: 20000,
                },
              });
              
              // Wait for model to load - Entity.modelGraphics doesn't have readyPromise
              // Instead, wait a bit and then zoom (Cesium will load model asynchronously)
              await new Promise(resolve => setTimeout(resolve, 100));
              
              // Try to zoom - if model isn't ready, Cesium will handle it
              try {
                await viewer.zoomTo(entity);
              } catch (zoomError) {
                // If zoom fails, model might still be loading - wait a bit more
                await new Promise(resolve => setTimeout(resolve, 500));
                await viewer.zoomTo(entity);
              }
            } catch (entityError: any) {
              console.error('Entity model load error:', entityError);
              // Fallback: try Model.fromGltf if available
              try {
                if (Cesium.Model && typeof Cesium.Model.fromGltf === 'function') {
                  const model = await Cesium.Model.fromGltf({ url });
                  viewer.scene.primitives.add(model);
                  primitives.push(model);
                  await model.readyPromise;
                  await viewer.zoomTo(model);
                } else {
                  throw new Error('Model.fromGltf is not available');
                }
              } catch (modelError: any) {
                console.error('Model.fromGltf error:', modelError);
                throw new Error(`Model yüklenemedi: ${entityError.message || modelError.message}`);
              }
            }
          }
          // GeoJSON
          else if (mime === 'application/geo+json' || mime === 'application/json' || asset.name?.endsWith('.geojson')) {
            const geoJson = await Cesium.GeoJsonDataSource.load(url);
            viewer.dataSources.add(geoJson);
            dataSources.push(geoJson);
            await viewer.zoomTo(geoJson);
          }
          // KML/KMZ
          else if (
            mime === 'application/vnd.google-earth.kml+xml' ||
            mime === 'application/vnd.google-earth.kmz' ||
            asset.name?.endsWith('.kml') ||
            asset.name?.endsWith('.kmz')
          ) {
            const kml = await Cesium.KmlDataSource.load(url);
            viewer.dataSources.add(kml);
            dataSources.push(kml);
            await viewer.zoomTo(kml);
          }
          // Imagery (PNG/JPEG)
          else if (mime.startsWith('image/') || asset.asset_type === 'imagery') {
            viewer.imageryLayers.addImageryProvider(
              new Cesium.UrlTemplateImageryProvider({ url })
            );
          }
        }
      } catch (err) {
        console.error('Cesium load error', err);
        setError('Cesium varlıkları yüklenemedi: ' + (err instanceof Error ? err.message : String(err)));
      }
    })();

    return () => {
      if (viewer && viewer.scene) {
        primitives.forEach((p) => {
          if (p instanceof Cesium.Cesium3DTileset || p instanceof Cesium.Model) {
            try {
              viewer.scene.primitives.remove(p);
            } catch (e) {
              console.warn('Error removing primitive:', e);
            }
          }
        });
        dataSources.forEach((ds) => {
          try {
            viewer.dataSources.remove(ds);
          } catch (e) {
            console.warn('Error removing data source:', e);
          }
        });
      }
    };
  }, [assets]);

  const loadAndSignAssets = async (pid: string, assetId?: string) => {
    setError(null);
    setLoading(true);
    try {
      // 1) Metadata from Supabase (no signed URLs)
      // If assetId is provided (viewer access), filter by asset
      let metas: AssetMeta[] = [];
      
      if (assetId) {
        // Viewer access: load specific asset
        const { data, error } = await supabase
          .from('project_assets')
          .select('id, name, mime_type, asset_key, asset_type')
          .eq('id', assetId)
          .eq('project_id', pid)
          .eq('processing_status', 'completed')
          .single();
        
        if (error) throw new Error(error.message);
        if (data) metas = [data];
      } else {
        // Owner access: load all assets
        const { data, error } = await supabase.rpc('list_viewer_assets', { p_project_id: pid });
        if (error) throw new Error(error.message);
        metas = data || [];
      }

      // 2) Fetch signed URL per asset via Cloudflare Function
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Auth token bulunamadı.');

      const signed: SignedAsset[] = [];
      for (const asset of metas) {
        // Use proxy endpoint for CORS support (especially for KML/GeoJSON that need CORS)
        // For large files (3D Tiles, GLB), we can still use signed URLs if CORS is configured
        const useProxy = asset.mime_type === 'application/vnd.google-earth.kml+xml' ||
                        asset.mime_type === 'application/vnd.google-earth.kmz' ||
                        asset.mime_type === 'application/geo+json' ||
                        asset.mime_type === 'application/json';
        
        if (useProxy) {
          // Use proxy endpoint for CORS support
          // Add token as query param since Cesium's fetch doesn't send Authorization header
          const proxyUrl = `/api/proxy-asset?project_id=${pid}&asset_key=${encodeURIComponent(asset.asset_key)}&token=${encodeURIComponent(token || '')}`;
          signed.push({ ...asset, signed_url: proxyUrl });
        } else {
          // Use signed URL for other files
          const res = await fetch('/api/signed-url', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              project_id: pid,
              asset_key: asset.asset_key,
              filename: asset.name,
            }),
          });
          if (!res.ok) throw new Error('Signed URL alınamadı');
          const { signed_url } = await res.json();
          signed.push({ ...asset, signed_url });
        }
      }
      setAssets(signed);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Varlıklar alınamadı.');
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  // Show PIN verification form if token is provided and not verified
  if (viewerToken && pinVerified === null) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-8">
            <div className="flex items-center gap-3 mb-6">
              <Lock className="w-8 h-8 text-blue-400" />
              <h2 className="text-2xl font-semibold">Viewer Erişimi</h2>
            </div>
            <p className="text-gray-300 mb-6">
              Bu içeriğe erişmek için PIN gereklidir. E-posta adresinize gönderilen PIN'i girin.
            </p>
            {error && (
              <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                {error}
              </div>
            )}
            <div className="space-y-4">
              <div>
                <label htmlFor="pin" className="block text-sm font-medium text-gray-300 mb-2">
                  PIN (4 haneli)
                </label>
                <input
                  id="pin"
                  type="text"
                  inputMode="numeric"
                  maxLength={4}
                  value={pinInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '');
                    setPinInput(val);
                    setError(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && pinInput.length === 4) {
                      void verifyPin();
                    }
                  }}
                  className="w-full px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white text-center text-2xl tracking-widest focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="0000"
                  autoFocus
                />
              </div>
              <button
                onClick={verifyPin}
                disabled={pinInput.length !== 4 || verifyingPin}
                className="w-full py-3 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white font-medium transition-colors flex items-center justify-center gap-2"
              >
                {verifyingPin ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Doğrulanıyor...
                  </>
                ) : (
                  'Erişim İste'
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show error if PIN verification failed or access denied
  if (pinVerified === false) {
    return (
      <div className="min-h-screen bg-black text-white flex items-center justify-center">
        <div className="max-w-md w-full mx-4">
          <div className="rounded-lg border border-red-500/20 bg-red-500/10 p-8 text-center">
            <Lock className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold mb-2">Erişim Reddedildi</h2>
            <p className="text-gray-300">
              Bu içeriğe erişim yetkiniz bulunmamaktadır.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="p-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Viewer</h1>
          <p className="text-sm text-gray-400">
            Proje: {viewerAccessInfo?.project_id || projectId}
            {viewerAccessInfo?.email && ` | Viewer: ${viewerAccessInfo.email}`}
          </p>
        </div>
        {loading && <div className="text-xs text-gray-400">Yükleniyor...</div>}
      </div>
      {error && <div className="px-4 text-sm text-red-400">{error}</div>}
      <div ref={viewerContainerRef} className="w-full h-[80vh]" />
    </div>
  );
};

