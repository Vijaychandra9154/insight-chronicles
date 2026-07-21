"""
One-off migration: add firm-related columns to existing tables.

`firms` is a brand-new table so `Base.metadata.create_all()` creates it
automatically. `users` and `cases` already exist, so they need these
columns added by hand.

Run manually:
    python -m app.migrate_add_firm_fields
"""
from sqlalchemy import inspect, text
from .db import engine


COLUMNS = [
    ("users", "firm_id", "INTEGER"),
    ("users", "firm_role", "VARCHAR"),
    ("cases", "firm_id", "INTEGER"),
]


def run():
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table, column, coltype in COLUMNS:
            existing = {c["name"] for c in inspector.get_columns(table)}
            if column in existing:
                print(f"{table}.{column} already exists — skipping.")
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {column} {coltype}"))
            print(f"Added {table}.{column} ({coltype}).")


if __name__ == "__main__":
    run()
