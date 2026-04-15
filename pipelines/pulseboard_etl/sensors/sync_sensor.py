"""Sensor that checks for connectors due for sync and launches jobs."""

import os
import time
from dagster import sensor, RunRequest, SensorEvaluationContext, DefaultSensorStatus


# Minimum interval between syncs for the same connector (seconds)
# Configurable via SYNC_MIN_INTERVAL_SECONDS env var
MIN_SYNC_INTERVAL = int(os.environ.get("SYNC_MIN_INTERVAL_SECONDS", 6 * 60 * 60))  # default: 6 hours


@sensor(
    job_name="sync_connector_job",
    minimum_interval_seconds=60,
    default_status=DefaultSensorStatus.RUNNING,
)
def sync_scheduler_sensor(context: SensorEvaluationContext):
    """Every 60 seconds, check for connectors due for sync.

    A connector is due if:
    - It has status 'healthy'
    - It has at least one sync table selected
    - It hasn't been synced in the last MIN_SYNC_INTERVAL seconds

    Run key uses timestamp to ensure Dagster doesn't deduplicate.
    """
    from ..resources.platform_db import PlatformDBResource

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        context.log.warning("DATABASE_URL not set, skipping sensor")
        return

    platform = PlatformDBResource(database_url=db_url)
    connectors = platform.get_due_connectors()

    # Parse cursor as JSON dict of connector_id → last_triggered_timestamp
    import json
    last_triggered: dict = {}
    if context.cursor:
        try:
            parsed = json.loads(context.cursor)
            if isinstance(parsed, dict):
                last_triggered = parsed
        except (json.JSONDecodeError, TypeError, ValueError):
            pass

    now = time.time()
    triggered_any = False

    for conn in connectors:
        connector_id = conn["id"]

        # Skip if synced recently
        last_time = last_triggered.get(connector_id, 0)
        if now - last_time < MIN_SYNC_INTERVAL:
            continue

        # Use timestamp in run key to avoid deduplication
        run_key = f"sync-{connector_id}-{int(now)}"

        yield RunRequest(
            run_key=run_key,
            run_config={
                "ops": {
                    "sync_connector": {
                        "config": {
                            "connector_id": connector_id,
                            "tenant_id": conn["tenant_id"],
                        }
                    }
                },
                "resources": {
                    "platform_db": {"config": {"database_url": db_url}},
                    "warehouse_db": {"config": {"database_url": db_url}},
                },
            },
            tags={
                "connector_id": connector_id,
                "tenant_id": conn["tenant_id"],
                "connector_type": conn["connector_type_id"],
            },
        )

        last_triggered[connector_id] = now
        triggered_any = True
        context.log.info(f"Triggered sync for connector {connector_id}")

    if triggered_any:
        context.update_cursor(json.dumps(last_triggered))
