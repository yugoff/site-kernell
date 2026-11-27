"""Export the old Cloud SQLite rows for an empty, migrated D1 database."""

import argparse
import math
import os
import sqlite3
from pathlib import Path


def literal(value):
    if value is None:
        return "NULL"
    if isinstance(value, bytes):
        return f"X'{value.hex()}'"
    if isinstance(value, str):
        if "\0" in value:
            return f"CAST(X'{value.encode().hex()}' AS TEXT)"
        return "'" + value.replace("'", "''") + "'"
    if isinstance(value, int) or (isinstance(value, float) and math.isfinite(value)):
        return str(value)
    raise ValueError("The database contains a value unsupported by D1 SQL import.")


def identifier(name):
    return '"' + name.replace('"', '""') + '"'


def export(source, output):
    schema = Path(__file__).resolve().parents[1] / "cloud/migrations/0001_cloud_schema.sql"
    with sqlite3.connect(source.resolve().as_uri() + "?mode=ro", uri=True) as old:
        old.execute("BEGIN")
        if old.execute("PRAGMA foreign_key_check").fetchone():
            raise ValueError("The source database has dangling foreign keys.")
        with sqlite3.connect(":memory:") as schema_db:
            schema_db.executescript(schema.read_text(encoding="utf-8"))
            tables = schema_db.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY rowid"
            ).fetchall()
            existing = {row[0] for row in old.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if "users" not in existing:
                raise ValueError("The source is not a Kernell Cloud database.")
            descriptor = os.open(output, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            try:
                with os.fdopen(descriptor, "w", encoding="utf-8") as target:
                    for (table,) in tables:
                        if table not in existing:
                            continue
                        quoted_table = identifier(table)
                        current = {row[1] for row in schema_db.execute(f"PRAGMA table_info({quoted_table})")}
                        old_columns = [row[1] for row in old.execute(f"PRAGMA table_info({quoted_table})")]
                        columns = ", ".join(identifier(name) for name in old_columns if name in current)
                        rows = old.execute(f"SELECT {columns} FROM {quoted_table}")
                        for row in rows:
                            statement = f"INSERT INTO {quoted_table} ({columns}) VALUES ({', '.join(map(literal, row))});\n"
                            if len(statement.encode("utf-8")) > 100_000:
                                raise ValueError(f"A row in {table} exceeds D1's 100 KB SQL limit.")
                            target.write(statement)
            except BaseException:
                output.unlink()
                raise


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    arguments = parser.parse_args()
    export(arguments.source, arguments.output)
