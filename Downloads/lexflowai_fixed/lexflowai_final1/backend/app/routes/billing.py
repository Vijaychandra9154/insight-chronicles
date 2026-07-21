import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Literal

import razorpay
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import db, models
from ..auth import get_current_user

router = APIRouter(prefix="/api/billing", tags=["billing"])

INDIVIDUAL_PLAN_PRICE_INR = 199
TEAM_PLAN_PRICE_INR = 999
FREE_MONTHLY_DOCUMENT_LIMIT = 1

PLAN_CONFIG = {
    "individual": {
        "price_inr": INDIVIDUAL_PLAN_PRICE_INR,
        "razorpay_plan_id_env": "RAZORPAY_PLAN_ID_INDIVIDUAL",
    },
    "team": {
        "price_inr": TEAM_PLAN_PRICE_INR,
        "razorpay_plan_id_env": "RAZORPAY_PLAN_ID_TEAM",
    },
}

# Razorpay requires a fixed total_count for a subscription rather than an
# open-ended one; 1200 months (100 years) is the practical "until cancelled"
# value — the user can cancel any time via /api/billing/cancel.
SUBSCRIPTION_TOTAL_COUNT = 1200

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")
RAZORPAY_PLAN_ID_INDIVIDUAL = os.getenv("RAZORPAY_PLAN_ID_INDIVIDUAL")
RAZORPAY_PLAN_ID_TEAM = os.getenv("RAZORPAY_PLAN_ID_TEAM")
RAZORPAY_WEBHOOK_SECRET = os.getenv("RAZORPAY_WEBHOOK_SECRET")

_RAZORPAY_PLAN_IDS = {
    "individual": RAZORPAY_PLAN_ID_INDIVIDUAL,
    "team": RAZORPAY_PLAN_ID_TEAM,
}


def _get_client():
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        return None
    return razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))


class CheckoutRequest(BaseModel):
    plan: Literal["individual", "team"] = "individual"


class VerifyRequest(BaseModel):
    razorpay_subscription_id: str
    razorpay_payment_id: str
    razorpay_signature: str


def user_has_unlimited_access(db_session: Session, user: models.User) -> bool:
    if user.is_paid_active:
        return True
    if not user.firm_id:
        return False
    firm = db_session.query(models.Firm).filter(models.Firm.id == user.firm_id).first()
    return bool(firm and firm.is_paid_active)


def documents_used_this_month(db_session: Session, user_id: int) -> int:
    now = datetime.now(timezone.utc)
    start_of_month = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return (
        db_session.query(models.Draft)
        .join(models.Case, models.Draft.case_id == models.Case.id)
        .filter(models.Case.user_id == user_id, models.Draft.created_at >= start_of_month)
        .count()
    )


def _apply_active_subscription(db_session: Session, subscription: models.Subscription, current_end: datetime):
    user = db_session.query(models.User).filter(models.User.id == subscription.user_id).first()
    if not user:
        return

    subscription.current_end = current_end
    subscription.status = "active"

    if subscription.plan_type == "team":
        firm = None
        if subscription.firm_id:
            firm = db_session.query(models.Firm).filter(models.Firm.id == subscription.firm_id).first()
        if not firm:
            firm = models.Firm(
                name=f"{user.full_name or user.email}'s Firm",
                owner_user_id=user.id,
                invite_code=secrets.token_urlsafe(6),
            )
            db_session.add(firm)
            db_session.flush()
            subscription.firm_id = firm.id
            user.firm_id = firm.id
            user.firm_role = "owner"
        firm.plan = "team"
        firm.plan_expires_at = current_end
        db_session.add(firm)
    else:
        user.plan = "individual"
        user.plan_expires_at = current_end

    db_session.add(subscription)
    db_session.add(user)
    db_session.commit()


