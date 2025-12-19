import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';

type Props = {
  roles?: Array<'owner' | 'admin' | 'user'>;
  children: React.ReactNode;
  fallback?: string;
};

export const ProtectedRoute: React.FC<Props> = ({ roles, children, fallback }) => {
  const { session, profile, loading } = useAuth();
  const location = useLocation();

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

  if (roles && roles.length > 0) {
    const role = profile?.role;
    if (!role || !roles.includes(role)) {
      return <Navigate to="/" replace />;
    }
  }

  return <>{children}</>;
};

