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
  asset_category?: string | null;
};

type SignedAsset = AssetMeta & { signed_url: string };

type LayerType = 'kml' | 'geojson' | 'tileset' | 'model' | 'imagery';

type ViewerLayer = {
  id: string;
  name: string;
  type: LayerType;
  visible: boolean;
  opacity: number; // 0..1
};

type Mode = 'view' | 'edit';

type ActiveTool =
  | 'none'
  | 'measure-distance'
  | 'measure-area'
  | 'draw-point'
  | 'draw-line'
  | 'draw-polygon';

const setCesiumBase = () => {
  const base = typeof CESIUM_BASE_URL !== 'undefined' ? CESIUM_BASE_URL : '/cesium';
  const baseUrl = base.endsWith('/') ? base : `${base}/`;
  
  // Set base URL for Cesium asset loading
  try {
    if (Cesium.buildModuleUrl && typeof (Cesium.buildModuleUrl as any).setBaseUrl === 'function') {
      (Cesium.buildModuleUrl as any).setBaseUrl(baseUrl);
    }
  } catch (e) {
    // Ignore if setBaseUrl is not available
  }
  
  // Also set global for workers that read self.CESIUM_BASE_URL
  if (typeof window !== 'undefined') {
    (window as any).CESIUM_BASE_URL = baseUrl;
  }
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
    } as any),
    
    esriWorldStreetMap: new Cesium.ArcGisMapServerImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer',
      credit: '© Esri',
    } as any),
    
    esriWorldTopoMap: new Cesium.ArcGisMapServerImageryProvider({
      url: 'https://services.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer',
      credit: '© Esri',
    } as any),
    
    // Note: Bing, Google, Yandex require API keys and are not fully open source
    // They can be added if API keys are provided via environment variables
  };
};

