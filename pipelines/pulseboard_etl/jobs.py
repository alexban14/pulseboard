"""Dagster jobs — the main sync pipeline."""

import time
import logging
from dagster import job, op, In, Out, OpExecutionContext, Config
from .resources import PlatformDBResource, WarehouseDBResource
from .connectors.database import DatabaseExtractor

logger = logging.getLogger(__name__)


class SyncConnectorConfig(Config):
    """Config for a single connector sync job."""
    connector_id: str
    tenant_id: str


@op(
    required_resource_keys={"platform_db", "warehouse_db"},
)
def sync_connector(context: OpExecutionContext, config: SyncConnectorConfig):
    """Sync all selected tables for a single connector instance.

    1. Read connector config from platform DB
    2. Get list of selected sync tables
    3. For each table: extract → create warehouse table → load
    4. Update sync run status
    """
    platform: PlatformDBResource = context.resources.platform_db
    warehouse: WarehouseDBResource = context.resources.warehouse_db

    connector_id = config.connector_id
    tenant_id = config.tenant_id
    start_time = time.time()
    total_rows = 0
    tables_synced = 0
    run_id = None

    try:
        # Get connector details
        connectors = platform.get_due_connectors()
        connector = next(
            (c for c in connectors if c["id"] == connector_id),
            None,
        )
        if not connector:
            context.log.error(f"Connector {connector_id} not found or not healthy")
            return

        # Decrypt config
        decrypted_config = platform.decrypt_config(connector["config"])
        connector_type = connector["connector_type_id"]
        sync_mode = connector.get("sync_mode", "incremental")

        # Get sync tables
        sync_tables = platform.get_sync_tables(connector_id)
        if not sync_tables:
            context.log.warning(f"No sync tables configured for {connector_id}")
            return

        # Create sync run
        run_id = platform.create_sync_run(connector_id)
        context.log.info(
            f"Starting sync run {run_id} for connector {connector_id} "
            f"({connector_type}, {len(sync_tables)} tables)"
        )

        # Create extractor
        extractor = DatabaseExtractor(connector_type, decrypted_config)

        # Ensure warehouse schema exists
        schema_name = warehouse.ensure_schema(tenant_id)

        # Sync each table
        for table_config in sync_tables:
            source_table = table_config["source_table"]
            warehouse_table = table_config["warehouse_table"]
            incremental_col = table_config.get("incremental_column")
            last_value = table_config.get("last_sync_value")

            try:
                context.log.info(f"Extracting {source_table}...")

                # Get column info for warehouse table creation
                columns = extractor.get_column_info(source_table)
                warehouse.ensure_table(schema_name, warehouse_table, columns)

                # Extract data
                if incremental_col and sync_mode == "incremental":
                    df = extractor.extract_incremental(
                        source_table, incremental_col, last_value
                    )
                    load_mode = "append"  # incremental: append new rows
                else:
                    df = extractor.extract_full(source_table)
                    load_mode = "replace"  # full: truncate + insert

                # Load into warehouse
                rows = warehouse.load_dataframe(
                    schema_name, warehouse_table, df, mode=load_mode
                )
                total_rows += rows
                tables_synced += 1

                context.log.info(
                    f"  {source_table} → {warehouse_table}: {rows} rows"
                )

                # Update incremental checkpoint
                if incremental_col and not df.is_empty():
                    new_value = str(df[incremental_col].max())
                    platform.update_sync_table_value(
                        connector_id, source_table, new_value
                    )

            except Exception as table_err:
                context.log.error(
                    f"Error syncing table {source_table}: {table_err}"
                )
                # Continue with other tables

        extractor.close()

        # Complete sync run
        duration_ms = int((time.time() - start_time) * 1000)
        platform.complete_sync_run(
            run_id, "completed", total_rows, tables_synced, duration_ms
        )
        platform.update_connector_last_sync(
            connector_id, total_rows, duration_ms
        )

        context.log.info(
            f"Sync completed: {tables_synced} tables, {total_rows} rows, "
            f"{duration_ms}ms"
        )

    except Exception as e:
        duration_ms = int((time.time() - start_time) * 1000)
        context.log.error(f"Sync failed: {e}")

        if run_id:
            platform.complete_sync_run(
                run_id, "failed", total_rows, tables_synced, duration_ms,
                error_message=str(e),
            )
        raise


@job(
    resource_defs={
        "platform_db": PlatformDBResource.configure_at_launch(),
        "warehouse_db": WarehouseDBResource.configure_at_launch(),
    },
)
def sync_connector_job():
    """Job: sync a single connector's tables to the warehouse."""
    sync_connector()
