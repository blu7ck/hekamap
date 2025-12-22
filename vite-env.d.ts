/// <reference types="vite/client" />

/**
 * Vite environment variable type definitions
 * Bu dosya TypeScript'e environment variable'ların tiplerini söyler
 */
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY: string;
  readonly VITE_APP_URL?: string;
  readonly VITE_ADMIN_BASE_PATH?: string;
  readonly VITE_WORKSPACE_BASE_PATH?: string;
  readonly VITE_SUPABASE_SITE_URL?: string;
  readonly VITE_SUPABASE_REDIRECT_URL?: string;
  readonly VITE_ALLOWED_UPLOAD_MIME_TYPES?: string;
}

