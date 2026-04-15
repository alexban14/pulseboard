"""Warehouse database resource — creates tenant schemas and loads data."""

from dagster import ConfigurableResource
from sqlalchemy import create_engine, text, inspect
import polars as pl


class WarehouseDBResource(ConfigurableResource):
    """Manages the per-tenant warehouse schemas in PostgreSQL."""

    database_url: str

    def _get_engine(self):
        return create_engine(self.database_url, pool_size=2, pool_pre_ping=True)

    def ensure_schema(self, tenant_id: str) -> str:
        """Create the warehouse schema for a tenant if it doesn't exist."""
        schema_name = f"warehouse_{tenant_id[:8].lower()}"
        engine = self._get_engine()
        with engine.connect() as conn:
            conn.execute(text(f"CREATE SCHEMA IF NOT EXISTS {schema_name}"))
            conn.commit()
        engine.dispose()
        return schema_name

    def ensure_table(
        self,
        schema_name: str,
        table_name: str,
        columns: list[dict],
    ):
        """Create or update a warehouse table based on discovered columns.

        columns: [{"name": "col_name", "type": "string|integer|decimal|..."}]
        """
        engine = self._get_engine()
        full_table = f"{schema_name}.{table_name}"

        type_map = {
            "string": "TEXT",
            "integer": "BIGINT",
            "decimal": "NUMERIC",
            "boolean": "BOOLEAN",
            "date": "DATE",
            "datetime": "TIMESTAMPTZ",
            "json": "JSONB",
            "binary": "BYTEA",
        }

        with engine.connect() as conn:
            # Check if table exists
            exists = conn.execute(
                text("""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_schema = :schema AND table_name = :table
                    )
                """),
                {"schema": schema_name, "table": table_name},
            ).scalar()

            if not exists:
                col_defs = ",\n    ".join(
                    f'"{col["name"]}" {type_map.get(col["type"], "TEXT")}'
                    for col in columns
                )
                conn.execute(text(f"""
                    CREATE TABLE {full_table} (
                        _pb_id BIGSERIAL,
                        _pb_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        _pb_source_id TEXT,
                        {col_defs}
                    )
                """))
                # Index on synced_at for retention queries
                conn.execute(text(
                    f"CREATE INDEX ON {full_table} (_pb_synced_at)"
                ))
            else:
                # Schema evolution: add missing columns
                existing_cols = set()
                for row in conn.execute(text("""
                    SELECT column_name FROM information_schema.columns
                    WHERE table_schema = :schema AND table_name = :table
                """), {"schema": schema_name, "table": table_name}).fetchall():
                    existing_cols.add(row[0])

                for col in columns:
                    if col["name"] not in existing_cols:
                        pg_type = type_map.get(col["type"], "TEXT")
                        conn.execute(text(
                            f'ALTER TABLE {full_table} ADD COLUMN "{col["name"]}" {pg_type}'
                        ))

            conn.commit()
        engine.dispose()

    def load_dataframe(
        self,
        schema_name: str,
        table_name: str,
        df: pl.DataFrame,
        mode: str = "replace",
        source_id_column: str | None = None,
    ) -> int:
        """Load a Polars DataFrame into a warehouse table.

        mode:
          - "replace": truncate + insert (full refresh)
          - "upsert": insert on conflict update (incremental, requires source_id_column)
          - "append": insert only
        """
        if df.is_empty():
            return 0

        engine = self._get_engine()
        full_table = f"{schema_name}.{table_name}"
        row_count = len(df)

        with engine.connect() as conn:
            if mode == "replace":
                conn.execute(text(f"TRUNCATE TABLE {full_table}"))

            # Build INSERT statement
            col_names = df.columns
            placeholders = ", ".join(f":{c}" for c in col_names)
            col_list = ", ".join(f'"{c}"' for c in col_names)

            if mode == "upsert" and source_id_column:
                # Insert with ON CONFLICT
                update_cols = ", ".join(
                    f'"{c}" = EXCLUDED."{c}"'
                    for c in col_names
                    if c != source_id_column
                )
                sql = f"""
                    INSERT INTO {full_table} ({col_list}, _pb_synced_at, _pb_source_id)
                    VALUES ({placeholders}, NOW(), :{source_id_column})
                    ON CONFLICT (_pb_source_id) DO UPDATE SET
                        {update_cols},
                        _pb_synced_at = NOW()
                """
            else:
                sql = f"""
                    INSERT INTO {full_table} ({col_list}, _pb_synced_at)
                    VALUES ({placeholders}, NOW())
                """

            # Convert to list of dicts for executemany
            rows = df.to_dicts()

            # Batch insert (chunks of 1000)
            batch_size = 1000
            for i in range(0, len(rows), batch_size):
                batch = rows[i : i + batch_size]
                conn.execute(text(sql), batch)

            conn.commit()

        engine.dispose()
        return row_count
