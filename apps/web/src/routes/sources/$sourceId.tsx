import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useRef, useCallback } from "react";
import {
  useConnector,
  useConnectorTypes,
  useTestStoredConnection,
  useDiscoverSchema,
  useSelectTables,
  useSyncTables,
  useSyncRuns,
  useUploadFile,
  useTriggerSync,
  useStoredFiles,
  useFilePreview,
  type DiscoveredTable,
  type SyncTable,
  type TestConnectionResult,
  type UploadResult,
  type TriggerSyncResult,
  type StoredFile,
  type FilePreview,
} from "@/lib/hooks/use-connectors.js";
import { Badge } from "@/components/ui/badge.js";
import { Spinner } from "@/components/ui/spinner.js";

const CONNECTOR_ICONS: Record<string, string> = {
  mysql: "🐬",
  postgresql: "🐘",
  csv: "📄",
  "rest-api": "🌐",
  webhook: "🔗",
  mongodb: "🍃",
};

export const Route = createFileRoute("/sources/$sourceId")({
  component: SourceDetailPage,
});

function SourceDetailPage() {
  const { sourceId } = Route.useParams();
  const { data: connector, isLoading } = useConnector(sourceId);
  const { data: types } = useConnectorTypes();
  const { data: syncTables } = useSyncTables(sourceId);
  const { data: syncRuns } = useSyncRuns(sourceId);

  const testMutation = useTestStoredConnection();
  const discoverMutation = useDiscoverSchema(sourceId);
  const selectMutation = useSelectTables(sourceId);
  const triggerSyncMutation = useTriggerSync();
  const [syncResult, setSyncResult] = useState<TriggerSyncResult | null>(null);

  const [testResult, setTestResult] = useState<TestConnectionResult | null>(
    null,
  );
  const [discovered, setDiscovered] = useState<DiscoveredTable[] | null>(null);
  const [selectedTables, setSelectedTables] = useState<
    Map<string, string | undefined>
  >(new Map());

  const connectorType = types?.find((t) => t.id === connector?.connectorTypeId);

  if (isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (!connector) {
    return (
      <div className="mx-auto max-w-5xl px-8 py-10">
        <p className="text-sm text-gray-500">Connector not found.</p>
        <Link
          to="/sources"
          className="mt-2 inline-block text-sm font-medium text-gray-900 underline"
        >
          Back to sources
        </Link>
      </div>
    );
  }

  function handleTest() {
    setTestResult(null);
    testMutation.mutate(sourceId, {
      onSuccess: (data) => setTestResult(data),
    });
  }

  function handleDiscover() {
    discoverMutation.mutate(undefined, {
      onSuccess: (data) => {
        setDiscovered(data.tables);
        // Pre-select tables already synced
        const existing = new Map<string, string | undefined>();
        for (const st of syncTables ?? []) {
          existing.set(st.sourceTable, st.incrementalColumn);
        }
        setSelectedTables(existing);
      },
    });
  }

  function toggleTable(name: string) {
    setSelectedTables((prev) => {
      const next = new Map(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.set(name, undefined);
      }
      return next;
    });
  }

  function handleSaveSelection() {
    const tables: SyncTable[] = Array.from(selectedTables.entries()).map(
      ([sourceTable, incrementalColumn]) => ({
        sourceTable,
        ...(incrementalColumn ? { incrementalColumn } : {}),
      }),
    );
    selectMutation.mutate(tables);
  }

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      {/* Header */}
      <div className="mb-1">
        <Link
          to="/sources"
          className="text-xs font-medium text-gray-500 hover:text-gray-700"
        >
          &larr; Sources
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {CONNECTOR_ICONS[connector.connectorTypeId] ?? "📊"}
        </span>
        <h1 className="text-2xl font-bold tracking-tight">
          {connector.name}
        </h1>
        <Badge status={connector.status} />
      </div>

      <p className="mt-1 text-sm text-gray-500">
        {connectorType?.name ?? connector.connectorTypeId}
        {connector.syncSchedule && ` \u00b7 Schedule: ${connector.syncSchedule}`}
      </p>

      {/* Actions — different for CSV vs database connectors */}
      {connector.connectorTypeId === 'csv' ? (
        <>
          <FileUploadZone connectorId={sourceId} />
          <UploadedFilesList connectorId={sourceId} />
        </>
      ) : (
        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleTest}
            disabled={testMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {testMutation.isPending && <Spinner className="h-4 w-4" />}
            Test Connection
          </button>
          <button
            type="button"
            onClick={handleDiscover}
            disabled={discoverMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {discoverMutation.isPending && <Spinner className="h-4 w-4" />}
            Discover Schema
          </button>
          <button
            type="button"
            onClick={() => {
              setSyncResult(null);
              triggerSyncMutation.mutate(sourceId, {
                onSuccess: (data) => setSyncResult(data),
              });
            }}
            disabled={triggerSyncMutation.isPending}
            className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
          >
            {triggerSyncMutation.isPending && <Spinner className="h-4 w-4" />}
            Sync Now
          </button>
        </div>
      )}

      {/* Sync trigger result */}
      {syncResult && (
        <div
          className={`mt-4 rounded-md p-3 text-sm ${syncResult.triggered ? "bg-blue-50 text-blue-800" : "bg-yellow-50 text-yellow-800"}`}
        >
          {syncResult.message}
        </div>
      )}

      {/* Test result */}
      {testResult && (
        <div
          className={`mt-4 rounded-md p-3 text-sm ${testResult.success ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800"}`}
        >
          <p className="font-medium">
            {testResult.success ? "Connection successful" : "Connection failed"}
          </p>
          {!testResult.success && testResult.message && (
            <p className="mt-0.5">{testResult.message}</p>
          )}
          {testResult.success && (
            <p className="mt-0.5 text-xs opacity-70">
              Latency: {testResult.latencyMs}ms
              {testResult.serverVersion && <> &middot; Server: {testResult.serverVersion}</>}
            </p>
          )}
        </div>
      )}
      {testMutation.isError && (
        <div className="mt-4 rounded-md bg-red-50 p-3 text-sm text-red-800">
          Failed to test connection. Please try again.
        </div>
      )}

      {/* Discovered tables */}
      {discovered && (
        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">
              Discovered Tables ({discovered.length})
            </h2>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (selectedTables.size === discovered.length) {
                    setSelectedTables(new Map());
                  } else {
                    const all = new Map<string, string | undefined>();
                    for (const t of discovered) all.set(t.name, undefined);
                    setSelectedTables(all);
                  }
                }}
                className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
              >
                {selectedTables.size === discovered.length ? "Deselect All" : "Select All"}
              </button>
              <button
                type="button"
                onClick={handleSaveSelection}
                disabled={selectMutation.isPending || selectedTables.size === 0}
                className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50"
              >
                {selectMutation.isPending && <Spinner className="h-4 w-4" />}
                Save Selection ({selectedTables.size})
              </button>
            </div>
          </div>

          {selectMutation.isSuccess && (
            <div className="mt-2 rounded-md bg-green-50 p-2 text-sm text-green-800">
              Table selection saved successfully.
            </div>
          )}

          <div className="mt-4 space-y-3">
            {discovered.map((table) => (
              <DiscoveredTableCard
                key={table.name}
                table={table}
                selected={selectedTables.has(table.name)}
                onToggle={() => toggleTable(table.name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Sync history */}
      {syncRuns && syncRuns.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-gray-900">Sync History</h2>
          <div className="mt-4 overflow-hidden rounded-lg border border-gray-200">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-2 text-left font-medium text-gray-500">
                    Started
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">
                    Duration
                  </th>
                  <th className="px-4 py-2 text-right font-medium text-gray-500">
                    Rows
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {syncRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="px-4 py-2">
                      <Badge status={run.status === "completed" ? "healthy" : run.status === "running" ? "pending" : "error"} />
                    </td>
                    <td className="px-4 py-2 text-gray-700">
                      {new Date(run.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {run.durationMs != null
                        ? `${(run.durationMs / 1000).toFixed(1)}s`
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {run.rowsSynced != null
                        ? run.rowsSynced.toLocaleString()
                        : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DiscoveredTableCard({
  table,
  selected,
  onToggle,
}: {
  table: DiscoveredTable;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`rounded-lg border p-4 transition-colors ${selected ? "border-gray-900 bg-gray-50" : "border-gray-200 bg-white"}`}
    >
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggle}
            className="h-4 w-4 rounded border-gray-300 text-gray-900 focus:ring-gray-900"
          />
          <span className="text-sm font-medium text-gray-900">
            {table.name}
          </span>
        </label>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            ~{table.estimatedRowCount.toLocaleString()} rows
          </span>
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-gray-600 hover:text-gray-900"
          >
            {expanded ? "Hide columns" : `${table.columns.length} columns`}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 overflow-hidden rounded border border-gray-100">
          <table className="min-w-full text-xs">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">
                  Column
                </th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">
                  Type
                </th>
                <th className="px-3 py-1.5 text-center font-medium text-gray-500">
                  PK
                </th>
                <th className="px-3 py-1.5 text-center font-medium text-gray-500">
                  Nullable
                </th>
                <th className="px-3 py-1.5 text-left font-medium text-gray-500">
                  FK
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {table.columns.map((col) => (
                <tr key={col.name}>
                  <td className="px-3 py-1.5 font-mono text-gray-800">
                    {col.name}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">{col.type}</td>
                  <td className="px-3 py-1.5 text-center">
                    {col.isPrimaryKey ? (
                      <span className="text-yellow-600">PK</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-1.5 text-center text-gray-400">
                    {col.nullable ? "yes" : "no"}
                  </td>
                  <td className="px-3 py-1.5 text-gray-500">
                    {col.referencesTable ?? "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// File upload zone (CSV connectors)
// ---------------------------------------------------------------------------

function FileUploadZone({ connectorId }: { connectorId: string }) {
  const uploadMutation = useUploadFile(connectorId);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      uploadMutation.mutate(file);
    },
    [uploadMutation],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setDragOver(false);
  }, []);

  return (
    <div className="mt-6 space-y-4">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => fileInputRef.current?.click()}
        className={`cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-colors ${
          dragOver
            ? "border-blue-400 bg-blue-50"
            : "border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100"
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.tsv,.xlsx,.xls"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
            e.target.value = "";
          }}
        />

        {uploadMutation.isPending ? (
          <div className="flex flex-col items-center gap-2">
            <Spinner className="h-8 w-8" />
            <p className="text-sm font-medium text-gray-700">Uploading and processing...</p>
          </div>
        ) : (
          <>
            <p className="text-2xl">📄</p>
            <p className="mt-2 text-sm font-medium text-gray-700">
              Drop a CSV or Excel file here, or click to browse
            </p>
            <p className="mt-1 text-xs text-gray-400">
              Supports .csv, .tsv, .xlsx, .xls — max 50 MB
            </p>
          </>
        )}
      </div>

      {/* Upload result */}
      {uploadMutation.isSuccess && uploadMutation.data && (
        <div className="rounded-md bg-green-50 p-4 text-sm text-green-800">
          <p className="font-medium">Upload successful</p>
          <p className="mt-1">
            {uploadMutation.data.totalRows?.toLocaleString() ?? uploadMutation.data.rowCount?.toLocaleString()} total rows
            {" in "}
            {uploadMutation.data.tablesCreated ?? 1} table{(uploadMutation.data.tablesCreated ?? 1) > 1 ? 's' : ''}
            {" — "}
            {(uploadMutation.data.durationMs / 1000).toFixed(1)}s
          </p>
          {uploadMutation.data.sheets?.map((sheet: any) => (
            <div key={sheet.tableName} className="mt-2 rounded border border-green-200 bg-green-100/50 p-2">
              <p className="text-xs font-medium">
                {sheet.sheetName} → <code className="font-mono">{sheet.tableName}</code>
                {" — "}{sheet.rowCount.toLocaleString()} rows
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {sheet.columns.map((col: any) => (
                  <span
                    key={col.name}
                    className="inline-flex items-center gap-0.5 rounded-full bg-green-100 px-1.5 py-0.5 text-[10px]"
                  >
                    {col.name}
                    <span className="text-green-600">({col.type})</span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Upload error */}
      {uploadMutation.isError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {(uploadMutation.error as Error).message || "Upload failed"}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Uploaded files list with download + preview (CSV connectors)
// ---------------------------------------------------------------------------

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function UploadedFilesList({ connectorId }: { connectorId: string }) {
  const { data: files, isLoading } = useStoredFiles();
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);

  const connectorFiles = (files ?? []).filter(
    (f: StoredFile) => f.connectorId === connectorId,
  );

  if (isLoading) return null;
  if (connectorFiles.length === 0) return null;

  const apiBase = import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";
  const token = localStorage.getItem("auth_token");

  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold text-gray-900">
        Uploaded Files ({connectorFiles.length})
      </h2>
      <div className="mt-3 space-y-2">
        {connectorFiles.map((f: StoredFile) => (
          <div key={f.id}>
            <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-lg">📄</span>
                <div>
                  <p className="text-sm font-medium text-gray-900">
                    {f.originalName}
                  </p>
                  <p className="text-xs text-gray-400">
                    {formatSize(f.sizeBytes)} &middot;{" "}
                    {new Date(f.createdAt).toLocaleString()} &middot;{" "}
                    {f.storageProvider}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setPreviewFileId(previewFileId === f.id ? null : f.id)
                  }
                  className="rounded px-2 py-1 text-xs font-medium text-blue-600 hover:bg-blue-50"
                >
                  {previewFileId === f.id ? "Hide Preview" : "Preview"}
                </button>
                <a
                  href={`${apiBase}/storage/download/${f.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => {
                    // Need auth header — use fetch + blob download instead
                    e.preventDefault();
                    fetch(`${apiBase}/storage/download/${f.id}`, {
                      headers: token ? { Authorization: `Bearer ${token}` } : {},
                      redirect: "follow",
                    })
                      .then((res) => {
                        if (res.redirected) {
                          window.open(res.url, "_blank");
                        } else {
                          return res.blob().then((blob) => {
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement("a");
                            a.href = url;
                            a.download = f.originalName;
                            a.click();
                            URL.revokeObjectURL(url);
                          });
                        }
                      })
                      .catch(() => alert("Download failed"));
                  }}
                  className="rounded px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-100"
                >
                  Download
                </a>
              </div>
            </div>

            {previewFileId === f.id && <FilePreviewTable fileId={f.id} />}
          </div>
        ))}
      </div>
    </section>
  );
}

function FilePreviewTable({ fileId }: { fileId: string }) {
  const { data, isLoading, isError } = useFilePreview(fileId, true);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-b-lg border border-t-0 border-gray-200 bg-gray-50 p-6">
        <Spinner className="h-6 w-6" />
        <span className="ml-2 text-sm text-gray-500">Loading preview...</span>
      </div>
    );
  }

  if (isError || !data || data.columns.length === 0) {
    return (
      <div className="rounded-b-lg border border-t-0 border-gray-200 bg-gray-50 p-4 text-sm text-gray-500">
        Unable to preview this file.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-b-lg border border-t-0 border-gray-200">
      <div className="px-4 py-2 bg-gray-50 text-xs text-gray-500">
        Showing {data.rows.length} of {data.totalRows.toLocaleString()} rows
        &middot; {data.columns.length} columns
      </div>
      <table className="min-w-full divide-y divide-gray-200 text-xs">
        <thead className="bg-gray-50">
          <tr>
            {data.columns.map((col) => (
              <th
                key={col}
                className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-500"
              >
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {data.rows.map((row, i) => (
            <tr key={i} className="hover:bg-gray-50">
              {data.columns.map((col) => (
                <td
                  key={col}
                  className="whitespace-nowrap px-3 py-1.5 text-gray-700 max-w-[200px] truncate"
                  title={row[col] ?? ""}
                >
                  {row[col] ?? <span className="text-gray-300">null</span>}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
