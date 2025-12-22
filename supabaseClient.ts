import { createClient } from '@supabase/supabase-js';

/**
 * Environment variable validation - Production-ready strict validation
 * Bu fonksiyon runtime'da environment variable'ları validate eder
 */
function validateSupabaseConfig(): { url: string; anonKey: string } {
  // Type-safe environment variable access
  // Vite provides import.meta.env, types are defined in vite-env.d.ts
  const supabaseUrl = (import.meta.env as { VITE_SUPABASE_URL?: string }).VITE_SUPABASE_URL;
  const supabaseAnonKey = (import.meta.env as { VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY?: string }).VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY;

  // 1. Null/undefined kontrolü
  if (!supabaseUrl || !supabaseAnonKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('VITE_SUPABASE_URL');
    if (!supabaseAnonKey) missing.push('VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY');

    const error = new Error(
      `❌ Supabase configuration error: Missing required environment variables\n` +
      `Missing: ${missing.join(', ')}\n` +
      `Please ensure these are set in your .env file or environment.\n` +
      `See env.example for reference.`
    );
    
    // Development'ta detaylı hata, production'da güvenli mesaj
    const env = import.meta.env as { DEV?: boolean; MODE?: string };
    if (env.DEV) {
      console.error(error.message);
      console.error('Current env state:', {
        hasUrl: !!supabaseUrl,
        hasKey: !!supabaseAnonKey,
        mode: env.MODE,
      });
    }
    
    throw error;
  }

  // 2. String trim ve boş kontrolü
  const trimmedUrl = supabaseUrl.trim();
  const trimmedKey = supabaseAnonKey.trim();

  if (!trimmedUrl || !trimmedKey) {
    throw new Error(
      '❌ Supabase configuration error: Environment variables cannot be empty strings'
    );
  }

  // 3. URL format validation
  try {
    const url = new URL(trimmedUrl);
    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error('URL must use http or https protocol');
    }
    if (!url.hostname) {
      throw new Error('URL must have a valid hostname');
    }
  } catch (urlError) {
    throw new Error(
      `❌ Supabase configuration error: Invalid VITE_SUPABASE_URL format\n` +
      `Provided: ${trimmedUrl}\n` +
      `Expected: https://<project-id>.supabase.co\n` +
      `Error: ${urlError instanceof Error ? urlError.message : 'Invalid URL'}`
    );
  }

  // 4. Key format validation (Supabase anon key genellikle eyJ ile başlar - JWT)
  if (trimmedKey.length < 20) {
    throw new Error(
      '❌ Supabase configuration error: VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY appears to be invalid (too short)'
    );
  }

  return {
    url: trimmedUrl,
    anonKey: trimmedKey,
  };
}

// Runtime validation - uygulama başlatılırken kontrol edilir
const config = validateSupabaseConfig();

/**
 * Supabase client instance
 * 
 * Production-ready configuration:
 * - Strict environment variable validation
 * - Automatic token refresh
 * - Session persistence
 * - URL-based session detection
 * 
 * Güvenlik notları:
 * - Oturum süresi kontrolü AuthProvider'da yapılıyor
 * - Idle timeout: 30 dakika
 * - Token refresh: Süre dolmadan 5 dakika önce
 */
export const supabase = createClient(config.url, config.anonKey, {
  auth: {
    autoRefreshToken: true, // Otomatik token yenileme
    persistSession: true, // Oturumu localStorage'da sakla
    detectSessionInUrl: true, // URL'deki oturum bilgisini algıla
    // Güvenlik: Oturum süresi kontrolü AuthProvider'da yapılıyor
  },
});

