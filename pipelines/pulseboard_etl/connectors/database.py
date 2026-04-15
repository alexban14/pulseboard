"""Generic SQL database extractor — supports MySQL and PostgreSQL."""

from sqlalchemy import create_engine, text
import polars as pl
import logging

logger = logging.getLogger(__name__)


class DatabaseExtractor:
    """Extracts data from a SQL database (MySQL or PostgreSQL)."""

    def __init__(self, connector_type: str, config: dict):
        self.connector_type = connector_type
        self.config = config
        self._engine = None

    def _get_engine(self):
        if self._engine is None:
            if self.connector_type == "mysql":
                url = (
                    f"mysql+pymysql://{self.config['username']}:{self.config['password']}"
                    f"@{self.config['host']}:{self.config.get('port', 3306)}"
                    f"/{self.config['database']}"
                )
                if self.config.get("ssl"):
                    url += "?ssl=true&ssl_verify_cert=false"
            elif self.connector_type == "postgresql":
                url = (
                    f"postgresql+psycopg2://{self.config['username']}:{self.config['password']}"
                    f"@{self.config['host']}:{self.config.get('port', 5432)}"
                    f"/{self.config['database']}"
                )
            else:
                raise ValueError(f"Unsupported connector type: {self.connector_type}")

            self._engine = create_engine(url, pool_size=2, pool_pre_ping=True)
        return self._engine

    def _rows_to_dataframe(self, columns: list[str], rows: list) -> pl.DataFrame:
        """Convert SQL result rows to a Polars DataFrame with all-string schema.

        MySQL/MariaDB returns mixed types (NULL vs int vs datetime in the same
        column across rows). Polars infers types from early rows and fails when
        later rows have a different type. Fix: cast everything to string.
        The warehouse loader handles the correct PG types via its column defs.
        """
        if not rows:
            return pl.DataFrame(schema={col: pl.Utf8 for col in columns})

        data = {col: [] for col in columns}
        for row in rows:
            for col, val in zip(columns, row):
                data[col].append(str(val) if val is not None else None)

        return pl.DataFrame(data)

    def extract_full(self, table_name: str) -> pl.DataFrame:
        """Full extraction — SELECT * from the source table."""
        engine = self._get_engine()
        logger.info(f"Full extract: {table_name}")

        quote = "`" if self.connector_type == "mysql" else '"'
        with engine.connect() as conn:
            result = conn.execute(text(f"SELECT * FROM {quote}{table_name}{quote}"))
            columns = list(result.keys())
            rows = result.fetchall()

        return self._rows_to_dataframe(columns, rows)

    def extract_incremental(
        self,
        table_name: str,
        incremental_column: str,
        last_value: str | None,
    ) -> pl.DataFrame:
        """Incremental extraction — only rows where incremental_column > last_value."""
        engine = self._get_engine()

        if last_value is None:
            logger.info(f"Incremental extract (first run, full): {table_name}")
            return self.extract_full(table_name)

        logger.info(f"Incremental extract: {table_name} WHERE {incremental_column} > {last_value}")

        quote = "`" if self.connector_type == "mysql" else '"'
        query = f"""
            SELECT * FROM {quote}{table_name}{quote}
            WHERE {quote}{incremental_column}{quote} > :last_value
            ORDER BY {quote}{incremental_column}{quote} ASC
        """

        with engine.connect() as conn:
            result = conn.execute(text(query), {"last_value": last_value})
            columns = list(result.keys())
            rows = result.fetchall()

        return self._rows_to_dataframe(columns, rows)

    def get_column_info(self, table_name: str) -> list[dict]:
        """Get column names and types for a source table (for warehouse table creation)."""
        engine = self._get_engine()

        type_map_mysql = {
            "int": "integer", "bigint": "integer", "smallint": "integer",
            "tinyint": "integer", "mediumint": "integer",
            "decimal": "decimal", "float": "decimal", "double": "decimal",
            "varchar": "string", "char": "string", "text": "string",
            "mediumtext": "string", "longtext": "string", "tinytext": "string",
            "enum": "string", "set": "string",
            "date": "date", "datetime": "datetime", "timestamp": "datetime",
            "json": "json", "bit": "boolean",
        }

        type_map_pg = {
            "integer": "integer", "bigint": "integer", "smallint": "integer",
            "numeric": "decimal", "real": "decimal", "double precision": "decimal",
            "character varying": "string", "character": "string", "text": "string",
            "boolean": "boolean", "date": "date",
            "timestamp without time zone": "datetime",
            "timestamp with time zone": "datetime",
            "jsonb": "json", "json": "json",
        }

        type_map = type_map_mysql if self.connector_type == "mysql" else type_map_pg

        with engine.connect() as conn:
            if self.connector_type == "mysql":
                rows = conn.execute(
                    text("""
                        SELECT column_name, data_type
                        FROM information_schema.columns
                        WHERE table_schema = :db AND table_name = :tbl
                        ORDER BY ordinal_position
                    """),
                    {"db": self.config["database"], "tbl": table_name},
                ).fetchall()
            else:
                schema = self.config.get("schema", "public")
                rows = conn.execute(
                    text("""
                        SELECT column_name, data_type
                        FROM information_schema.columns
                        WHERE table_schema = :schema AND table_name = :tbl
                        ORDER BY ordinal_position
                    """),
                    {"schema": schema, "tbl": table_name},
                ).fetchall()

        return [
            {"name": row[0], "type": type_map.get(row[1], "string")}
            for row in rows
        ]

    def close(self):
        if self._engine:
            self._engine.dispose()
            self._engine = None
