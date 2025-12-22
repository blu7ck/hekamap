import React, { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { supabase } from '../supabaseClient';

type Props = {
  roles?: Array<'owner' | 'admin' | 'user'>;
  children: React.ReactNode;
  fallback?: string;
};

export const ProtectedRoute: React.FC<Props> = ({ roles, children, fallback }) => {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

  // Oturum süresi kontrolü - ek güvenlik katmanı
  useEffect(() => {
    if (!session) return;

    const checkSession = async () => {
      const { data } = await supabase.auth.getSession();
      const currentSession = data.session;

      if (!currentSession) {
        return;
      }

      // Token süresini kontrol et
      const expiresAt = currentSession.expires_at;
      if (expiresAt && expiresAt * 1000 <= Date.now()) {
        // Oturum süresi dolmuş, çıkış yap
        await supabase.auth.signOut();
      }
    };

    // İlk kontrol
    checkSession();

    // Periyodik kontrol (her 30 saniyede bir)
    const interval = setInterval(checkSession, 30000);

    return () => {
      clearInterval(interval);
    };
  }, [session]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-white">
        Yükleniyor...
      </div>
    );
  }

  if (!session) {
    return <Navigate to={fallback || '/workspace/login'} state={{ from: location }} replace />;
  }

  // Ek güvenlik: Oturum süresi dolmuş mu kontrol et
  if (session.expires_at && session.expires_at * 1000 <= Date.now()) {
    return <Navigate to={fallback || '/workspace/login'} state={{ from: location }} replace />;
  }

  if (roles && roles.length > 0) {
    const role = profile?.role;
    if (!role || !roles.includes(role)) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

