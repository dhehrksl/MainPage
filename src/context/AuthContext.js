import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getStoredAuth, clearStoredAuth, loginUser, registerUser } from "../api/client";

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [auth, setAuth] = useState(() => getStoredAuth()); // { token, user } | null

  // request()가 401을 받으면 이 이벤트를 쏘고, 여기서 받아 즉시 로그아웃 처리한다.
  useEffect(() => {
    const handleUnauthorized = () => setAuth(null);
    window.addEventListener("auth:unauthorized", handleUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", handleUnauthorized);
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await loginUser(email, password);
    setAuth(data);
    return data;
  }, []);

  const register = useCallback(async (email, password, name) => {
    const data = await registerUser(email, password, name);
    setAuth(data);
    return data;
  }, []);

  const logout = useCallback(() => {
    clearStoredAuth();
    setAuth(null);
  }, []);

  const value = {
    user: auth?.user || null,
    isAuthenticated: !!auth?.token,
    login,
    register,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => useContext(AuthContext);
