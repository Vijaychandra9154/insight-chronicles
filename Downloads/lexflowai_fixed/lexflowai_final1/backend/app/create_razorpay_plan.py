"""
One-off setup: create the recurring "Individual" and "Team" plans in Razorpay.

Razorpay's Subscriptions API charges against a Plan object that must exist
before a Subscription can be created against it. Run this once (per
Razorpay account/mode) and paste the printed plan ids into
RAZORPAY_PLAN_ID_INDIVIDUAL / RAZORPAY_PLAN_ID_TEAM in your .env.

Run manually:
    python -m app.create_razorpay_plan
"""
import os

import razorpay

from .routes.billing import INDIVIDUAL_PLAN_PRICE_INR, TEAM_PLAN_PRICE_INR

RAZORPAY_KEY_ID = os.getenv("RAZORPAY_KEY_ID")
RAZORPAY_KEY_SECRET = os.getenv("RAZORPAY_KEY_SECRET")

PLANS_TO_CREATE = [
    ("Individual", INDIVIDUAL_PLAN_PRICE_INR, "RAZORPAY_PLAN_ID_INDIVIDUAL"),
    ("Team", TEAM_PLAN_PRICE_INR, "RAZORPAY_PLAN_ID_TEAM"),
]


def run():
    if not RAZORPAY_KEY_ID or not RAZORPAY_KEY_SECRET:
        raise SystemExit("Set RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET before running this.")

    client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET))
    for label, price_inr, env_var in PLANS_TO_CREATE:
        plan = client.plan.create({
            "period": "monthly",
            "interval": 1,
            "item": {
                "name": f"LexFlow AI — {label}",
                "amount": price_inr * 100,
                "currency": "INR",
            },
        })
        print(f"Created plan {plan['id']} — set {env_var}={plan['id']} in .env")


if __name__ == "__main__":
    run()
