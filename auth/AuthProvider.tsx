import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../supabaseClient';

type UserRole = 'owner' | 'admin' | 'user' | null;

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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const init = async () => {
      setLoading(true);
      const { data } = await supabase.auth.getSession();
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        await loadProfile(data.session.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    };
    init();

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        await loadProfile(nextSession.user.id);
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => {
      active = false;
      listener?.subscription.unsubscribe();
    };
  }, []);

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

