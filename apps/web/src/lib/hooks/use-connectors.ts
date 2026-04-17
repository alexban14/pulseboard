import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api-client.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ConfigField {
  key: string;
  label: string;
  type: "text" | "number" | "password" | "boolean" | "select" | "textarea";
  required?: boolean;
  default?: unknown;
  placeholder?: string;
  helpText?: string;
  options?: { label: string; value: string }[];
}

export interface ConnectorType {
  id: string;
  name: string;
  category: string;
  icon: string;
  description: string;
  configFields: ConfigField[];
  capabilities: string[];
}

export interface ConnectorInstance {
  id: string;
  name: string;
  connectorTypeId: string;
  status: "healthy" | "pending" | "error" | "degraded";
  lastSyncAt: string | null;
  lastSyncRows: number | null;
  syncSchedule: string | null;
}

export interface TestConnectionResult {
  success: boolean;
  message: string;
  latencyMs: number;
  serverVersion: string;
}

export interface DiscoveredColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  referencesTable: string | null;
}

export interface DiscoveredTable {
  name: string;
  columns: DiscoveredColumn[];
  primaryKey: string[];
  estimatedRowCount: number;
}

export interface DiscoverSchemaResult {
  tables: DiscoveredTable[];
  discoveredAt: string;
}

export interface SyncTable {
  sourceTable: string;
  incrementalColumn?: string;
}

export interface SyncRun {
  id: string;
  status: "running" | "completed" | "failed";
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
  rowsSynced: number | null;
  error: string | null;
}

// ---------------------------------------------------------------------------
// Query keys
// ---------------------------------------------------------------------------

export interface StoredFile {
  id: string;
  key: string;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  storageProvider: string;
  purpose: string;
  connectorId: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export const connectorKeys = {
  all: ["connectors"] as const,
  types: ["connectorTypes"] as const,
  detail: (id: string) => ["connectors", id] as const,
  syncTables: (id: string) => ["connectors", id, "sync-tables"] as const,
  syncRuns: (id: string) => ["connectors", id, "sync-runs"] as const,
  storedFiles: ["storedFiles"] as const,
};

// ---------------------------------------------------------------------------
// Query hooks
// ---------------------------------------------------------------------------

export function useConnectorTypes() {
  return useQuery({
    queryKey: connectorKeys.types,
    queryFn: () => apiClient.get<ConnectorType[]>("/connectors/types"),
    staleTime: 1000 * 60 * 10,
  });
}

export function useConnectors() {
  return useQuery({
    queryKey: connectorKeys.all,
    queryFn: () => apiClient.get<ConnectorInstance[]>("/connectors"),
    refetchInterval: 30_000,
  });
}

export function useConnector(id: string) {
  return useQuery({
    queryKey: connectorKeys.detail(id),
    queryFn: () => apiClient.get<ConnectorInstance>(`/connectors/${id}`),
    enabled: !!id,
  });
}

export function useSyncTables(connectorId: string) {
  return useQuery({
    queryKey: connectorKeys.syncTables(connectorId),
    queryFn: () =>
      apiClient.get<SyncTable[]>(`/connectors/${connectorId}/sync-tables`),
    enabled: !!connectorId,
  });
}

export function useSyncRuns(connectorId: string) {
  return useQuery({
    queryKey: connectorKeys.syncRuns(connectorId),
    queryFn: () =>
      apiClient.get<SyncRun[]>(`/connectors/${connectorId}/sync-runs`),
    enabled: !!connectorId,
  });
}

export function useStoredFiles() {
  return useQuery({
    queryKey: connectorKeys.storedFiles,
    queryFn: () => apiClient.get<StoredFile[]>("/storage/files"),
  });
}

export interface FilePreview {
  columns: string[];
  rows: Record<string, string | null>[];
  totalRows: number;
}

export function useFilePreview(fileId: string, enabled = false) {
  return useQuery({
    queryKey: ["filePreview", fileId],
    queryFn: () => apiClient.get<FilePreview>(`/storage/preview/${fileId}?limit=100`),
    enabled: enabled && !!fileId,
  });
}

export function useDeleteFile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (fileId: string) =>
      apiClient.delete(`/storage/${fileId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: connectorKeys.storedFiles });
    },
  });
}

// ---------------------------------------------------------------------------
// Mutation hooks
// ---------------------------------------------------------------------------

export function useCreateConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      connectorTypeId: string;
      name: string;
      config: Record<string, unknown>;
      syncSchedule?: string;
      syncMode?: string;
    }) => apiClient.post<ConnectorInstance>("/connectors", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useTestConnection() {
  return useMutation({
    mutationFn: (body: {
      connectorTypeId: string;
      config: Record<string, unknown>;
    }) => apiClient.post<TestConnectionResult>("/connectors/test", body),
  });
}

export function useTestStoredConnection() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (connectorId: string) =>
      apiClient.post<TestConnectionResult>(`/connectors/${connectorId}/test`),
    onSuccess: (_data, connectorId) => {
      // Refresh connector detail to update status badge
      queryClient.invalidateQueries({ queryKey: connectorKeys.detail(connectorId) });
      queryClient.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export function useDiscoverSchema(connectorId: string) {
  return useMutation({
    mutationFn: () =>
      apiClient.post<DiscoverSchemaResult>(
        `/connectors/${connectorId}/discover`,
      ),
  });
}

export function useSelectTables(connectorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tables: SyncTable[]) =>
      apiClient.post(`/connectors/${connectorId}/select-tables`, { tables }),
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: connectorKeys.syncTables(connectorId),
      });
    },
  });
}

export function useDeleteConnector() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/connectors/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: connectorKeys.all });
    },
  });
}

export interface TriggerSyncResult {
  triggered: boolean;
  message: string;
  connectorId: string;
  tableCount: number;
}

export function useTriggerSync() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (connectorId: string) =>
      apiClient.post<TriggerSyncResult>(
        `/connectors/${connectorId}/trigger-sync`,
      ),
    onSuccess: (_data, connectorId) => {
      qc.invalidateQueries({ queryKey: connectorKeys.detail(connectorId) });
      qc.invalidateQueries({ queryKey: connectorKeys.syncRuns(connectorId) });
    },
  });
}

export interface UploadSheetResult {
  sheetName: string;
  tableName: string;
  columns: { name: string; type: string }[];
  rowCount: number;
}

export interface UploadResult {
  success: boolean;
  sheets: UploadSheetResult[];
  totalRows: number;
  tablesCreated: number;
  schema: string;
  durationMs: number;
  // Legacy single-sheet compat
  tableName?: string;
  columns?: { name: string; type: string }[];
  rowCount?: number;
}

export function useUploadFile(connectorId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);

      const token = localStorage.getItem("auth_token");
      const baseUrl =
        import.meta.env.VITE_API_URL ?? "http://localhost:3000/api";

      const res = await fetch(
        `${baseUrl}/connectors/${connectorId}/upload`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData,
        },
      );

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message ?? "Upload failed");
      }

      return res.json() as Promise<UploadResult>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: connectorKeys.detail(connectorId) });
      qc.invalidateQueries({ queryKey: connectorKeys.all });
      qc.invalidateQueries({ queryKey: connectorKeys.syncTables(connectorId) });
      qc.invalidateQueries({ queryKey: connectorKeys.syncRuns(connectorId) });
    },
  });
}