@router.get("/status")
def billing_status(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    used = documents_used_this_month(db_session, current_user.id)
    unlimited = user_has_unlimited_access(db_session, current_user)
    individual_sub = (
        db_session.query(models.Subscription)
        .filter(models.Subscription.user_id == current_user.id, models.Subscription.plan_type == "individual")
        .order_by(models.Subscription.id.desc())
        .first()
    )
    team_sub = None
    firm = None
    if current_user.firm_id:
        firm = db_session.query(models.Firm).filter(models.Firm.id == current_user.firm_id).first()
        if current_user.firm_role == "owner":
            team_sub = (
                db_session.query(models.Subscription)
                .filter(models.Subscription.user_id == current_user.id, models.Subscription.plan_type == "team")
                .order_by(models.Subscription.id.desc())
                .first()
            )

    return {
        "plan": current_user.plan,
        "plan_expires_at": current_user.plan_expires_at,
        "is_paid_active": current_user.is_paid_active,
        "drafts_used_this_month": used,
        "drafts_limit": None if unlimited else FREE_MONTHLY_DOCUMENT_LIMIT,
        "subscription_status": individual_sub.status if individual_sub else None,
        "cancel_at_cycle_end": bool(individual_sub.cancel_at_cycle_end) if individual_sub else False,
        "firm": {
            "is_paid_active": firm.is_paid_active,
            "plan_expires_at": firm.plan_expires_at,
            "my_role": current_user.firm_role,
            "cancel_at_cycle_end": bool(team_sub.cancel_at_cycle_end) if team_sub else False,
        } if firm else None,
    }


@router.post("/checkout")
def create_checkout(
    req: CheckoutRequest = CheckoutRequest(),
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if req.plan == "team" and current_user.firm_id and current_user.firm_role != "owner":
        raise HTTPException(status_code=403, detail="Only the firm owner can manage the Team plan.")

    client = _get_client()
    razorpay_plan_id = _RAZORPAY_PLAN_IDS.get(req.plan)
    if not client or not razorpay_plan_id:
        raise HTTPException(status_code=503, detail="Billing is not configured yet. Please try again later.")

    subscription = client.subscription.create({
        "plan_id": razorpay_plan_id,
        "total_count": SUBSCRIPTION_TOTAL_COUNT,
        "customer_notify": 1,
        "notes": {"user_id": str(current_user.id), "email": current_user.email, "plan_type": req.plan},
    })

    db_session.add(models.Subscription(
        user_id=current_user.id,
        firm_id=current_user.firm_id if req.plan == "team" else None,
        plan_type=req.plan,
        razorpay_subscription_id=subscription["id"],
        razorpay_plan_id=razorpay_plan_id,
        status=subscription["status"],
    ))
    db_session.commit()

    return {
        "subscription_id": subscription["id"],
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

    subscription = (
        db_session.query(models.Subscription)
        .filter(
            models.Subscription.razorpay_subscription_id == req.razorpay_subscription_id,
            models.Subscription.user_id == current_user.id,
        )
        .first()
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="No matching subscription for this account.")

    if subscription.status == "active":
        # Already processed (e.g. a duplicate verify call) - don't re-credit.
        return {"plan": current_user.plan, "plan_expires_at": current_user.plan_expires_at}

    expected_signature = hmac.new(
        RAZORPAY_KEY_SECRET.encode(),
        f"{req.razorpay_payment_id}|{req.razorpay_subscription_id}".encode(),
        hashlib.sha256,
    ).hexdigest()
    if not hmac.compare_digest(expected_signature, req.razorpay_signature):
        raise HTTPException(status_code=400, detail="Payment verification failed.")

    price_inr = PLAN_CONFIG[subscription.plan_type]["price_inr"]
    db_session.add(models.Payment(
        user_id=current_user.id,
        razorpay_subscription_id=req.razorpay_subscription_id,
        razorpay_payment_id=req.razorpay_payment_id,
        amount=price_inr * 100,
        status="paid",
    ))

    remote = client.subscription.fetch(req.razorpay_subscription_id)
    current_end = datetime.fromtimestamp(remote["current_end"], tz=timezone.utc) if remote.get("current_end") else (
        datetime.now(timezone.utc) + timedelta(days=30)
    )
    _apply_active_subscription(db_session, subscription, current_end)
    db_session.refresh(current_user)

    return {"plan": current_user.plan, "plan_expires_at": current_user.plan_expires_at}


@router.post("/cancel")
def cancel_subscription(
    req: CheckoutRequest = CheckoutRequest(),
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    plan = req.plan
    if plan == "team" and current_user.firm_role != "owner":
        raise HTTPException(status_code=403, detail="Only the firm owner can cancel the Team plan.")

    client = _get_client()
    if not client:
        raise HTTPException(status_code=503, detail="Billing is not configured yet. Please try again later.")

    subscription = (
        db_session.query(models.Subscription)
        .filter(
            models.Subscription.user_id == current_user.id,
            models.Subscription.plan_type == plan,
            models.Subscription.status == "active",
        )
        .order_by(models.Subscription.id.desc())
        .first()
    )
    if not subscription:
        raise HTTPException(status_code=404, detail="No active subscription to cancel.")

    client.subscription.cancel(subscription.razorpay_subscription_id, {"cancel_at_cycle_end": 1})
    subscription.cancel_at_cycle_end = 1
    db_session.add(subscription)
    db_session.commit()

    access_until = current_user.plan_expires_at
    if plan == "team" and current_user.firm_id:
        firm = db_session.query(models.Firm).filter(models.Firm.id == current_user.firm_id).first()
        access_until = firm.plan_expires_at if firm else None
    return {
        "cancelled": True,
        "access_until": access_until,
    }


@router.post("/webhook")
async def razorpay_webhook(request: Request, db_session: Session = Depends(db.get_db)):
    if not RAZORPAY_WEBHOOK_SECRET:
        raise HTTPException(status_code=503, detail="Webhook not configured.")

    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")
    expected = hmac.new(RAZORPAY_WEBHOOK_SECRET.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(expected, signature):
        raise HTTPException(status_code=400, detail="Invalid webhook signature.")

    payload = await request.json()
    event = payload.get("event", "")
    sub_entity = payload.get("payload", {}).get("subscription", {}).get("entity", {})
    razorpay_subscription_id = sub_entity.get("id")
    if not razorpay_subscription_id:
        return {"ok": True}

    subscription = (
        db_session.query(models.Subscription)
        .filter(models.Subscription.razorpay_subscription_id == razorpay_subscription_id)
        .first()
    )
    if not subscription:
        return {"ok": True}

    if event in ("subscription.activated", "subscription.charged"):
        current_end = datetime.fromtimestamp(sub_entity["current_end"], tz=timezone.utc) if sub_entity.get("current_end") else (
            datetime.now(timezone.utc) + timedelta(days=30)
        )
        _apply_active_subscription(db_session, subscription, current_end)

        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        if payment_entity.get("id"):
            already_logged = (
                db_session.query(models.Payment)
                .filter(models.Payment.razorpay_payment_id == payment_entity["id"])
                .first()
            )
            if not already_logged:
                db_session.add(models.Payment(
                    user_id=subscription.user_id,
                    razorpay_subscription_id=razorpay_subscription_id,
                    razorpay_payment_id=payment_entity["id"],
                    amount=payment_entity.get("amount", INDIVIDUAL_PLAN_PRICE_INR * 100),
                    status="paid",
                ))
                db_session.commit()

    elif event in ("subscription.cancelled", "subscription.completed", "subscription.halted"):
        subscription.status = "cancelled" if event != "subscription.halted" else "halted"
        db_session.add(subscription)
        db_session.commit()

    elif event == "payment.failed":
        subscription.status = "past_due"
        db_session.add(subscription)
        db_session.commit()

    return {"ok": True}
