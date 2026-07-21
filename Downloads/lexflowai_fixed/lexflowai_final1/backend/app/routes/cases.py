from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy import or_
from sqlalchemy.orm import Session
from .. import db, models, schemas
from ..auth import get_current_user
from ..services import court_tracker, institution_templates

router = APIRouter(prefix="/api/cases", tags=["cases"])

SNAPSHOT_FRESHNESS = timedelta(hours=6)


def _status_to_out(status: court_tracker.CourtStatus, fetched_at, refreshed: bool) -> schemas.CourtStatusOut:
    return schemas.CourtStatusOut(
        fetched=True,
        stage=status.stage,
        case_status=status.case_status,
        next_hearing_date=status.next_hearing_date,
        last_hearing_date=status.last_hearing_date,
        last_order_date=status.last_order_date,
        decision_date=status.decision_date,
        filing_date=status.filing_date,
        registration_number=status.registration_number,
        court_name=status.court_name,
        judges=status.judges,
        petitioners=status.petitioners,
        respondents=status.respondents,
        case_title=status.case_title,
        disposal_type=status.disposal_type,
        fetched_at=fetched_at,
        refreshed=refreshed,
    )


def _store_snapshot(db: Session, case_id: int, status: court_tracker.CourtStatus) -> models.CaseStatusUpdate:
    snapshot = models.CaseStatusUpdate(
        case_id=case_id,
        stage=status.stage,
        next_hearing=status.next_hearing_date,
        raw_json=status.raw,
    )
    db.add(snapshot)
    db.commit()
    db.refresh(snapshot)
    return snapshot


def _accessible_case_filter(user: models.User):
    if user.firm_id:
        return or_(models.Case.user_id == user.id, models.Case.firm_id == user.firm_id)
    return models.Case.user_id == user.id


def _get_owned_case(db: Session, case_id: int, user: models.User) -> models.Case:
    c = (
        db.query(models.Case)
        .filter(models.Case.id == case_id, _accessible_case_filter(user))
        .first()
    )
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    return c


def _handle_tracker_error(e: court_tracker.CourtTrackerError):
    if isinstance(e, court_tracker.InsufficientCreditsError):
        raise HTTPException(status_code=402, detail="Tracking credits exhausted.")
    if isinstance(e, court_tracker.CaseNotFoundError):
        raise HTTPException(status_code=404, detail="CNR not found in court records.")
    if isinstance(e, court_tracker.InvalidCnrError):
        raise HTTPException(status_code=400, detail=str(e))
    raise HTTPException(status_code=502, detail=str(e))


