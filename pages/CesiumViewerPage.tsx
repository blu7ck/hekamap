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

// Map imagery providers - Open source and free APIs
const createMapProviders = () => {
  return {
    // OpenStreetMap - Free and open source
    openStreetMap: new Cesium.OpenStreetMapImageryProvider({
      url: 'https://a.tile.openstreetmap.org/',
    }),
    
    // OpenStreetMap with different styles
    openStreetMapHumanitarian: new Cesium.OpenStreetMapImageryProvider({
      url: 'https://{s}.tile.openstreetmap.fr/hot/',
    }),
    
    // CartoDB - Free tier available
    cartoDBPositron: new Cesium.UrlTemplateImageryProvider({
      url: 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',
      credit: '© OpenStreetMap contributors © CARTO',
    }),
    
    cartoDBDarkMatter: new Cesium.UrlTemplateImageryProvider({
      url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
      credit: '© OpenStreetMap contributors © CARTO',
    }),
    
    // Stamen Maps - Free
    stamenTerrain: new Cesium.UrlTemplateImageryProvider({
      url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/terrain/{z}/{x}/{y}{r}.png',
      credit: 'Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
    }),
    
    stamenToner: new Cesium.UrlTemplateImageryProvider({
      url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/toner/{z}/{x}/{y}{r}.png',
      credit: 'Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
    }),
    
    stamenWatercolor: new Cesium.UrlTemplateImageryProvider({
      url: 'https://stamen-tiles-{s}.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg',
      credit: 'Map tiles by Stamen Design, under CC BY 3.0. Data by OpenStreetMap, under ODbL.',
    }),
    
    // Esri World Imagery - Free tier
    esriWorldImagery: new Cesium.ArcGisMapServerImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer',
      credit: '© Esri',
    }),
    
    esriWorldStreetMap: new Cesium.ArcGisMapServerImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer',
      credit: '© Esri',
    }),
    
    esriWorldTopoMap: new Cesium.ArcGisMapServerImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer',
      credit: '© Esri',
    }),
    
    // Note: Bing, Google, Yandex require API keys and are not fully open source
    // They can be added if API keys are provided via environment variables
  };
};

