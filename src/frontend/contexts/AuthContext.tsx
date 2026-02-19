import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { apiFetch } from '../api';

interface UserInfo {
  nickname: string;
  email: string;
}

interface AuthContextType {
  user: UserInfo | null;
  loading: boolean;
  checkAuth: () => Promise<void>;
  setUserDirect: (user: UserInfo) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAuth = async () => {
    try {
      const response = await apiFetch('/api/auth/user');
      if (response.ok) {
        const data = await response.json();
        setUser({ 
          nickname: data.nickname, 
          email: data.email
        });
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const setUserDirect = (userInfo: UserInfo) => {
    setUser(userInfo);
    setLoading(false);
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
      setUser(null);
    } catch (err) {
      console.error('Error logging out:', err);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, checkAuth, setUserDirect, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

