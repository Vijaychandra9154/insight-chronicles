"""
One-off migration: add the razorpay_subscription_id column to payments.

`subscriptions` is a brand-new table so `Base.metadata.create_all()` creates
it automatically — no migration needed for that one. `payments` already
exists, so it needs this column added by hand.

Run manually:
    python -m app.migrate_add_subscription_fields
"""
from sqlalchemy import inspect, text
from .db import engine


COLUMNS = [
    ("payments", "razorpay_subscription_id", "VARCHAR"),
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
