"""Dagster definitions — the entry point for the Dagster instance."""

import os
from dagster import Definitions
from .jobs import sync_connector_job
from .sensors.sync_sensor import sync_scheduler_sensor
from .resources import PlatformDBResource, WarehouseDBResource

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql://pulseboard:pulseboard_dev@postgres:5432/pulseboard",
)

defs = Definitions(
    jobs=[sync_connector_job],
    sensors=[sync_scheduler_sensor],
    resources={
        "platform_db": PlatformDBResource(database_url=DATABASE_URL),
        "warehouse_db": WarehouseDBResource(database_url=DATABASE_URL),
    },
)
