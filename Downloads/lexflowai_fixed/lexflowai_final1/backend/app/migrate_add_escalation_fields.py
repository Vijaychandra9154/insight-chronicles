"""
One-off migration: add the Escalation Engine columns to an existing DB.

`Base.metadata.create_all()` only creates missing tables, not missing
columns on tables that already exist — so a DB created before this change
needs these columns added by hand.

Run manually:
    python -m app.migrate_add_escalation_fields
"""
from sqlalchemy import inspect, text
from .db import engine


COLUMNS = [
    ("cases", "filed_date", "DATE"),
    ("cases", "escalation_deadline", "DATE"),
    ("cases", "escalation_deadline_basis", "VARCHAR"),
    ("drafts", "kind", "VARCHAR"),
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

    with engine.begin() as conn:
        conn.execute(text("UPDATE drafts SET kind = 'draft' WHERE kind IS NULL"))
    print("Backfilled drafts.kind = 'draft' where unset.")


if __name__ == "__main__":
    run()