export const CesiumViewerPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const { profile, user } = useAuth();
  const editModeParam = searchParams.get('edit') === 'true';
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const watermarkRef = useRef<(() => void) | null>(null);
  const [selectedMapProvider, setSelectedMapProvider] = useState<string>('openStreetMap');
  const layerHandlesRef = useRef<Record<string, { type: LayerType; handle: any }>>({});
  const drawingHandlerRef = useRef<Cesium.ScreenSpaceEventHandler | null>(null);
  const drawingEntitiesRef = useRef<Cesium.Entity[]>([]);
  const tempPositionsRef = useRef<Cesium.Cartesian3[]>([]);
  const sketchEntityRef = useRef<Cesium.Entity | null>(null);

  const [assets, setAssets] = useState<SignedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [layers, setLayers] = useState<ViewerLayer[]>([]);
  const [mode, setMode] = useState<Mode>(editModeParam ? 'edit' : 'view');
  const [activeTool, setActiveTool] = useState<ActiveTool>('none');
  const [measureResult, setMeasureResult] = useState<string | null>(null);

  const canEdit =
    (profile?.role === 'owner' || profile?.role === 'admin' || profile?.role === 'moderator') &&
    !searchParams.get('token');

  const clearLayerHandles = (viewer?: Cesium.Viewer | null) => {
    const currentViewer = viewer ?? viewerRef.current;
    if (!currentViewer) return;

    const entries = Object.entries(layerHandlesRef.current) as Array<
      [string, { type: LayerType; handle: any }]
    >;

    entries.forEach(([id, info]) => {
      try {
        if (info.type === 'tileset' && currentViewer.scene?.primitives?.contains(info.handle)) {
          currentViewer.scene.primitives.remove(info.handle);
        } else if (
          (info.type === 'kml' || info.type === 'geojson') &&
          currentViewer.dataSources?.contains(info.handle)
        ) {
          currentViewer.dataSources.remove(info.handle, true);
        } else if (info.type === 'model') {
          currentViewer.entities.remove(info.handle);
        } else if (info.type === 'imagery') {
          currentViewer.imageryLayers.remove(info.handle);
        }
      } catch (e) {
        console.warn('Layer cleanup error for', id, e);
      }
    });
    layerHandlesRef.current = {};
    setLayers([]);
  };

  const applyLayerVisibility = (layerId: string, visible: boolean) => {
    const viewer = viewerRef.current;
    const info = layerHandlesRef.current[layerId];
    if (!viewer || !info) return;

    try {
      if (info.type === 'tileset') {
        info.handle.show = visible;
      } else if (info.type === 'kml' || info.type === 'geojson') {
        info.handle.show = visible;
      } else if (info.type === 'model') {
        info.handle.show = visible;
      } else if (info.type === 'imagery') {
        info.handle.show = visible;
      }
    } catch (err) {
      console.warn('Layer visibility update failed:', err);
    }
  };

  const applyLayerOpacity = (layerId: string, opacity: number) => {
    const viewer = viewerRef.current;
    const info = layerHandlesRef.current[layerId];
    if (!viewer || !info) return;

    try {
      if (info.type === 'tileset') {
        info.handle.style = new Cesium.Cesium3DTileStyle({
          color: `color('white', ${opacity.toFixed(2)})`,
        });
      } else if (info.type === 'model') {
        if (info.handle.model) {
          info.handle.model.color = new Cesium.ConstantProperty(
            Cesium.Color.WHITE.withAlpha(opacity)
          );
        }
      } else if (info.type === 'kml' || info.type === 'geojson') {
        // Best effort: apply alpha to known graphics
        const ds = info.handle as Cesium.DataSource;
        ds.entities?.values?.forEach((entity) => {
          if (entity.billboard && entity.billboard.color) {
            entity.billboard.color = new Cesium.ConstantProperty(
              Cesium.Color.WHITE.withAlpha(opacity)
            );
          }
          if (entity.point && entity.point.color) {
            entity.point.color = new Cesium.ConstantProperty(
              Cesium.Color.WHITE.withAlpha(opacity)
            );
          }
          if (entity.polyline && entity.polyline.material) {
            entity.polyline.material = new Cesium.ColorMaterialProperty(
              Cesium.Color.WHITE.withAlpha(opacity)
            );
          }
          if (entity.polygon && entity.polygon.material) {
            entity.polygon.material = new Cesium.ColorMaterialProperty(
              Cesium.Color.WHITE.withAlpha(opacity)
            );
          }
        });
      } else if (info.type === 'imagery') {
        info.handle.alpha = opacity;
      }
    } catch (err) {
      console.warn('Layer opacity update failed:', err);
    }
  };

  const toggleLayerVisibility = (layerId: string, visible: boolean) => {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, visible } : l)));
    applyLayerVisibility(layerId, visible);
  };

  const changeLayerOpacity = (layerId: string, opacity: number) => {
    setLayers((prev) => prev.map((l) => (l.id === layerId ? { ...l, opacity } : l)));
    applyLayerOpacity(layerId, opacity);
  };

  const stopDrawingTool = () => {
    const viewer = viewerRef.current;
    if (drawingHandlerRef.current) {
      drawingHandlerRef.current.destroy();
      drawingHandlerRef.current = null;
    }
    if (viewer && sketchEntityRef.current) {
      viewer.entities.remove(sketchEntityRef.current);
    }
    sketchEntityRef.current = null;
    tempPositionsRef.current = [];
    setActiveTool('none');
  };

  const clearDrawings = () => {
    const viewer = viewerRef.current;
    if (!viewer) return;
    drawingEntitiesRef.current.forEach((ent) => {
      try {
        viewer.entities.remove(ent);
      } catch (e) {
        console.warn('Draw entity remove error', e);
      }
    });
    drawingEntitiesRef.current = [];
  };

  const computeDistanceKm = (positions: Cesium.Cartographic[]) => {
    if (positions.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < positions.length; i++) {
      const g = new Cesium.EllipsoidGeodesic(positions[i - 1], positions[i]);
      total += g.surfaceDistance;
    }
    return total / 1000;
  };

  // Spherical polygon area approximation (km²)
  const computeAreaKm2 = (positions: Cesium.Cartographic[]) => {
    if (positions.length < 3) return 0;
    let total = 0;
    for (let i = 0; i < positions.length; i++) {
      const p1 = positions[i];
      const p2 = positions[(i + 1) % positions.length];
      total += (p2.longitude - p1.longitude) * (2 + Math.sin(p1.latitude) + Math.sin(p2.latitude));
    }
    const areaMeters = Math.abs(total) * (Math.pow(Cesium.Ellipsoid.WGS84.maximumRadius, 2) / 2);
    return areaMeters / 1_000_000;
  };

  const formatNumber = (value: number, unit: string) => {
    if (value >= 1000) return `${value.toFixed(1)} ${unit}`;
    if (value >= 1) return `${value.toFixed(2)} ${unit}`;
    return `${value.toFixed(3)} ${unit}`;
  };

  const startTool = (tool: ActiveTool) => {
    const viewer = viewerRef.current;
    if (!viewer || viewer.isDestroyed()) return;

    // Reset current tool
    stopDrawingTool();
    setMeasureResult(null);

    if (tool === 'none') return;

    setActiveTool(tool);
    tempPositionsRef.current = [];

    const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
    drawingHandlerRef.current = handler;

    const addPoint = (position: Cesium.Cartesian3) => {
      const entity = viewer.entities.add({
        position,
        point: { pixelSize: 8, color: Cesium.Color.CYAN },
      });
      drawingEntitiesRef.current.push(entity);
    };

    const updateSketch = () => {
      const positions = tempPositionsRef.current;
      if (!positions || positions.length === 0) return;

      if (sketchEntityRef.current && viewer.entities.contains(sketchEntityRef.current)) {
        viewer.entities.remove(sketchEntityRef.current);
      }

      if (tool === 'draw-point') {
        const entity = viewer.entities.add({
          position: positions[positions.length - 1],
          point: { pixelSize: 10, color: Cesium.Color.YELLOW },
        });
        sketchEntityRef.current = entity;
      } else if (tool === 'draw-line' || tool === 'measure-distance') {
        const entity = viewer.entities.add({
          polyline: {
            positions,
            width: 3,
            material: Cesium.Color.YELLOW,
          },
        });
        sketchEntityRef.current = entity;
      } else if (tool === 'draw-polygon' || tool === 'measure-area') {
        if (positions.length < 3) return;
        const entity = viewer.entities.add({
          polygon: {
            hierarchy: positions,
            material: Cesium.Color.YELLOW.withAlpha(0.3),
            outline: true,
            outlineColor: Cesium.Color.YELLOW,
          },
        });
        sketchEntityRef.current = entity;
      }
    };

    const finalizeMeasurement = () => {
      const cartos = tempPositionsRef.current.map((c) => Cesium.Cartographic.fromCartesian(c));
      if (tool === 'measure-distance' && cartos.length >= 2) {
        const km = computeDistanceKm(cartos);
        setMeasureResult(`Mesafe: ${formatNumber(km, 'km')}`);
      } else if (tool === 'measure-area' && cartos.length >= 3) {
        const km2 = computeAreaKm2(cartos);
        setMeasureResult(`Alan: ${formatNumber(km2, 'km²')}`);
      }
    };

    handler.setInputAction((click) => {
      const earthPosition =
        viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid) ||
        viewer.scene.pickPosition(click.position);
      if (!earthPosition) return;

      tempPositionsRef.current.push(earthPosition);

      if (tool === 'draw-point') {
        addPoint(earthPosition);
        setMeasureResult('Nokta eklendi');
        stopDrawingTool();
        return;
      }

      updateSketch();
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

    const finish = () => {
      if (tool === 'draw-line' || tool === 'draw-polygon') {
        if (sketchEntityRef.current) {
          drawingEntitiesRef.current.push(sketchEntityRef.current);
          sketchEntityRef.current = null;
        }
        setMeasureResult('Çizim kaydedildi');
      } else if (tool === 'measure-distance' || tool === 'measure-area') {
        finalizeMeasurement();
      }
      stopDrawingTool();
    };

    handler.setInputAction(finish, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
    handler.setInputAction(finish, Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK);
  };

  // View moduna dönünce aktif araçları kapat
  useEffect(() => {
    if (mode === 'view') {
      stopDrawingTool();
    }
  }, [mode]);
  
  // Viewer access PIN verification
  const viewerToken = searchParams.get('token');
  const [pinVerified, setPinVerified] = useState<boolean | null>(null);
  const [pinInput, setPinInput] = useState('');
  const [verifyingPin, setVerifyingPin] = useState(false);
  const [viewerAccessInfo, setViewerAccessInfo] = useState<{ project_id: string; asset_id?: string; email: string } | null>(null);
  const [modelViewerReady, setModelViewerReady] = useState(false);

  useEffect(() => {
    setCesiumBase();
  }, []);

  // Load model-viewer web component when needed
  useEffect(() => {
    const existing = document.querySelector('script[data-model-viewer]');
    if (existing) {
      setModelViewerReady(true);
      return;
    }
    // Try multiple CDNs for better reliability
    const cdnUrls = [
      'https://unpkg.com/@google/model-viewer@3.4.0/dist/model-viewer.min.js',
      'https://cdn.jsdelivr.net/npm/@google/model-viewer@3.4.0/dist/model-viewer.min.js',
      'https://unpkg.com/@google/model-viewer/dist/model-viewer.min.js',
    ];
    
    let currentIndex = 0;
    const tryLoadScript = () => {
      if (currentIndex >= cdnUrls.length) {
        console.warn('model-viewer script failed to load from all CDNs');
        return;
      }
      
      const script = document.createElement('script');
      script.src = cdnUrls[currentIndex];
      script.async = true;
      script.dataset.modelViewer = 'true';
      script.onload = () => {
        setModelViewerReady(true);
        console.log('model-viewer loaded from:', cdnUrls[currentIndex]);
      };
      script.onerror = () => {
        currentIndex++;
        tryLoadScript();
      };
      document.head.appendChild(script);
    };
    
    tryLoadScript();
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
        // imageryProvider not in type defs of this build; add manually after init
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
      
      // Disable default double-click zoom to avoid conflicts with drawing tools
      viewer.cesiumWidget?.screenSpaceEventHandler?.removeInputAction(
        Cesium.ScreenSpaceEventType.LEFT_DOUBLE_CLICK
      );
      
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
        stopDrawingTool();
        clearDrawings();
        clearLayerHandles(viewer);
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
    if (!viewer) return;
    if (assets.length === 0) {
      clearLayerHandles(viewer);
      return;
    }

    let isMounted = true;

    const ready = () => {
      try {
        if (!viewerRef.current || viewerRef.current.isDestroyed()) return false;
        if (!viewerRef.current.scene || !viewerRef.current.dataSources || !viewerRef.current.entities)
          return false;
        return true;
      } catch (e) {
        console.warn('Viewer readiness check failed', e);
        return false;
      }
    };

    const loadAssets = async () => {
      await new Promise((resolve) => setTimeout(resolve, 150));
      if (!ready()) return;

      clearLayerHandles(viewer);
      const nextLayers: ViewerLayer[] = [];

      try {
        for (const asset of assets) {
          if (!isMounted || !ready()) break;
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
            if (!ready()) break;
            viewer.scene.primitives.add(tileset);
            layerHandlesRef.current[asset.id] = { type: 'tileset', handle: tileset };
            nextLayers.push({ id: asset.id, name: asset.name, type: 'tileset', visible: true, opacity: 1 });
            if (!viewer.isDestroyed() && viewer.camera) {
              try {
                await viewer.zoomTo(tileset);
              } catch (zoomError: any) {
                if (!zoomError?.message?.includes('destroyed')) {
                  console.warn('Tileset zoomTo failed:', zoomError);
                }
              }
            }
          }
          // glTF/GLB Models
          else if (
            mime === 'model/gltf-binary' ||
            mime === 'model/gltf+json' ||
            asset.name?.endsWith('.gltf') ||
            asset.name?.endsWith('.glb')
          ) {
            const entity = viewer.entities.add({
              name: asset.name,
              position: Cesium.Cartesian3.fromDegrees(0, 0, 0),
              model: {
                uri: url,
                minimumPixelSize: 128,
                maximumScale: 20000,
                scale: 1.0,
                show: true,
              },
            });

            let attempts = 0;
            const maxAttempts = 20;
            while (attempts < maxAttempts && ready()) {
              await new Promise((resolve) => setTimeout(resolve, 500));
              const entityModel = viewer.entities.getById(entity.id)?.model;
              if (entityModel && ((entityModel as any).ready === true || (entityModel as any).readyPromise)) {
                break;
              }
              attempts++;
            }

            if (!ready()) break;
            try {
              if (!viewer.isDestroyed() && viewer.camera) {
                await viewer.zoomTo(entity);
              }
            } catch (zoomError: any) {
              if (zoomError?.message?.includes('destroyed')) {
                // Viewer was destroyed, skip zoom
                break;
              }
              console.warn('Zoom to entity failed, using default view:', zoomError);
              if (!viewer.isDestroyed() && viewer.camera) {
                try {
                  viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(0, 0, 1000),
                    orientation: {
                      heading: 0.0,
                      pitch: -Cesium.Math.PI_OVER_TWO,
                      roll: 0.0,
                    },
                  });
                } catch (e) {
                  // Ignore camera errors if viewer is destroyed
                }
              }
            }

            layerHandlesRef.current[asset.id] = { type: 'model', handle: entity };
            nextLayers.push({ id: asset.id, name: asset.name, type: 'model', visible: true, opacity: 1 });
          }
          // GeoJSON
          else if (mime === 'application/geo+json' || mime === 'application/json' || asset.name?.endsWith('.geojson')) {
            const geoJson = await Cesium.GeoJsonDataSource.load(url);
            if (!ready()) break;
            viewer.dataSources.add(geoJson);
            layerHandlesRef.current[asset.id] = { type: 'geojson', handle: geoJson };
            nextLayers.push({ id: asset.id, name: asset.name, type: 'geojson', visible: true, opacity: 1 });

            await new Promise((resolve) => setTimeout(resolve, 300));
            if (!ready()) break;
            try {
              if (!viewer.isDestroyed() && viewer.camera) {
                await viewer.zoomTo(geoJson);
              }
            } catch (zoomError: any) {
              if (zoomError?.message?.includes('destroyed')) {
                // Viewer was destroyed, skip zoom
                break;
              }
              console.warn('GeoJSON zoomTo failed, trying manual calculation:', zoomError);
              if (!ready()) break;
              try {
                const entities = geoJson.entities.values;
                const positions: Cesium.Cartographic[] = [];

                for (let i = 0; i < entities.length; i++) {
                  if (!ready()) break;
                  const entity = entities[i];

                  if (entity.position) {
                    const position = entity.position.getValue(viewer.clock.currentTime);
                    if (position) {
                      positions.push(Cesium.Cartographic.fromCartesian(position));
                    }
                  }

                  if (entity.polygon) {
                    const hierarchy = entity.polygon.hierarchy?.getValue(viewer.clock.currentTime);
                    if (hierarchy?.positions) {
                      hierarchy.positions.forEach((p: Cesium.Cartesian3) => {
                        positions.push(Cesium.Cartographic.fromCartesian(p));
                      });
                    }
                  }

                  if (entity.polyline) {
                    const posArr = entity.polyline.positions?.getValue(viewer.clock.currentTime);
                    if (posArr) {
                      posArr.forEach((p: Cesium.Cartesian3) => {
                        positions.push(Cesium.Cartographic.fromCartesian(p));
                      });
                    }
                  }
                }

                if (positions.length > 0 && !viewer.isDestroyed() && viewer.camera) {
                  const rectangle = Cesium.Rectangle.fromCartographicArray(positions);
                  try {
                    viewer.camera.flyTo({ destination: rectangle });
                  } catch (e) {
                    // Ignore camera errors if viewer is destroyed
                  }
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
            const kml = await Cesium.KmlDataSource.load(url, { camera: viewer.camera, canvas: viewer.canvas });
            if (!ready()) break;
            viewer.dataSources.add(kml);
            layerHandlesRef.current[asset.id] = { type: 'kml', handle: kml };
            nextLayers.push({ id: asset.id, name: asset.name, type: 'kml', visible: true, opacity: 1 });

            await new Promise((resolve) => setTimeout(resolve, 1000));
            if (!ready()) break;
            try {
              if (!viewer.isDestroyed() && viewer.camera) {
                await viewer.zoomTo(kml);
              }
            } catch (zoomError: any) {
              if (zoomError?.message?.includes('destroyed')) {
                // Viewer was destroyed, skip zoom
                break;
              }
              console.warn('KML zoomTo failed, using default fallback:', zoomError);
              if (!viewer.isDestroyed() && viewer.camera) {
                try {
                  viewer.camera.flyTo({ destination: Cesium.Cartesian3.fromDegrees(0, 0, 10_000_000) });
                } catch (e) {
                  // Ignore camera errors if viewer is destroyed
                }
              }
            }
          }
          // Imagery (PNG/JPEG)
          else if (mime.startsWith('image/') || asset.asset_type === 'imagery') {
            const layer = viewer.imageryLayers.addImageryProvider(
              new Cesium.SingleTileImageryProvider({ url })
            );
            layerHandlesRef.current[asset.id] = { type: 'imagery', handle: layer };
            nextLayers.push({ id: asset.id, name: asset.name, type: 'imagery', visible: true, opacity: 1 });
          }
        }

        if (isMounted) {
          setLayers(nextLayers);
        }
      } catch (err) {
        if (!isMounted) return;
        console.error('Cesium load error', err);
        setError('Cesium varlıkları yüklenemedi: ' + (err instanceof Error ? err.message : String(err)));
      }
    };

    void loadAssets();

    return () => {
      isMounted = false;
      clearLayerHandles(viewerRef.current ?? viewer);
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
          .select('id, name, mime_type, asset_key, asset_type, asset_category')
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
        const mime = asset.mime_type?.toLowerCase() || '';
        const name = asset.name?.toLowerCase() || '';
        const isGlb = name.endsWith('.glb') || name.endsWith('.gltf') || mime.includes('gltf');
        
        // Use proxy endpoint ONLY for text-based formats that Cesium fetches directly:
        // - KML/GeoJSON (Cesium fetches directly and needs CORS)
        // GLB/GLTF files should use signed URLs (R2 CORS configured) because:
        // 1. They are binary files and proxy may corrupt them
        // 2. Cesium can load them directly from signed URLs if CORS is configured
        // 3. Model-viewer can also load from signed URLs
        const useProxy = asset.mime_type === 'application/vnd.google-earth.kml+xml' ||
                        asset.mime_type === 'application/vnd.google-earth.kmz' ||
                        asset.mime_type === 'application/geo+json' ||
                        (asset.mime_type === 'application/json' && !isGlb);
        
        if (useProxy) {
          // Use proxy endpoint for CORS support (text-based formats only)
          // Add token as query param since Cesium's fetch doesn't send Authorization header
          const proxyUrl = `/api/proxy-asset?project_id=${pid}&asset_key=${encodeURIComponent(asset.asset_key)}&token=${encodeURIComponent(token || '')}`;
          signed.push({ ...asset, signed_url: proxyUrl });
        } else {
          // Use signed URL for binary files (GLB/GLTF, images, 3D tiles, etc.)
          // R2 bucket should have CORS configured for these to work
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

  // Check if we should use model-viewer: GLB/GLTF files that user selected "Model" mode
  // We check by file extension and metadata (viewing_mode stored in asset metadata)
  // For now, use model-viewer if single GLB/GLTF asset (can be enhanced with metadata later)
  const modelViewerAsset = assets.find((a) => {
    const name = a.name?.toLowerCase() || '';
    const mime = a.mime_type?.toLowerCase() || '';
    const isGlb = name.endsWith('.glb') || name.endsWith('.gltf') || mime.includes('gltf');
    // Use model-viewer for GLB/GLTF if single asset (user choice stored in metadata later)
    return isGlb && assets.length === 1;
  });
  
  if (modelViewerAsset) {
    return (
      <div className="min-h-screen bg-black text-white flex flex-col">
        <div className="p-4 border-b border-gray-800 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Model Viewer</h1>
            <p className="text-sm text-gray-400">
              Proje: {viewerAccessInfo?.project_id || projectId} • {modelViewerAsset.name}
            </p>
          </div>
          {!modelViewerReady && <div className="text-xs text-gray-400">Viewer yükleniyor...</div>}
        </div>
        <div className="flex-1 bg-black flex items-center justify-center p-4">
          {/* @ts-ignore model-viewer is a web component */}
          <model-viewer
            style={{ width: '100%', height: '80vh', maxHeight: 'calc(100vh - 140px)' }}
            src={modelViewerAsset.signed_url}
            camera-controls
            autoplay
            exposure="1"
            shadow-intensity="0.8"
            ar
            ar-modes="webxr scene-viewer quick-look"
            auto-rotate
            interaction-prompt="when-focused"
            poster=""
            loading="eager"
          />
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
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 mb-1">Harita sağlayıcısı</span>
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
      <div className="px-4 py-3 border-b border-gray-800 flex flex-wrap gap-3 items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">Mod:</span>
          <button
            onClick={() => setMode('view')}
            className={`px-3 py-2 rounded-lg text-sm border ${
              mode === 'view'
                ? 'bg-blue-600 border-blue-500'
                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
            }`}
          >
            Görüntüle
          </button>
          <button
            onClick={() => canEdit && setMode('edit')}
            disabled={!canEdit}
            className={`px-3 py-2 rounded-lg text-sm border ${
              mode === 'edit'
                ? 'bg-blue-600 border-blue-500'
                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
            } ${!canEdit ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Düzenle
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => startTool('measure-distance')}
            className={`px-3 py-2 rounded-lg text-sm border ${
              activeTool === 'measure-distance'
                ? 'bg-green-600 border-green-500'
                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
            }`}
          >
            Mesafe
          </button>
          <button
            onClick={() => startTool('measure-area')}
            className={`px-3 py-2 rounded-lg text-sm border ${
              activeTool === 'measure-area'
                ? 'bg-green-600 border-green-500'
                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
            }`}
          >
            Alan
          </button>
          <button
            onClick={() => startTool('draw-point')}
            disabled={!canEdit || mode !== 'edit'}
            className={`px-3 py-2 rounded-lg text-sm border ${
              activeTool === 'draw-point'
                ? 'bg-purple-600 border-purple-500'
                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
            } ${!canEdit || mode !== 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Nokta
          </button>
          <button
            onClick={() => startTool('draw-line')}
            disabled={!canEdit || mode !== 'edit'}
            className={`px-3 py-2 rounded-lg text-sm border ${
              activeTool === 'draw-line'
                ? 'bg-purple-600 border-purple-500'
                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
            } ${!canEdit || mode !== 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Çizgi
          </button>
          <button
            onClick={() => startTool('draw-polygon')}
            disabled={!canEdit || mode !== 'edit'}
            className={`px-3 py-2 rounded-lg text-sm border ${
              activeTool === 'draw-polygon'
                ? 'bg-purple-600 border-purple-500'
                : 'bg-gray-800 border-gray-700 hover:border-gray-500'
            } ${!canEdit || mode !== 'edit' ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Poligon
          </button>
          <button
            onClick={stopDrawingTool}
            className="px-3 py-2 rounded-lg text-sm border bg-gray-800 border-gray-700 hover:border-gray-500"
          >
            Durdur
          </button>
          <button
            onClick={clearDrawings}
            className="px-3 py-2 rounded-lg text-sm border bg-gray-800 border-gray-700 hover:border-gray-500"
          >
            Çizimleri temizle
          </button>
        </div>
      </div>
      {error && <div className="px-4 py-2 text-sm text-red-400 bg-red-500/10 border-b border-red-500/20">{error}</div>}

      <div className="flex flex-col md:flex-row flex-1" style={{ minHeight: 'calc(100vh - 210px)' }}>
        <div className="md:w-80 border-b md:border-b-0 md:border-r border-gray-800 p-4 space-y-4 bg-gray-950/60">
          <div>
            <h3 className="text-sm font-semibold mb-2">Katmanlar</h3>
            {layers.length === 0 ? (
              <div className="text-xs text-gray-500">Henüz katman yok</div>
            ) : (
              <div className="space-y-3">
                {layers.map((layer) => (
                  <div key={layer.id} className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{layer.name}</p>
                        <p className="text-xs text-gray-500 uppercase">{layer.type}</p>
                      </div>
                      <label className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={layer.visible}
                          onChange={(e) => toggleLayerVisibility(layer.id, e.target.checked)}
                        />
                        Görünür
                      </label>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-500 w-16">Opaklık</span>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={layer.opacity}
                        onChange={(e) => changeLayerOpacity(layer.id, Number(e.target.value))}
                        className="flex-1"
                      />
                      <span className="text-xs text-gray-400 w-10 text-right">
                        {Math.round(layer.opacity * 100)}%
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div>
            <h3 className="text-sm font-semibold mb-2">Ölçüm / Çizim</h3>
            <div className="rounded-lg border border-gray-800 bg-gray-900/50 p-3 text-sm">
              {measureResult || 'Aktif ölçüm yok'}
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Sol tık ile nokta ekle, çift tık veya sağ tık ile tamamla.
            </p>
          </div>
        </div>
        <div className="flex-1">
          <div ref={viewerContainerRef} className="w-full h-[70vh] md:h-full" />
        </div>
      </div>
    </div>
  );
};


