import React, { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../auth/AuthProvider';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import * as Cesium from 'cesium';

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
  const { profile, user } = useAuth();
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<Cesium.Viewer | null>(null);
  const watermarkRef = useRef<(() => void) | null>(null);

  const [assets, setAssets] = useState<SignedAsset[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setCesiumBase();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    void loadAndSignAssets(projectId);
  }, [projectId]);

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
            const model = await Cesium.Model.fromGltf({ url });
            viewer.scene.primitives.add(model);
            primitives.push(model);
            await viewer.zoomTo(model);
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
      primitives.forEach((p) => {
        if (p instanceof Cesium.Cesium3DTileset || p instanceof Cesium.Model) {
          viewer.scene.primitives.remove(p);
        }
      });
      dataSources.forEach((ds) => viewer.dataSources.remove(ds));
    };
  }, [assets]);

  const loadAndSignAssets = async (pid: string) => {
    setError(null);
    setLoading(true);
    try {
      // 1) Metadata from Supabase (no signed URLs)
      const { data, error } = await supabase.rpc('list_viewer_assets', { project_id: pid });
      if (error) throw new Error(error.message);
      const metas: AssetMeta[] = data || [];

      // 2) Fetch signed URL per asset via Cloudflare Function
      const session = (await supabase.auth.getSession()).data.session;
      const token = session?.access_token;
      if (!token) throw new Error('Auth token bulunamadı.');

      const signed: SignedAsset[] = [];
      for (const asset of metas) {
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
      setAssets(signed);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Varlıklar alınamadı.');
      setAssets([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="p-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Viewer</h1>
          <p className="text-sm text-gray-400">Proje: {projectId}</p>
        </div>
        {loading && <div className="text-xs text-gray-400">Yükleniyor...</div>}
      </div>
      {error && <div className="px-4 text-sm text-red-400">{error}</div>}
      <div ref={viewerContainerRef} className="w-full h-[80vh]" />
    </div>
  );
};

