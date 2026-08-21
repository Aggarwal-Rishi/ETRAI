import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiUrl } from '../utils/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  // Initialize user from localStorage if present for immediate render without flicker
  const [user, setUser] = useState(() => {
    try {
      const savedUser = localStorage.getItem('etrai_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (e) {
      return null;
    }
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Check auth session on load & verify against backend
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const token = localStorage.getItem('etrai_token');
      const headers = { 'Accept': 'application/json' };
      
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const res = await fetch(apiUrl('/api/v1/auth/me'), {
        headers,
        credentials: 'include'
      });

      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
        localStorage.setItem('etrai_user', JSON.stringify(data.user));
      } else {
        // If 401 and there was no valid token, clear state
        if (!token || res.status === 401) {
          setUser(null);
          localStorage.removeItem('etrai_token');
          localStorage.removeItem('etrai_user');
        }
      }
    } catch (err) {
      // On network error or offline, keep local user state if available
      console.warn('[Auth Check Network Warning]:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/v1/auth/login'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed');
      }

      if (data.token) {
        localStorage.setItem('etrai_token', data.token);
      }
      if (data.user) {
        localStorage.setItem('etrai_user', JSON.stringify(data.user));
      }

      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const signup = async (email, password) => {
    setError(null);
    try {
      const res = await fetch(apiUrl('/api/v1/auth/signup'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Signup failed');
      }

      if (data.token) {
        localStorage.setItem('etrai_token', data.token);
      }
      if (data.user) {
        localStorage.setItem('etrai_user', JSON.stringify(data.user));
      }

      setUser(data.user);
      return data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  };

  const logout = async () => {
    try {
      const token = localStorage.getItem('etrai_token');
      const headers = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;

      await fetch(apiUrl('/api/v1/auth/logout'), {
        method: 'POST',
        headers,
        credentials: 'include'
      });
    } catch (err) {
      console.error('Logout failed', err);
    } finally {
      localStorage.removeItem('etrai_token');
      localStorage.removeItem('etrai_user');
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, signup, logout, checkAuthStatus }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
