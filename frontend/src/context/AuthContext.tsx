import React, { createContext, useContext, useState, useEffect } from 'react';
import { api, UserProfile, getAuthToken, setAuthToken } from '../services/api.js';
import { getSocket } from '../services/socket.js';

interface AuthContextType {
  user: UserProfile | null;
  loading: boolean;
  login: (email: string, passwordPlain: string) => Promise<UserProfile>;
  register: (email: string, passwordPlain: string, name: string, clubId?: string) => Promise<UserProfile>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const initSocketRooms = (u: UserProfile) => {
    const socket = getSocket();
    if (u.role === 'COORDINATOR') {
      socket.emit('join_coordinator');
    } else if (u.clubId) {
      socket.emit('join_club', u.clubId);
    }
  };

  const refreshUser = async () => {
    const token = getAuthToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const res = await api.getMe();
      setUser(res.user);
      initSocketRooms(res.user);
    } catch (_err) {
      setAuthToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshUser();
  }, []);

  const login = async (email: string, passwordPlain: string): Promise<UserProfile> => {
    const res = await api.login(email, passwordPlain);
    setAuthToken(res.token);
    setUser(res.user);
    initSocketRooms(res.user);
    return res.user;
  };

  /**
   * Public registration — always creates a USER (CLUB_MEMBER) account.
   * The backend enforces this regardless of any client-side state.
   */
  const register = async (
    email: string,
    passwordPlain: string,
    name: string,
    clubId?: string
  ): Promise<UserProfile> => {
    const res = await api.register(email, passwordPlain, name, clubId);
    setAuthToken(res.token);
    setUser(res.user);
    initSocketRooms(res.user);
    return res.user;
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
