from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import db, models
from ..ai_utils import llm_generate
from .ai_controller import CITATION_RULE

router = APIRouter(prefix="/api", tags=["citation-checker"])

MAX_TEXT_LENGTH = 8000
RATE_LIMIT = 5
RATE_WINDOW = timedelta(hours=1)

CHECKER_INSTRUCTIONS = (
    "You are checking a piece of text for OUTDATED Indian criminal-law citations — "
    "references to the Indian Penal Code (IPC) 1860, Code of Criminal Procedure (CrPC) 1973, "
    "or Indian Evidence Act 1872 that should now be cited under the Bharatiya Nyaya Sanhita "
    "(BNS) 2023, Bharatiya Nagarik Suraksha Sanhita (BNSS) 2023, or Bharatiya Sakshya "
    "Adhiniyam (BSA) 2023 respectively (these three replaced the old codes on 1 July 2024). "
    "The Prevention of Corruption Act 1988 and RTI Act 2005 are still in force and are NOT "
    "outdated — do not flag them.\n\n"
    "Return the ENTIRE original text UNCHANGED, character for character, except: immediately "
    "after each outdated citation you find, insert an inline tag in this exact form: "
    "'[OUTDATED: <the old citation> — <the corresponding BNS/BNSS/BSA section, or the single "
    "word VERIFY if you are not certain of the exact new section number>]'. "
    "Do not summarize, rewrite, reformat, or comment on any other part of the text. Do not "
    "invent a specific new section number you are not confident about — use VERIFY instead. "
    "If the text contains no outdated citations, return it completely unchanged with no tags."
)


class CitationCheckRequest(BaseModel):
    text: str


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _check_rate_limit(db_session: Session, ip: str) -> None:
    cutoff = datetime.now(timezone.utc) - RATE_WINDOW
    count = (
        db_session.query(models.CitationCheckLog)
        .filter(models.CitationCheckLog.ip_address == ip, models.CitationCheckLog.created_at >= cutoff)
        .count()
    )
    if count >= RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit reached ({RATE_LIMIT} checks per hour). Please try again later.",
        )


@router.post("/citation-check")
async def citation_check(
    req: CitationCheckRequest,
    request: Request,
    db_session: Session = Depends(db.get_db),
):
    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Paste some text to check.")
    if len(text) > MAX_TEXT_LENGTH:
        raise HTTPException(status_code=400, detail=f"Text is too long (max {MAX_TEXT_LENGTH} characters).")

    ip = _client_ip(request)
    _check_rate_limit(db_session, ip)

    prompt = (
        f"{CHECKER_INSTRUCTIONS}\n\n"
        f"BACKGROUND RULE: {CITATION_RULE}\n\n"
        f"TEXT TO CHECK:\n{text}"
    )

    try:
        annotated = llm_generate(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    db_session.add(models.CitationCheckLog(ip_address=ip))
    db_session.commit()

    return {"annotated_text": annotated, "flagged_count": annotated.count("[OUTDATED:")}
