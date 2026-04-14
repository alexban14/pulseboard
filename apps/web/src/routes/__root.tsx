import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import "@/app.css";

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="flex h-screen bg-gray-50 text-gray-900">
      <aside className="flex w-64 flex-col border-r border-gray-200 bg-white">
        <div className="flex h-14 items-center border-b border-gray-200 px-6">
          <span className="text-lg font-semibold tracking-tight">
            Analytics
          </span>
        </div>

        <nav className="flex-1 space-y-1 px-3 py-4" aria-label="Main">
          <NavLink to="/">Dashboards</NavLink>
          <NavLink to="/queries">Queries</NavLink>
          <NavLink to="/models">Models</NavLink>
          <NavLink to="/sources">Sources</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>

        <div className="border-t border-gray-200 px-4 py-3 text-xs text-gray-400">
          v0.1.0
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <Outlet />
      </main>

      {import.meta.env.DEV && <TanStackRouterDevtools position="bottom-right" />}
    </div>
  );
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
