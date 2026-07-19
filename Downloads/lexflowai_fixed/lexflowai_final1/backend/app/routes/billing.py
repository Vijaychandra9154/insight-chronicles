import os
from datetime import datetime, timedelta, timezone

import razorpay
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import db, models
from ..auth import get_current_user

router = APIRouter(prefix="/api/billing", tags=["billing"])

INDIVIDUAL_PLAN_PRICE_INR = 199
FREE_MONTHLY_DOCUMENT_LIMIT = 1

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")


def _get_client():
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        return None
    return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


class VerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def documents_used_this_month(db_session: Session, user_id: int) -> int:
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return (
        db_session.query(models.Draft)
        .join(models.Case, models.Draft.case_id == models.Case.id)
        .filter(models.Case.user_id == user_id, models.Draft.created_at >= start_of_month)
        .count()
    )


@router.get("/status")
def billing_status(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    used = documents_used_this_month(db_session, current_user.id)
    return {
        "plan": current_user.plan,
        "plan_expires_at": current_user.plan_expires_at,
        "is_paid_active": current_user.is_paid_active,
        "drafts_used_this_month": used,
        "drafts_limit": None if current_user.is_paid_active else FREE_MONTHLY_DOCUMENT_LIMIT,
    }


@router.post("/checkout")
def create_checkout(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = _get_client()
    if not client:
        raise HTTPException(status_code=503, detail="Billing is not configured yet. Please try again later.")

    amount_paise = INDIVIDUAL_PLAN_PRICE_INR * 100
    order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "payment_capture": 1,
    })

    payment = models.Payment(
        user_id=current_user.id,
        razorpay_order_id=order["id"],
        amount=amount_paise,
        status="created",
    )
    db_session.add(payment)
    db_session.commit()

    return {
        "order_id": order["id"],
        "amount": amount_paise,
        "currency": "INR",
        "key_id": RAZORPAY_KEY_ID,
    }


@router.post("/verify")
def verify_payment(
    req: VerifyRequest,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    client = _get_client()
    if not client:
        raise HTTPException(status_code=503, detail="Billing is not configured yet. Please try again later.")

    payment = (
        db_session.query(models.Payment)
        .filter(
            models.Payment.razorpay_order_id == req.razorpay_order_id,
            models.Payment.user_id == current_user.id,
        )
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="No matching order for this account.")

    if payment.status == "paid":
        # Already processed (e.g. a duplicate verify call) - don't re-credit.
        return {"plan": current_user.plan, "plan_expires_at": current_user.plan_expires_at}

    try:
        client.utility.verify_payment_signature({
            "razorpay_order_id": req.razorpay_order_id,
            "razorpay_payment_id": req.razorpay_payment_id,
            "razorpay_signature": req.razorpay_signature,
        })
    except razorpay.errors.SignatureVerificationError:
        payment.status = "failed"
        db_session.add(payment)
        db_session.commit()
        raise HTTPException(status_code=400, detail="Payment verification failed.")

    payment.razorpay_payment_id = req.razorpay_payment_id
    payment.status = "paid"
    db_session.add(payment)

    now = datetime.now(timezone.utc)
    current_expiry = current_user.plan_expires_at
    if current_expiry and current_expiry.tzinfo is None:
        current_expiry = current_expiry.replace(tzinfo=timezone.utc)
    base = current_expiry if (current_expiry and current_expiry > now) else now

    current_user.plan = "individual"
    current_user.plan_expires_at = base + timedelta(days=30)
    db_session.add(current_user)
    db_session.commit()
    db_session.refresh(current_user)

    return {"plan": current_user.plan, "plan_expires_at": current_user.plan_expires_at}