export const CesiumViewerPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const { profile, user } = useAuth();
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const watermarkRef = useRef<(() => void) | null>(null);
  const [selectedMapProvider, setSelectedMapProvider] = useState<string>('openStreetMap');

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
    
    let viewer: Cesium.Viewer | null = null;
    try {
      // Disable Cesium Ion completely - use plain CesiumJS
      // Set terrain to Ellipsoid (no external requests)
      const terrainProvider = new Cesium.EllipsoidTerrainProvider();
      
      // Get map providers
      const mapProviders = createMapProviders();
      
      // Use OpenStreetMap as default (free and open source)
      const defaultImageryProvider = mapProviders.openStreetMap;
      
      viewer = new Cesium.Viewer(viewerContainerRef.current, {
        requestRenderMode: false, // Disable request render mode for better compatibility
        timeline: false,
        animation: false,
        homeButton: false,
        geocoder: false,
        fullscreenButton: false,
        baseLayerPicker: false, // We'll create our own layer picker
        terrainProvider: terrainProvider,
        imageryProvider: defaultImageryProvider,
      });
      
      // Remove all default imagery layers (they use Ion)
      viewer.imageryLayers.removeAll();
      
      // Add default OpenStreetMap layer
      viewer.imageryLayers.addImageryProvider(defaultImageryProvider);
      
      // Ensure no Ion token is set
      if (Cesium.Ion) {
        Cesium.Ion.defaultAccessToken = '';
      }
      
      // Store map providers for later use
      (viewer as any)._mapProviders = mapProviders;
      
      viewerRef.current = viewer;

      // Wait for viewer to be fully initialized
      const initViewer = async () => {
        // Wait for viewer to be completely ready - longer wait for stability
        await new Promise(resolve => setTimeout(resolve, 500));
        
        if (!viewer || viewer.isDestroyed()) return;
        
        // Ensure scene is ready
        if (!viewer.scene || !viewer.cesiumWidget) {
          console.warn('Viewer scene not ready');
          return;
        }
        
        // Ensure scene components are fully initialized
        if (!viewer.scene.globe || !viewer.scene.primitives) {
          console.warn('Scene components not ready');
          return;
        }
        
        // Ensure entities and dataSources are ready
        if (!viewer.entities || !viewer.dataSources) {
          console.warn('Viewer entities/dataSources not ready');
          return;
        }
        
        // Watermark
        const watermark = () => {
          if (!viewer || viewer.isDestroyed()) return;
          try {
            const ctx = viewer.canvas.getContext('2d');
            if (!ctx) return;
            ctx.save();
            ctx.globalAlpha = 0.25;
            ctx.fillStyle = 'white';
            ctx.font = '12px sans-serif';
            const text = `${profile?.email || user?.email || 'user'} | ${new Date().toISOString()}`;
            ctx.fillText(text, 12, viewer.canvas.height - 12);
            ctx.restore();
          } catch (e) {
            // Ignore watermark errors
          }
        };
        watermarkRef.current = watermark;
        
        if (!viewer.isDestroyed() && viewer.scene) {
          viewer.scene.postRender.addEventListener(watermark);
        }

        // Light hardening: disable right-click
        if (!viewer.isDestroyed() && viewer.cesiumWidget && viewer.cesiumWidget.screenSpaceEventHandler) {
          viewer.cesiumWidget.screenSpaceEventHandler.removeInputAction(Cesium.ScreenSpaceEventType.RIGHT_CLICK);
        }
      };
      
      void initViewer();
    } catch (initError) {
      console.error('Viewer initialization error:', initError);
    }

    return () => {
      try {
        if (viewer && !viewer.isDestroyed()) {
          if (watermarkRef.current && viewer.scene) {
            viewer.scene.postRender.removeEventListener(watermarkRef.current);
          }
          viewer.destroy();
        }
      } catch (cleanupError) {
        console.warn('Viewer cleanup error:', cleanupError);
      } finally {
        viewerRef.current = null;
        watermarkRef.current = null;
      }
    };
  }, [profile, user]);

  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewer || assets.length === 0) return;
    
    // Ensure viewer is fully initialized and not destroyed
    try {
      if (viewer.isDestroyed()) {
        console.warn('Viewer is destroyed');
        return;
      }
    } catch (e) {
      // isDestroyed might throw if viewer is in invalid state
      console.warn('Viewer state check failed:', e);
      return;
    }
    
    // Comprehensive initialization check
    if (!viewer.cesiumWidget) {
      console.warn('Viewer cesiumWidget not ready');
      return;
    }
    
    if (!viewer.scene) {
      console.warn('Viewer scene not ready');
      return;
    }
    
    if (!viewer.entities) {
      console.warn('Viewer entities not ready');
      return;
    }
    
    // Additional check: ensure scene components are ready
    if (!viewer.scene.globe) {
      console.warn('Scene globe not ready');
      return;
    }
    
    if (!viewer.scene.primitives) {
      console.warn('Scene primitives not ready');
      return;
    }
    
    if (!viewer.dataSources) {
      console.warn('Viewer dataSources not ready');
      return;
    }
    
    // Wait a bit more to ensure everything is stable
    const loadAssets = async () => {
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Re-check after delay
      if (!viewerRef.current || viewerRef.current.isDestroyed()) {
        console.warn('Viewer destroyed during wait');
        return;
      }
      
      const currentViewer = viewerRef.current;
      if (!currentViewer.scene || !currentViewer.entities || !currentViewer.dataSources) {
        console.warn('Viewer not ready after wait');
        return;
      }

      const primitives: (Cesium.Cesium3DTileset | Cesium.Model | Cesium.DataSource)[] = [];
      const dataSources: Cesium.DataSource[] = [];
      let isMounted = true;

      // Check if viewer is still valid before each operation
      const checkViewer = () => {
        if (!isMounted || !viewerRef.current) {
          throw new Error('Viewer unmounted');
        }
        try {
          if (viewerRef.current.isDestroyed()) {
            throw new Error('Viewer destroyed');
          }
        } catch (e) {
          throw new Error('Viewer in invalid state');
        }
        if (!viewerRef.current.cesiumWidget || !viewerRef.current.scene) {
          throw new Error('Viewer not initialized');
        }
      };

      try {
        for (const asset of assets) {
          checkViewer();
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
            checkViewer();
            const tileset = await Cesium.Cesium3DTileset.fromUrl(url);
            if (!isMounted || !viewerRef.current || viewerRef.current.isDestroyed()) return;
            viewer.scene.primitives.add(tileset);
            primitives.push(tileset);
            await viewer.zoomTo(tileset);
          }
          // glTF/GLB Models
          else if (mime === 'model/gltf-binary' || mime === 'model/gltf+json' || asset.name?.endsWith('.gltf') || asset.name?.endsWith('.glb')) {
            checkViewer();
            // Use Entity with modelGraphics - this is the recommended way for CesiumJS
            const entity = viewer.entities.add({
              name: asset.name,
              position: Cesium.Cartesian3.fromDegrees(0, 0, 0), // Default position at origin
              model: {
                uri: url,
                minimumPixelSize: 128,
                maximumScale: 20000,
                scale: 1.0,
                show: true,
              },
            });
            
            // Wait for model to load - Entity.modelGraphics loads asynchronously
            // We need to wait for the model to actually load before zooming
            let modelLoaded = false;
            let attempts = 0;
            const maxAttempts = 20; // 10 seconds max wait
            
            while (!modelLoaded && attempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 500));
              checkViewer();
              
              // Check if model is loaded by checking if entity has a modelGraphics
              const entityModel = viewer.entities.getById(entity.id)?.model;
              if (entityModel) {
                // Check if model is ready (if it has a ready property)
                try {
                  if ((entityModel as any).ready === true || (entityModel as any).readyPromise) {
                    modelLoaded = true;
                    break;
                  }
                } catch (e) {
                  // Model might be loading
                }
              }
              attempts++;
            }
            
            // Try to zoom to the entity
            try {
              // Always try zoomTo - it might work even if model isn't fully loaded
              await viewer.zoomTo(entity);
            } catch (zoomError) {
              // If zoom fails, fly to a default view
              console.warn('Zoom to entity failed, using default view:', zoomError);
              checkViewer();
              viewer.camera.flyTo({
                destination: Cesium.Cartesian3.fromDegrees(0, 0, 1000),
                orientation: {
                  heading: 0.0,
                  pitch: -Cesium.Math.PI_OVER_TWO,
                  roll: 0.0,
                },
              });
            }
          }
          // GeoJSON
          else if (mime === 'application/geo+json' || mime === 'application/json' || asset.name?.endsWith('.geojson')) {
            checkViewer();
            const geoJson = await Cesium.GeoJsonDataSource.load(url);
            checkViewer();
            viewer.dataSources.add(geoJson);
            dataSources.push(geoJson);
            
            // Wait for GeoJSON to fully load
            await new Promise(resolve => setTimeout(resolve, 300));
            checkViewer();
            
            // Try default zoomTo first (it handles bounding box automatically)
            try {
              await viewer.zoomTo(geoJson);
            } catch (zoomError) {
              // If zoomTo fails, try manual bounding box calculation
              console.warn('GeoJSON zoomTo failed, trying manual calculation:', zoomError);
              try {
                const entities = geoJson.entities.values;
                const positions: Cesium.Cartographic[] = [];
                
                for (let i = 0; i < entities.length; i++) {
                  const entity = entities[i];
                  
                  // Get position from entity
                  if (entity.position) {
                    const position = entity.position.getValue(viewer.clock.currentTime);
                    if (position) {
                      const cartographic = Cesium.Cartographic.fromCartesian(position);
                      if (cartographic) {
                        positions.push(cartographic);
                      }
                    }
                  }
                  
                  // Get positions from polygon/polyline
                  if (entity.polygon) {
                    const hierarchy = entity.polygon.hierarchy?.getValue(viewer.clock.currentTime);
                    if (hierarchy && hierarchy.positions) {
                      for (let j = 0; j < hierarchy.positions.length; j++) {
                        const cartographic = Cesium.Cartographic.fromCartesian(hierarchy.positions[j]);
                        if (cartographic) {
                          positions.push(cartographic);
                        }
                      }
                    }
                  }
                  
                  if (entity.polyline) {
                    const positionsArray = entity.polyline.positions?.getValue(viewer.clock.currentTime);
                    if (positionsArray) {
                      for (let j = 0; j < positionsArray.length; j++) {
                        const cartographic = Cesium.Cartographic.fromCartesian(positionsArray[j]);
                        if (cartographic) {
                          positions.push(cartographic);
                        }
                      }
                    }
                  }
                }
                
                // If we have positions, create a rectangle and zoom to it
                if (positions.length > 0) {
                  checkViewer();
                  const rectangle = Cesium.Rectangle.fromCartographicArray(positions);
                  
                  // Use Rectangle directly as destination - Cesium handles it automatically
                  viewer.camera.flyTo({
                    destination: rectangle,
                  });
                }
              } catch (manualZoomError) {
                console.error('Manual GeoJSON zoom failed:', manualZoomError);
              }
            }
          }
          // KML/KMZ
          else if (
            mime === 'application/vnd.google-earth.kml+xml' ||
            mime === 'application/vnd.google-earth.kmz' ||
            asset.name?.endsWith('.kml') ||
            asset.name?.endsWith('.kmz')
          ) {
            checkViewer();
            // Load KML with camera and canvas for proper initialization
            const kml = await Cesium.KmlDataSource.load(url, {
              camera: viewer.camera,
              canvas: viewer.canvas,
            });
            checkViewer();
            viewer.dataSources.add(kml);
            dataSources.push(kml);
            
            // Wait for KML to fully load and process
            await new Promise(resolve => setTimeout(resolve, 1000));
            checkViewer();
            
            // Try to zoom to the KML data source
            try {
              await viewer.zoomTo(kml);
            } catch (zoomError) {
              // If zoomTo fails, try to get bounding sphere from entities
              console.warn('KML zoomTo failed, trying bounding sphere:', zoomError);
              try {
                const entities = kml.entities.values;
                if (entities.length > 0) {
                  // Get bounding sphere from all entities
                  const boundingSpheres: Cesium.BoundingSphere[] = [];
                  for (let i = 0; i < entities.length; i++) {
                    const entity = entities[i];
                    if (entity.boundingSphere) {
                      boundingSpheres.push(entity.boundingSphere);
                    }
                  }
                  
                  if (boundingSpheres.length > 0) {
                    checkViewer();
                    const boundingSphere = Cesium.BoundingSphere.fromBoundingSpheres(boundingSpheres);
                    viewer.camera.flyTo({
                      destination: boundingSphere.center,
                      orientation: {
                        heading: 0.0,
                        pitch: -Cesium.Math.PI_OVER_TWO,
                        roll: 0.0,
                      },
                      complete: () => {
                        if (!isMounted || !viewerRef.current || viewerRef.current.isDestroyed()) return;
                        viewer.camera.flyTo({
                          destination: boundingSphere,
                        });
                      },
                    });
                  } else {
                    // Fallback: fly to a default location
                    viewer.camera.flyTo({
                      destination: Cesium.Cartesian3.fromDegrees(0, 0, 10000000),
                    });
                  }
                }
              } catch (fallbackError) {
                console.error('KML fallback zoom failed:', fallbackError);
              }
            }
          }
          // Imagery (PNG/JPEG)
          else if (mime.startsWith('image/') || asset.asset_type === 'imagery') {
            checkViewer();
            viewer.imageryLayers.addImageryProvider(
              new Cesium.UrlTemplateImageryProvider({ url })
            );
          }
        }
      } catch (err) {
        if (!isMounted || !viewerRef.current) return;
        console.error('Cesium load error', err);
        setError('Cesium varlıkları yüklenemedi: ' + (err instanceof Error ? err.message : String(err)));
      }
    };
    
    void loadAssets();

    return () => {
      isMounted = false;
      const currentViewer = viewerRef.current;
      if (currentViewer && !currentViewer.isDestroyed() && currentViewer.scene) {
        primitives.forEach((p) => {
          if (p instanceof Cesium.Cesium3DTileset || p instanceof Cesium.Model) {
            try {
              currentViewer.scene.primitives.remove(p);
            } catch (e) {
              console.warn('Error removing primitive:', e);
            }
          }
        });
        dataSources.forEach((ds) => {
          try {
            currentViewer.dataSources.remove(ds);
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

  // Map provider change handler
  const handleMapProviderChange = (providerKey: string) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;
    
    const mapProviders = createMapProviders();
    const provider = (mapProviders as any)[providerKey];
    
    if (!provider) {
      console.error('Map provider not found:', providerKey);
      return;
    }
    
    try {
      // Remove all existing imagery layers
      viewer.imageryLayers.removeAll();
      
      // Add new provider
      viewer.imageryLayers.addImageryProvider(provider);
      
      setSelectedMapProvider(providerKey);
    } catch (err) {
      console.error('Failed to change map provider:', err);
    }
  };

  const mapProviderOptions = [
    { key: 'openStreetMap', label: 'OpenStreetMap', description: 'Açık kaynak harita' },
    { key: 'openStreetMapHumanitarian', label: 'OpenStreetMap Humanitarian', description: 'İnsani yardım haritası' },
    { key: 'cartoDBPositron', label: 'CartoDB Positron', description: 'Açık renkli harita' },
    { key: 'cartoDBDarkMatter', label: 'CartoDB Dark Matter', description: 'Koyu renkli harita' },
    { key: 'stamenTerrain', label: 'Stamen Terrain', description: 'Topografik harita' },
    { key: 'stamenToner', label: 'Stamen Toner', description: 'Siyah-beyaz harita' },
    { key: 'stamenWatercolor', label: 'Stamen Watercolor', description: 'Sulu boya harita' },
    { key: 'esriWorldImagery', label: 'Esri World Imagery', description: 'Uydu görüntüsü' },
    { key: 'esriWorldStreetMap', label: 'Esri World Street Map', description: 'Sokak haritası' },
    { key: 'esriWorldTopoMap', label: 'Esri World Topo Map', description: 'Topografik harita' },
  ];

  return (
    <div className="min-h-screen bg-black text-white flex flex-col">
      <div className="p-4 flex items-center justify-between border-b border-gray-800">
        <div>
          <h1 className="text-2xl font-semibold">Viewer</h1>
          <p className="text-sm text-gray-400">
            Proje: {viewerAccessInfo?.project_id || projectId}
            {viewerAccessInfo?.email && ` | Viewer: ${viewerAccessInfo.email}`}
          </p>
        </div>
        <div className="flex items-center gap-4">
          {loading && <div className="text-xs text-gray-400">Yükleniyor...</div>}
          <div className="relative">
            <select
              value={selectedMapProvider}
              onChange={(e) => handleMapProviderChange(e.target.value)}
              className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {mapProviderOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      {error && <div className="px-4 py-2 text-sm text-red-400 bg-red-500/10 border-b border-red-500/20">{error}</div>}
      <div ref={viewerContainerRef} className="flex-1 w-full" style={{ minHeight: 'calc(100vh - 120px)' }} />
    </div>
  );
};

