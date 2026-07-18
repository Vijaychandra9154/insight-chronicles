"""
One-off migration: assign every ownerless Case to the first User account.

Run manually after signing up at least one user:
    python -m app.migrate_assign_first_owner
"""
from .db import SessionLocal
from . import models


def run():
    db = SessionLocal()
    try:
        first_user = db.query(models.User).order_by(models.User.id.asc()).first()
        if not first_user:
            print("No users exist yet — sign up a user first, then re-run this migration.")
            return

        orphaned = db.query(models.Case).filter(models.Case.user_id.is_(None)).all()
        if not orphaned:
            print("No ownerless cases found. Nothing to do.")
            return

        for case in orphaned:
            case.user_id = first_user.id
        db.commit()

        print(f"Assigned {len(orphaned)} case(s) to {first_user.email} (user_id={first_user.id}).")
    finally:
        db.close()


if __name__ == "__main__":
    run()
