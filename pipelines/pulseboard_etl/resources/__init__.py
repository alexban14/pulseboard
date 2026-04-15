"""Dagster resources — shared database connections and platform config."""

from .platform_db import PlatformDBResource
from .warehouse_db import WarehouseDBResource

__all__ = ["PlatformDBResource", "WarehouseDBResource"]
