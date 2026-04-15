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

export const connectorKeys = {
  all: ["connectors"] as const,
  types: ["connectorTypes"] as const,
  detail: (id: string) => ["connectors", id] as const,
  syncTables: (id: string) => ["connectors", id, "sync-tables"] as const,
  syncRuns: (id: string) => ["connectors", id, "sync-runs"] as const,
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
  return useMutation({
    mutationFn: (connectorId: string) =>
      apiClient.post<TestConnectionResult>(`/connectors/${connectorId}/test`),
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
