from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from .. import db, models, schemas

router = APIRouter(prefix="/api/cases", tags=["cases"])


@router.post("", response_model=schemas.CaseOut)
def create_case(case: schemas.CaseCreate, db: Session = Depends(db.get_db)):
    c = models.Case(
        title=case.title,
        case_number=case.case_number,
        forum=case.forum,
        extra_data=case.extra_data or {},
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


@router.get("", response_model=list[schemas.CaseOut])
def list_cases(db: Session = Depends(db.get_db)):
    return db.query(models.Case).order_by(models.Case.created_at.desc()).all()


@router.get("/{case_id}", response_model=schemas.CaseOut)
def get_case(case_id: int, db: Session = Depends(db.get_db)):
    c = db.query(models.Case).filter(models.Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    return c


@router.get("/{case_id}/documents", response_model=list[schemas.DocumentOut])
def list_documents(case_id: int, db: Session = Depends(db.get_db)):
    c = db.query(models.Case).filter(models.Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    return (
        db.query(models.Document)
        .filter(models.Document.case_id == case_id)
        .order_by(models.Document.uploaded_at.desc())
        .all()
    )


@router.get("/{case_id}/drafts", response_model=list[schemas.DraftOut])
def list_drafts(case_id: int, db: Session = Depends(db.get_db)):
    c = db.query(models.Case).filter(models.Case.id == case_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Case not found")
    return (
        db.query(models.Draft)
        .filter(models.Draft.case_id == case_id)
        .order_by(models.Draft.created_at.desc())
        .all()
    )


@router.post("/{case_id}/upload")
async def upload_document(case_id: int, file: UploadFile = File(...), db: Session = Depends(db.get_db)):
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
