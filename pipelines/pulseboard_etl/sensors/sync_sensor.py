"""Sensor that checks for connectors due for sync and launches jobs."""

import os
from dagster import sensor, RunRequest, SensorEvaluationContext, DefaultSensorStatus


@sensor(
    job_name="sync_connector_job",
    minimum_interval_seconds=60,
    default_status=DefaultSensorStatus.RUNNING,
)
def sync_scheduler_sensor(context: SensorEvaluationContext):
    """Every 60 seconds, check for connectors with sync tables and trigger jobs.

    For now, this triggers ALL healthy connectors with selected tables.
    Later, we'll add cron-based scheduling per connector.
    """
    from ..resources.platform_db import PlatformDBResource

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        context.log.warning("DATABASE_URL not set, skipping sensor")
        return

    platform = PlatformDBResource(database_url=db_url)
    connectors = platform.get_due_connectors()

    for conn in connectors:
        run_key = f"sync-{conn['id']}-{context.cursor or '0'}"

        yield RunRequest(
            run_key=run_key,
            run_config={
                "ops": {
                    "sync_connector": {
                        "config": {
                            "connector_id": conn["id"],
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
                "connector_id": conn["id"],
                "tenant_id": conn["tenant_id"],
                "connector_type": conn["connector_type_id"],
            },
        )

    context.update_cursor(str(context.cursor or 0))
