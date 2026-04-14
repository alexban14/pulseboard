import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sources")({
  component: SourcesPage,
});

function SourcesPage() {
  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">Data Sources</h1>
        <button
          type="button"
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
        >
          Add Source
        </button>
      </div>

      <div className="mt-8 rounded-lg border border-dashed border-gray-300 p-12 text-center">
        <p className="text-sm text-gray-500">
          No data sources connected. Add a database, warehouse, or API
          connection to begin.
        </p>
      </div>
    </div>
  );
}
