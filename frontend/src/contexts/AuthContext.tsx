import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, ApiError } from '@/lib/api';

interface AuthUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  department?: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  loading: boolean;
  signUp: (email: string, password: string, displayName: string, department?: string) => Promise<{ error: Error | null }>;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    api.auth
      .me()
      .then((result) => {
        if (!mounted) return;
        setUser(result.user ?? null);
      })
      .catch((error) => {
        if (!mounted) return;
        if (error instanceof ApiError && error.status === 401) {
          setUser(null);
        }
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const syncAuthState = () => {
      api.auth
        .me()
        .then((result) => {
          if (!mounted) return;
          setUser(result.user ?? null);
        })
        .catch((error) => {
          if (!mounted) return;
          // Only clear session on explicit unauthorized response.
          if (error instanceof ApiError && error.status === 401) {
            setUser(null);
          }
        })
        .finally(() => setLoading(false));
    };

    window.addEventListener('focus', syncAuthState);
    return () => {
      mounted = false;
      window.removeEventListener('focus', syncAuthState);
      setLoading(false);
    };
  }, []);

  const signUp = async (email: string, password: string, displayName: string, department?: string) => {
    try {
      const result = await api.auth.signup({ email, password, displayName, department });
      setUser(result.user ?? null);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const result = await api.auth.login({ email, password });
      setUser(result.user ?? null);
      return { error: null };
    } catch (error) {
      return { error: error as Error };
    }
  };

  const signOut = async () => {
    try {
      await api.auth.logout();
    } catch (error) {
      console.error('Logout request failed', error);
    }
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, signUp, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
