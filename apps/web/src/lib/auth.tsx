import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiClient, ApiError } from "@/lib/api-client";

interface User {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string;
}

interface Tenant {
  id: string;
  name: string;
  slug: string;
  [key: string]: unknown;
}

interface AuthResponse {
  accessToken: string;
  expiresIn: number;
  user: User;
}

interface TenantsMeResponse {
  tenant: Tenant;
  user: User;
}

interface AuthContextValue {
  user: User | null;
  tenant: Tenant | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (
    email: string,
    password: string,
    tenantName: string,
    tenantSlug: string,
  ) => Promise<void>;
  logout: () => void;
}

const TOKEN_KEY = "auth_token";

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      setIsLoading(false);
      return;
    }

    apiClient
      .get<TenantsMeResponse>("/tenants/me")
      .then((data) => {
        setUser(data.user);
        setTenant(data.tenant);
      })
      .catch(() => {
        localStorage.removeItem(TOKEN_KEY);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await apiClient.post<AuthResponse>("/auth/login", {
      email,
      password,
    });
    localStorage.setItem(TOKEN_KEY, data.accessToken);

    const meData = await apiClient.get<TenantsMeResponse>("/tenants/me");
    setUser(meData.user);
    setTenant(meData.tenant);
  }, []);

  const register = useCallback(
    async (
      email: string,
      password: string,
      tenantName: string,
      tenantSlug: string,
    ) => {
      const data = await apiClient.post<AuthResponse>("/auth/register", {
        email,
        password,
        tenantName,
        tenantSlug,
      });
      localStorage.setItem(TOKEN_KEY, data.accessToken);

      const meData = await apiClient.get<TenantsMeResponse>("/tenants/me");
      setUser(meData.user);
      setTenant(meData.tenant);
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setUser(null);
    setTenant(null);
    window.location.href = "/login";
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      tenant,
      isAuthenticated: user !== null,
      isLoading,
      login,
      register,
      logout,
    }),
    [user, tenant, isLoading, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}

export { ApiError };
