import secrets

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import db, models, schemas
from ..auth import get_current_user

router = APIRouter(prefix="/api/firms", tags=["firms"])


def _new_invite_code() -> str:
    return secrets.token_urlsafe(6)


def _firm_out(db_session: Session, firm: models.Firm, current_user: models.User) -> schemas.FirmOut:
    members = db_session.query(models.User).filter(models.User.firm_id == firm.id).all()
    is_owner = firm.owner_user_id == current_user.id
    return schemas.FirmOut(
        id=firm.id,
        name=firm.name,
        plan=firm.plan,
        plan_expires_at=firm.plan_expires_at,
        is_paid_active=firm.is_paid_active,
        my_role=current_user.firm_role or "member",
        invite_code=firm.invite_code if is_owner else None,
        members=[
            schemas.FirmMemberOut(id=m.id, email=m.email, full_name=m.full_name, firm_role=m.firm_role)
            for m in members
        ],
    )


@router.get("/me", response_model=schemas.FirmOut)
def get_my_firm(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.firm_id:
        raise HTTPException(status_code=404, detail="You are not part of a firm yet.")
    firm = db_session.query(models.Firm).filter(models.Firm.id == current_user.firm_id).first()
    if not firm:
        raise HTTPException(status_code=404, detail="Firm not found.")
    return _firm_out(db_session, firm, current_user)


@router.post("/invite/regenerate", response_model=schemas.FirmOut)
def regenerate_invite_code(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.firm_id or current_user.firm_role != "owner":
        raise HTTPException(status_code=403, detail="Only the firm owner can regenerate the invite code.")
    firm = db_session.query(models.Firm).filter(models.Firm.id == current_user.firm_id).first()
    firm.invite_code = _new_invite_code()
    db_session.add(firm)
    db_session.commit()
    db_session.refresh(firm)
    return _firm_out(db_session, firm, current_user)


@router.post("/join", response_model=schemas.FirmOut)
def join_firm(
    req: schemas.JoinFirmRequest,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user.firm_id:
        raise HTTPException(status_code=400, detail="Leave your current firm before joining another.")

    firm = db_session.query(models.Firm).filter(models.Firm.invite_code == req.invite_code.strip()).first()
    if not firm:
        raise HTTPException(status_code=404, detail="Invalid invite code.")
    if not firm.is_paid_active:
        raise HTTPException(status_code=402, detail="This firm's Team plan is not active. Ask the owner to renew it.")

    current_user.firm_id = firm.id
    current_user.firm_role = "member"
    db_session.add(current_user)
    db_session.commit()
    db_session.refresh(current_user)
    return _firm_out(db_session, firm, current_user)


@router.post("/leave")
def leave_firm(
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.firm_id:
        raise HTTPException(status_code=400, detail="You are not part of a firm.")
    if current_user.firm_role == "owner":
        raise HTTPException(
            status_code=400,
            detail="The firm owner can't leave. Cancel the Team plan to dissolve the firm instead.",
        )
    current_user.firm_id = None
    current_user.firm_role = None
    db_session.add(current_user)
    db_session.commit()
    return {"ok": True}


@router.delete("/members/{user_id}")
def remove_member(
    user_id: int,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    if not current_user.firm_id or current_user.firm_role != "owner":
        raise HTTPException(status_code=403, detail="Only the firm owner can remove members.")
    if user_id == current_user.id:
        raise HTTPException(status_code=400, detail="Owner can't remove themself.")

    member = (
        db_session.query(models.User)
        .filter(models.User.id == user_id, models.User.firm_id == current_user.firm_id)
        .first()
    )
    if not member:
        raise HTTPException(status_code=404, detail="Member not found in your firm.")

    member.firm_id = None
    member.firm_role = None
    db_session.add(member)
    db_session.commit()
    return {"ok": True}
