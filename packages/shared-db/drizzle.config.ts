import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Ignore Dagster's internal tables so they don't appear as "extra" in diffs
  schemaFilter: ["public"],
  tablesFilter: [
    "tenants",
    "tenant_users",
    "connector_instances",
    "connector_sync_tables",
    "connector_sync_runs",
    "dashboards",
    "widgets",
    "semantic_models",
    "stored_files",
  ],
});
