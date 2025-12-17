import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import PropTypes from 'prop-types';
import { findBestUrl } from '../utils/connection.js';

const AuthContext = createContext(null);

const STORAGE_KEY = 'melochat_auth';

const persistAuth = (data) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      ...data,
      timestamp: Date.now()
    }));
  } catch (error) {
    console.error('Errore nel salvare le credenziali:', error);
  }
};

const loadPersistedAuth = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.token || !parsed.user) return null;

    const EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;
    if (Date.now() - parsed.timestamp > EXPIRATION_MS) {
      localStorage.removeItem(STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('Errore nel leggere le credenziali:', error);
    return null;
  }
};

const clearPersistedAuth = () => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Errore nella pulizia delle credenziali:', error);
  }
};

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [baseUrl, setBaseUrl] = useState(null);

  useEffect(() => {
    const initialize = async () => {
      try {
        const url = await findBestUrl();
        setBaseUrl(url);
        const persisted = loadPersistedAuth();
        if (persisted?.token && persisted?.user) {
          setToken(persisted.token);
          setUser(persisted.user);
        }
      } catch (err) {
        console.error('Errore inizializzazione AuthProvider:', err);
      }
    };

    initialize();
  }, []);

  useEffect(() => {
    if (token && user) {
      persistAuth({ token, user });
    }
  }, [token, user]);

  const clearError = () => setError(null);

  const withBaseUrl = useCallback(async (path, options = {}) => {
    const url = baseUrl || await findBestUrl();
    return fetch(`${url}${path}`, options);
  }, [baseUrl]);

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const response = await withBaseUrl('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ username, password })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Credenziali non valide');
      }

      const data = await response.json();
      setToken(data.token);
      setUser(data.user);
      persistAuth({ token: data.token, user: data.user });

      return { success: true, user: data.user };
    } catch (err) {
      console.error('Errore login:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [withBaseUrl]);

  const register = useCallback(async (username, email, password, displayName = null) => {
    setLoading(true);
    setError(null);
    try {
      const response = await withBaseUrl('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username,
          email,
          password,
          display_name: displayName
        })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Registrazione fallita');
      }

      const data = await response.json();
      return { success: true, message: data.message };
    } catch (err) {
      console.error('Errore registrazione:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [withBaseUrl]);

  const logout = useCallback(async () => {
    if (!token) {
      setToken(null);
      setUser(null);
      clearPersistedAuth();
      return;
    }

    try {
      await withBaseUrl('/api/auth/logout', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (err) {
      console.warn('Errore logout:', err);
    } finally {
      setToken(null);
      setUser(null);
      clearPersistedAuth();
    }
  }, [token, withBaseUrl]);

  const updateProfile = useCallback(async (profileData) => {
    if (!token) return { success: false, error: 'Non autenticato' };

    setLoading(true);
    setError(null);
    try {
      const response = await withBaseUrl('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileData)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Aggiornamento profilo fallito');
      }

      setUser(prev => ({
        ...prev,
        ...profileData
      }));

      return { success: true };
    } catch (err) {
      console.error('Errore aggiornamento profilo:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [token, withBaseUrl]);

  const changePassword = useCallback(async ({ current_password, new_password }) => {
    if (!token) return { success: false, error: 'Non autenticato' };

    setLoading(true);
    setError(null);
    try {
      const response = await withBaseUrl('/api/user/password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ current_password, new_password })
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Cambio password fallito');
      }

      return { success: true };
    } catch (err) {
      console.error('Errore cambio password:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [token, withBaseUrl]);

  const uploadAvatar = useCallback(async (file) => {
    if (!token) return { success: false, error: 'Non autenticato' };

    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await withBaseUrl('/api/user/avatar', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || 'Upload avatar fallito');
      }

      const data = await response.json();
      setUser(prev => ({
        ...prev,
        avatar: data.avatar
      }));

      return { success: true, avatar: data.avatar };
    } catch (err) {
      console.error('Errore upload avatar:', err);
      setError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  }, [token, withBaseUrl]);

  const value = useMemo(() => ({
    token,
    user,
    baseUrl,
    loading,
    error,
    login,
    register,
    logout,
    clearError,
    updateProfile,
    changePassword,
    uploadAvatar,
    isAuthenticated: Boolean(token)
  }), [token, user, baseUrl, loading, error, login, register, logout, updateProfile, changePassword, uploadAvatar]);

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

AuthProvider.propTypes = {
  children: PropTypes.node
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve essere usato con AuthProvider');
  }
  return context;
};
