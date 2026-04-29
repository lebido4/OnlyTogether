import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { api, getStoredToken, setStoredToken } from '../api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(getStoredToken());
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(getStoredToken()));

  useEffect(() => {
    let alive = true;

    async function loadMe() {
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const response = await api.get('/me');
        if (alive) {
          setUser(response.data.user);
        }
      } catch {
        setStoredToken(null);
        if (alive) {
          setToken(null);
          setUser(null);
        }
      } finally {
        if (alive) {
          setLoading(false);
        }
      }
    }

    loadMe();
    return () => {
      alive = false;
    };
  }, [token]);

  async function login(email, password) {
    const response = await api.post('/auth/login', { email, password });
    setStoredToken(response.data.accessToken);
    setToken(response.data.accessToken);
    setUser(response.data.user);
  }

  async function register(email, username, password) {
    const response = await api.post('/auth/register', { email, username, password });
    setStoredToken(response.data.accessToken);
    setToken(response.data.accessToken);
    setUser(response.data.user);
  }

  function logout() {
    setStoredToken(null);
    setToken(null);
    setUser(null);
  }

  const value = useMemo(
    () => ({
      token,
      user,
      loading,
      isAuthenticated: Boolean(token && user),
      login,
      register,
      logout
    }),
    [token, user, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) {
    throw new Error('useAuth must be used inside AuthProvider');
  }
  return value;
}
