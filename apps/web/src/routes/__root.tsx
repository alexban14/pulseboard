import { createRootRoute, Link, Outlet, Navigate } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { useAuth } from "@/lib/auth";
import "@/app.css";

export const Route = createRootRoute({
  component: RootLayout,
});

const PUBLIC_ROUTES = ["/login", "/register"];

function RootLayout() {
  const { isAuthenticated, isLoading } = useAuth();
  const pathname = window.location.pathname;

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-400">Loading...</p>
      </div>
    );
  }

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname);

  if (!isAuthenticated && !isPublicRoute) {
    return <RedirectToLogin />;
  }

  if (isAuthenticated && isPublicRoute) {
    return <RedirectToHome />;
  }

  if (!isAuthenticated) {
    return <Outlet />;
  }

  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center border-b border-gray-200 px-6">
          <span className="text-lg font-semibold tracking-tight">
            Pulseboard
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main">
          <NavLink to="/">Dashboards</NavLink>
          <NavLink to="/queries">Queries</NavLink>
          <NavLink to="/models">Models</NavLink>
          <NavLink to="/sources">Sources</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>

        <SidebarFooter />
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </div>
  );
}

function SidebarFooter() {
  const { user, logout } = useAuth();

  return (
    <div className="border-t border-gray-200 px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="truncate text-xs text-gray-500" title={user?.email ?? ""}>
          {user?.email}
        </span>
        <button
          type="button"
          onClick={logout}
          className="ml-2 shrink-0 rounded px-2 py-1 text-xs font-medium text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
        >
          Logout
        </button>
      </div>
    </div>
  );
}

function RedirectToLogin() {
  return <Navigate to="/login" />;
}

function RedirectToHome() {
  return <Navigate to="/" />;
}

function NavLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <Link
      to={to}
      className="flex items-center rounded-md px-3 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-100 hover:text-gray-900 [&.active]:bg-gray-100 [&.active]:text-gray-900"
      activeProps={{ className: "active" }}
    >
      {children}
    </Link>
  );
}