@router.post("", response_model=schemas.CaseOut)
def create_case(
    case: schemas.CaseCreate,
    db: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    c = models.Case(
        title=case.title,
        case_number=case.case_number,
        forum=case.forum,
        extra_data=case.extra_data or {},
        user_id=current_user.id,
        firm_id=current_user.firm_id if (case.share_with_firm and current_user.firm_id) else None,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.get("", response_model=list[schemas.CaseOut])
def list_cases(
    db: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Case)
        .filter(_accessible_case_filter(current_user))
        .order_by(models.Case.created_at.desc())
        .all()
    )


@router.get("/{case_id}", response_model=schemas.CaseOut)
def get_case(
    case_id: int,
    db: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    return _get_owned_case(db, case_id, current_user)


@router.get("/{case_id}/documents", response_model=list[schemas.DocumentOut])
def list_documents(
    case_id: int,
    db: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_owned_case(db, case_id, current_user)
    return (
        db.query(models.Document)
        .filter(models.Document.case_id == case_id)
        .order_by(models.Document.uploaded_at.desc())
        .all()
    )


@router.get("/{case_id}/drafts", response_model=list[schemas.DraftOut])
def list_drafts(
    case_id: int,
    db: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_owned_case(db, case_id, current_user)
    return (
        db.query(models.Draft)
        .filter(models.Draft.case_id == case_id)
        .order_by(models.Draft.created_at.desc())
        .all()
    )


@router.post("/{case_id}/filed", response_model=schemas.CaseOut)
def mark_filed(
    case_id: int,
    req: schemas.FiledRequest,
    db: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    c = _get_owned_case(db, case_id, current_user)
    c.filed_date = req.filed_date

    template = institution_templates.load_template(c.forum) or {}
    deadline_days = template.get("response_deadline_days")
    if deadline_days:
        c.escalation_deadline = req.filed_date + timedelta(days=deadline_days)
        basis = (template.get("escalation") or {}).get("legal_basis")
        c.escalation_deadline_basis = (
            f"{basis} — {deadline_days} days" if basis else f"{deadline_days}-day statutory response window"
        )
    else:
        c.escalation_deadline = None
        c.escalation_deadline_basis = None

    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.post("/{case_id}/escalation-deadline", response_model=schemas.CaseOut)
def set_escalation_deadline(
    case_id: int,
    req: schemas.EscalationDeadlineRequest,
    db: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    c = _get_owned_case(db, case_id, current_user)
    c.escalation_deadline = req.escalation_deadline
    c.escalation_deadline_basis = "Manually set reminder"
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.post("/{case_id}/link-cnr", response_model=schemas.CourtStatusOut)
def link_cnr(
    case_id: int,
    req: schemas.LinkCnrRequest,
    db: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    c = _get_owned_case(db, case_id, current_user)

    cnr = req.cnr_number.strip().upper()
    if not court_tracker.is_valid_cnr(cnr):
        raise HTTPException(
            status_code=400,
            detail="Invalid CNR format. Expected 16 characters: 4 letters followed by 12 digits.",
        )

    try:
        status = court_tracker.fetch_case_detail(cnr)
    except court_tracker.CourtTrackerError as e:
        _handle_tracker_error(e)

    c.cnr_number = cnr
    db.add(c)
    db.commit()

    snapshot = _store_snapshot(db, case_id, status)
    return _status_to_out(status, snapshot.fetched_at, refreshed=True)


@router.get("/{case_id}/court-status", response_model=schemas.CourtStatusOut)
def get_court_status(
    case_id: int,
    refresh: bool = False,
    db: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    c = _get_owned_case(db, case_id, current_user)
    if not c.cnr_number:
        raise HTTPException(status_code=400, detail="No CNR linked to this case yet.")

    latest = (
        db.query(models.CaseStatusUpdate)
        .filter(models.CaseStatusUpdate.case_id == case_id)
        .order_by(models.CaseStatusUpdate.fetched_at.desc())
        .first()
    )

    is_stale = latest is None or (
        datetime.now(timezone.utc) - latest.fetched_at.replace(tzinfo=timezone.utc) > SNAPSHOT_FRESHNESS
    )

    # Page load (refresh=False) never calls the live API — pure cache read.
    # A manual Refresh click only triggers a live call if the cache is
    # actually stale (>=6h), so repeated clicks don't burn credits.
    if refresh and is_stale:
        try:
            status = court_tracker.refresh_and_fetch(c.cnr_number)
        except court_tracker.CourtTrackerError as e:
            _handle_tracker_error(e)
        snapshot = _store_snapshot(db, case_id, status)
        return _status_to_out(status, snapshot.fetched_at, refreshed=True)

    if latest is None:
        # No snapshot exists yet (shouldn't normally happen since link-cnr
        # always creates one) — nothing to show without spending a credit.
        return schemas.CourtStatusOut(fetched=False)

    status = court_tracker.parse_status(latest.raw_json or {})
    return _status_to_out(status, latest.fetched_at, refreshed=False)


@router.post("/{case_id}/status", response_model=schemas.CaseOut)
def set_manual_status(
    case_id: int,
    req: schemas.ManualStatusRequest,
    db: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    c = _get_owned_case(db, case_id, current_user)
    c.manual_status = req.manual_status
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.post("/{case_id}/upload")
async def upload_document(
    case_id: int,
    file: UploadFile = File(...),
    db: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_owned_case(db, case_id, current_user)
    content = await file.read()
    try:
        text = content.decode(errors="ignore")[:100000]
    except Exception:
        text = ""
    doc = models.Document(case_id=case_id, filename=file.filename, content=text)
    db.add(doc)
    db.commit()
    db.refresh(doc)
    from ..ai_utils import VECTOR_INDEX
    VECTOR_INDEX.add([text[:10000] if text else file.filename])
    return {"ok": True, "doc_id": doc.id}
