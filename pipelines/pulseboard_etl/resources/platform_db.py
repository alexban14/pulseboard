"""Platform database resource — reads connector configs, sync tables, updates run status."""

from dagster import ConfigurableResource
from sqlalchemy import create_engine, text
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import base64
import hashlib
import json
import os


class PlatformDBResource(ConfigurableResource):
    """Connects to the Pulseboard platform database to read connector
    configs and update sync status."""

    database_url: str
    encryption_key: str = ""  # hex key or empty (derives from JWT_SECRET)

    def _get_engine(self):
        return create_engine(self.database_url, pool_size=2, pool_pre_ping=True)

    def _get_aes_key(self) -> bytes:
        if self.encryption_key and len(self.encryption_key) >= 64:
            return bytes.fromhex(self.encryption_key)
        # Derive from JWT_SECRET (same as NestJS EncryptionService)
        secret = os.environ.get("JWT_SECRET", "dev-fallback")
        return hashlib.sha256(secret.encode()).digest()

    def decrypt_config(self, encrypted: str) -> dict:
        """Decrypt a connector config (AES-256-GCM, base64-encoded)."""
        data = base64.b64decode(encrypted)
        iv = data[:12]
        tag = data[12:28]
        ciphertext = data[28:]
        aesgcm = AESGCM(self._get_aes_key())
        plaintext = aesgcm.decrypt(iv, ciphertext + tag, None)
        return json.loads(plaintext.decode("utf-8"))

    def get_due_connectors(self) -> list[dict]:
        """Get all connector instances that have sync tables selected."""
        engine = self._get_engine()
        with engine.connect() as conn:
            rows = conn.execute(text("""
                SELECT DISTINCT
                    ci.id,
                    ci.tenant_id,
                    ci.connector_type_id,
                    ci.config,
                    ci.sync_mode
                FROM connector_instances ci
                INNER JOIN connector_sync_tables cst
                    ON cst.connector_instance_id = ci.id
                    AND cst.sync_enabled = true
                WHERE ci.status = 'healthy'
            """)).fetchall()
        engine.dispose()
        return [dict(r._mapping) for r in rows]

    def get_sync_tables(self, connector_id: str) -> list[dict]:
        """Get sync table configs for a connector."""
        engine = self._get_engine()
        with engine.connect() as conn:
            rows = conn.execute(
                text("""
                    SELECT source_table, warehouse_table, incremental_column, last_sync_value
                    FROM connector_sync_tables
                    WHERE connector_instance_id = :cid AND sync_enabled = true
                """),
                {"cid": connector_id},
            ).fetchall()
        engine.dispose()
        return [dict(r._mapping) for r in rows]

    def create_sync_run(self, connector_id: str) -> str:
        """Create a new sync run record, return its ID."""
        from ulid import ULID

        run_id = str(ULID())
        engine = self._get_engine()
        with engine.connect() as conn:
            conn.execute(
                text("""
                    INSERT INTO connector_sync_runs
                        (id, connector_instance_id, started_at, status)
                    VALUES (:id, :cid, NOW(), 'running')
                """),
                {"id": run_id, "cid": connector_id},
            )
            conn.commit()
        engine.dispose()
        return run_id

    def complete_sync_run(
        self,
        run_id: str,
        status: str,
        rows_synced: int,
        tables_synced: int,
        duration_ms: int,
        error_message: str | None = None,
    ):
        """Update a sync run with final status."""
        engine = self._get_engine()
        with engine.connect() as conn:
            conn.execute(
                text("""
                    UPDATE connector_sync_runs
                    SET status = :status,
                        completed_at = NOW(),
                        rows_synced = :rows,
                        tables_synced = :tables,
                        duration_ms = :dur,
                        error_message = :err
                    WHERE id = :id
                """),
                {
                    "id": run_id,
                    "status": status,
                    "rows": rows_synced,
                    "tables": tables_synced,
                    "dur": duration_ms,
                    "err": error_message,
                },
            )
            conn.commit()
        engine.dispose()

    def update_connector_last_sync(
        self, connector_id: str, rows_synced: int, duration_ms: int
    ):
        """Update the connector instance with last sync info."""
        engine = self._get_engine()
        with engine.connect() as conn:
            conn.execute(
                text("""
                    UPDATE connector_instances
                    SET last_sync_at = NOW(),
                        last_sync_rows = :rows,
                        last_sync_duration_ms = :dur,
                        updated_at = NOW()
                    WHERE id = :cid
                """),
                {"cid": connector_id, "rows": rows_synced, "dur": duration_ms},
            )
            conn.commit()
        engine.dispose()

    def update_sync_table_value(
        self, connector_id: str, source_table: str, last_value: str
    ):
        """Update the incremental sync checkpoint for a table."""
        engine = self._get_engine()
        with engine.connect() as conn:
            conn.execute(
                text("""
                    UPDATE connector_sync_tables
                    SET last_sync_value = :val
                    WHERE connector_instance_id = :cid AND source_table = :tbl
                """),
                {"cid": connector_id, "val": last_value, "tbl": source_table},
            )
            conn.commit()
        engine.dispose()
