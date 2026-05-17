import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken } from '../services/api';

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = getToken();
    if (!t) { setLoading(false); return; }
    api.get('/api/auth/me')
       .then(r => setUser(r.user || null))
       .catch(() => { setToken(null); setUser(null); })
       .finally(() => setLoading(false));
  }, []);

  const login = async (email, password) => {
    const r = await api.post('/api/auth/login', { email, password });
    setToken(r.token);
    setUser(r.user);
    return r.user;
  };

  // Called by GoogleCallback after the backend issues a JWT via redirect
  const loginWithToken = async (token) => {
    setToken(token);
    const r = await api.get('/api/auth/me');
    setUser(r.user || null);
    return r.user;
  };

  const register = async ({ full_name, email, password, role, specialty, otp }) => {
    // Register the user (including OTP), then immediately log them in to get a token
    await api.post('/api/auth/register', { full_name, email, password, role, specialty, otp });
    return login(email, password);
  };

  const logout = () => {
    setToken(null);
    setUser(null);
  };

  return (
    <AuthCtx.Provider value={{ user, loading, login, loginWithToken, register, logout }}>
      {children}
    </AuthCtx.Provider>
  );
}

export const useAuth = () => useContext(AuthCtx);
