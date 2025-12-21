# HekaMap Backend API

Hetzner VM'de çalışan backend API, 3D asset processing job queue yönetimi için.

## Özellikler

- Job queue yönetimi (Supabase PostgreSQL üzerinden)
- Worker container authentication
- Cloudflare Worker'dan job oluşturma
- Worker container'lar için job polling
- Job status güncelleme ve tamamlama

## Endpoints

### `POST /api/jobs/create`
Cloudflare Worker tarafından çağrılır. Yeni bir processing job'ı oluşturur.

**Authentication**: `X-API-Key` header

**Request Body**:
```json
{
  "project_id": "uuid",
  "asset_id": "uuid",
  "asset_category": "single_model" | "large_area"
}
```

### `GET /api/jobs/poll`
Worker container'lar tarafından çağrılır. Pending job'ları çeker.

**Authentication**: `X-Worker-ID` ve `X-Worker-Secret` headers

**Query Parameters**:
- `worker_type` (optional): `blender`, `entwine`, `3d-tiles`, `job-dispatcher`

### `POST /api/jobs/:id/update`
Worker container'lar tarafından job status güncellemesi için çağrılır.

**Authentication**: `X-Worker-ID` ve `X-Worker-Secret` headers

**Request Body**:
```json
{
  "status": "processing" | "failed",
  "error_message": "string (optional)",
  "progress_percent": 0-100 (optional)
}
```

### `POST /api/jobs/:id/complete`
Worker container'lar tarafından job tamamlandığında çağrılır.

**Authentication**: `X-Worker-ID` ve `X-Worker-Secret` headers

**Request Body**:
```json
{
  "final_key": "tiles/project_id/asset_id/tileset.json",
  "asset_type": "tileset" | "glb" | "b3dm" | "pnts",
  "file_size_bytes": 12345 (optional)
}
```

### `GET /health`
Health check endpoint.

## Geliştirme

```bash
# Install dependencies
npm install

# Development mode (with watch)
npm run dev

# Build
npm run build

# Production
npm start
```

## Docker

```bash
# Build image
npm run docker:build

# Run container
npm run docker:run
```

## Environment Variables

See `.env.example` for required environment variables.

