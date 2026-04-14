import { createFileRoute, Link, Outlet, useMatches } from "@tanstack/react-router";
import {
  useConnectors,
  useConnectorTypes,
  useDeleteConnector,
} from "@/lib/hooks/use-connectors.js";
import { Badge } from "@/components/ui/badge.js";
import { Spinner } from "@/components/ui/spinner.js";
import { useState } from "react";

export const Route = createFileRoute("/sources")({
  component: SourcesLayout,
});

/**
 * Layout route: if a child route is active (e.g. /sources/new or /sources/$sourceId)
 * we render only the Outlet; otherwise we show the list page.
 */
function SourcesLayout() {
  const matches = useMatches();
  const hasChild = matches.some(
    (m) => m.routeId !== "/sources" && m.routeId.startsWith("/sources"),
  );

  if (hasChild) {
    return <Outlet />;
  }

  return <SourcesListPage />;
}

// ---------------------------------------------------------------------------
// List page
// ---------------------------------------------------------------------------

function SourcesListPage() {
  const { data: connectors, isLoading } = useConnectors();
  const { data: types } = useConnectorTypes();
  const deleteMutation = useDeleteConnector();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const typeMap = new Map((types ?? []).map((t) => [t.id, t]));

  function handleDelete(id: string) {
    deleteMutation.mutate(id, { onSettled: () => setConfirmId(null) });
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Data Sources</h1>
        <Link
          to="/sources/new"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
        >
          Add Source
        </Link>
      </div>

      {isLoading ? (
        <div className="mt-16 flex justify-center">
          <Spinner className="h-8 w-8" />
        </div>
      ) : !connectors || connectors.length === 0 ? (
        <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-12 text-center">
          <h3 className="text-sm font-semibold text-gray-900">
            Connect your first data source
          </h3>
          <p className="mt-1 text-sm text-gray-500">
            Add a database, warehouse, or API connection to begin syncing data.
          </p>
          <Link
            to="/sources/new"
            className="mt-4 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
          >
            Add Source
          </Link>
        </div>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {connectors.map((c) => {
            const ct = typeMap.get(c.connectorTypeId);
            return (
              <div
                key={c.id}
                className="relative rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
              >
                <Link
                  to="/sources/$sourceId"
                  params={{ sourceId: c.id }}
                  className="absolute inset-0 z-0"
                  aria-label={`View ${c.name}`}
                />

                <div className="relative z-10 flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    {ct?.icon && (
                      <span className="text-lg" aria-hidden="true">
                        {ct.icon}
                      </span>
                    )}
                    <h3 className="text-sm font-semibold text-gray-900">
                      {c.name}
                    </h3>
                  </div>
                  <Badge status={c.status} />
                </div>

                <p className="relative z-10 mt-1 text-xs text-gray-500">
                  {ct?.name ?? c.connectorTypeId}
                </p>

                <div className="relative z-10 mt-3 flex items-center justify-between text-xs text-gray-400">
                  <span>
                    {c.lastSyncAt
                      ? `Synced ${new Date(c.lastSyncAt).toLocaleString()}`
                      : "Never synced"}
                  </span>
                  {c.lastSyncRows != null && (
                    <span>{c.lastSyncRows.toLocaleString()} rows</span>
                  )}
                </div>

                <div className="relative z-10 mt-3 flex justify-end">
                  {confirmId === c.id ? (
                    <span className="flex items-center gap-2 text-xs">
                      <span className="text-gray-500">Delete?</span>
                      <button
                        type="button"
                        onClick={() => handleDelete(c.id)}
                        disabled={deleteMutation.isPending}
                        className="font-medium text-red-600 hover:text-red-800"
                      >
                        Yes
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmId(null)}
                        className="font-medium text-gray-600 hover:text-gray-800"
                      >
                        No
                      </button>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmId(c.id)}
                      className="text-xs font-medium text-red-600 hover:text-red-800"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
