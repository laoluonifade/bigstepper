import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { api, clearAdminToken, getAdminToken, onUnauthorized, post, setAdminToken } from './api';

export interface Admin {
  id: string;
  email: string;
  displayName: string;
  role: 'admin' | 'compliance';
}

interface AdminAuth {
  admin: Admin | null;
  status: 'loading' | 'signed-out' | 'signed-in';
  signIn: (token: string) => void;
  signOut: () => Promise<void>;
}

const AdminAuthContext = createContext<AdminAuth | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [token, setToken] = useState(getAdminToken);
  const me = useQuery({ queryKey: ['admin', 'me', token], queryFn: () => api<Admin>('/admin-auth/me'), enabled: Boolean(token), retry: false, staleTime: 5 * 60_000 });
  // An expired or revoked session lands back on the sign-in screen.
  useEffect(() => onUnauthorized(() => { clearAdminToken(); setToken(null); queryClient.clear(); }), [queryClient]);
  const value: AdminAuth = {
    admin: me.data ?? null,
    status: !token ? 'signed-out' : me.isLoading ? 'loading' : me.data ? 'signed-in' : 'signed-out',
    signIn(next) { setAdminToken(next); setToken(next); },
    async signOut() {
      await post('/admin-auth/logout').catch(() => undefined);
      clearAdminToken();
      setToken(null);
      queryClient.clear();
    },
  };
  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const value = useContext(AdminAuthContext);
  if (!value) throw new Error('useAdminAuth outside AdminAuthProvider');
  return value;
}

export function useAdmin() {
  const { admin } = useAdminAuth();
  if (!admin) throw new Error('useAdmin before sign-in');
  return admin;
}
