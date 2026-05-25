import { useState, useEffect, createContext, useContext, useCallback } from "react";

const API       = "http://localhost:3001/api";
export const TOKEN_KEY = "oncocast_token";

const AuthContext = createContext(null);

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user,       setUser]       = useState(null);
  const [token,      setToken]      = useState(() => localStorage.getItem(TOKEN_KEY));
  const [loading,    setLoading]    = useState(true);
  const [loginError, setLoginError] = useState(null);

  // Validate persisted token on mount
  useEffect(() => {
    if (!token) { setLoading(false); return; }
    fetch(`${API}/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((u)  => { setUser(u); setLoading(false); })
      .catch(()  => {
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setLoading(false);
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const login = useCallback(async (email, password) => {
    setLoginError(null);
    try {
      const res  = await fetch(`${API}/auth/login`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLoginError(data.error || "Login failed");
        return false;
      }
      localStorage.setItem(TOKEN_KEY, data.token);
      setToken(data.token);
      setUser(data.user);
      return true;
    } catch {
      setLoginError("Cannot reach server — is the backend running?");
      return false;
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        loginError,
        login,
        logout,
        isAdmin: user?.globalRole === "admin",
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
