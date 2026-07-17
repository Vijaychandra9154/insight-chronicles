import io
import re

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from docx import Document as DocxDocument
from docx.enum.text import WD_ALIGN_PARAGRAPH

from .. import db, models

router = APIRouter(prefix="/api/drafts", tags=["drafts"])

FORUM_LABELS = {
    "lokayuktha": "Lokayuktha",
    "lokayukta": "Lokayuktha",
    "nhrc": "NHRC",
    "womens_commission": "State Women's Commission",
    "rti": "RTI Application",
    "consumer_forum": "Consumer Forum",
    "district_court": "District Court",
}


def _forum_label(value):
    if not value:
        return "Unspecified Forum"
    return FORUM_LABELS.get(value, value.replace("_", " ").title())


@router.get("/{draft_id}/download")
def download_draft(draft_id: int, db_session: Session = Depends(db.get_db)):
    draft = db_session.query(models.Draft).filter(models.Draft.id == draft_id).first()
    if not draft:
        raise HTTPException(status_code=404, detail="Draft not found")
    case = db_session.query(models.Case).filter(models.Case.id == draft.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    doc = DocxDocument()

    title_p = doc.add_paragraph()
    title_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    title_run = title_p.add_run(f"BEFORE THE {_forum_label(case.forum).upper()}")
    title_run.bold = True

    subject_p = doc.add_paragraph()
    subject_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    subject_p.add_run(f"IN THE MATTER OF: {case.title}")

    if case.case_number:
        case_no_p = doc.add_paragraph()
        case_no_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        case_no_p.add_run(f"Case No: {case.case_number}")

    doc.add_paragraph()

    paragraphs = [p.strip() for p in re.split(r"\n\s*\n", draft.content) if p.strip()]
    for i, para_text in enumerate(paragraphs, start=1):
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
        p.add_run(f"{i}. {para_text}")

    doc.add_paragraph()

    for line in [
        "Place: ______________________",
        "Date: ______________________",
        "",
        "Signature: ______________________",
    ]:
        p = doc.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.LEFT
        p.add_run(line)

    buffer = io.BytesIO()
    doc.save(buffer)
    buffer.seek(0)

    safe_title = re.sub(r"[^A-Za-z0-9_-]+", "_", case.title)[:60] or "draft"
    filename = f"{safe_title}_draft.docx"

    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
