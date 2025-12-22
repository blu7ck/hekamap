import React, { createContext, useContext, useEffect, useMemo, useState, useRef } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

type UserRole = 'owner' | 'admin' | 'moderator' | 'user' | 'viewer' | null;

type Profile = {
  id: string;
  role: UserRole;
  email?: string;
};

type AuthContextValue = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  loading: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Oturum ayarları - güvenlik için
const SESSION_CHECK_INTERVAL = 60000; // 1 dakikada bir kontrol et (ms)
const IDLE_TIMEOUT = 30 * 60 * 1000; // 30 dakika hareketsizlik sonrası logout (ms)
const SESSION_REFRESH_BUFFER = 5 * 60 * 1000; // Token süresi dolmadan 5 dakika önce yenile (ms)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const lastActivityRef = useRef<number>(Date.now());
  const sessionCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const loadProfile = async (userId: string) => {
    try {
      // RLS: user can read own profile; owner/admin can read many.
      const { data, error } = await supabase
        .from('user_profiles')
        .select('id, role, email')
        .eq('id', userId)
        .maybeSingle();

      if (error) {
        // Table might not exist yet, or RLS issue - this is OK for initial setup
        console.warn('Profile load failed (this is OK if tables not migrated yet):', error.message);
        setProfile({ id: userId, role: null });
        return;
      }
      if (data) {
        setProfile({ id: data.id, role: (data.role as UserRole) ?? null, email: data.email ?? undefined });
      } else {
        setProfile({ id: userId, role: null });
      }
    } catch (err) {
      console.error('Profile load exception:', err);
      setProfile({ id: userId, role: null });
    }
  };

  // Kullanıcı aktivitesini takip et
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart', 'click'];
    events.forEach((event) => {
      window.addEventListener(event, updateActivity, { passive: true });
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, updateActivity);
      });
    };
  }, []);

  useEffect(() => {
    let active = true;

    // Oturum süresini kontrol et ve gerekirse yenile
    const checkAndRefreshSession = async () => {
      if (!active) return;
      
      const currentSession = await supabase.auth.getSession();
      const currentSessionData = currentSession.data.session;

      if (!currentSessionData) {
        return;
      }

      // Token süresini kontrol et
      const expiresAt = currentSessionData.expires_at;
      if (expiresAt) {
        const expiresIn = expiresAt * 1000 - Date.now();
        
        // Token süresi dolmuşsa logout yap
        if (expiresIn <= 0) {
          console.warn('Oturum süresi doldu, çıkış yapılıyor...');
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setProfile(null);
          return;
        }

        // Token süresi dolmadan önce yenile
        if (expiresIn <= SESSION_REFRESH_BUFFER) {
          console.log('Oturum yenileniyor...');
          const { data, error } = await supabase.auth.refreshSession();
          if (error) {
            console.error('Oturum yenileme hatası:', error);
            await supabase.auth.signOut();
            setSession(null);
            setUser(null);
            setProfile(null);
          } else if (data.session) {
            setSession(data.session);
            setUser(data.session.user);
            if (data.session.user) {
              await loadProfile(data.session.user.id);
            }
          }
        }
      }

      // Idle timeout kontrolü
      const timeSinceLastActivity = Date.now() - lastActivityRef.current;
      if (timeSinceLastActivity >= IDLE_TIMEOUT) {
        console.warn('Uzun süre hareketsiz kalındı, oturum kapatılıyor...');
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
      }
    };

    const init = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      
      // İlk oturum kontrolü
      if (data.session) {
        const expiresAt = data.session.expires_at;
        if (expiresAt && expiresAt * 1000 <= Date.now()) {
          // Oturum süresi dolmuş
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setProfile(null);
        } else {
          setSession(data.session);
          setUser(data.session.user ?? null);
          if (data.session.user) {
            await loadProfile(data.session.user.id);
          } else {
            setProfile(null);
          }
          lastActivityRef.current = Date.now();
        }
      } else {
        setSession(null);
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    };
    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      if (!active) return;
      
      if (nextSession) {
        const expiresAt = nextSession.expires_at;
        if (expiresAt && expiresAt * 1000 <= Date.now()) {
          // Yeni oturum bile olsa süresi dolmuşsa kabul etme
          await supabase.auth.signOut();
          setSession(null);
          setUser(null);
          setProfile(null);
        } else {
          setSession(nextSession);
          setUser(nextSession.user ?? null);
          if (nextSession.user) {
            await loadProfile(nextSession.user.id);
          } else {
            setProfile(null);
          }
          lastActivityRef.current = Date.now();
        }
      } else {
        setSession(null);
        setUser(null);
        setProfile(null);
      }
      setLoading(false);
    });

    // Periyodik oturum kontrolü
    sessionCheckIntervalRef.current = setInterval(() => {
      if (active) {
        checkAndRefreshSession();
      }
    }, SESSION_CHECK_INTERVAL);

    return () => {
      active = false;
      listener?.subscription.unsubscribe();
      if (sessionCheckIntervalRef.current) {
        clearInterval(sessionCheckIntervalRef.current);
      }
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      user,
      profile,
      loading,
      signOut: async () => {
        await supabase.auth.signOut();
        setSession(null);
        setUser(null);
        setProfile(null);
      },
    }),
    [session, user, profile, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};

