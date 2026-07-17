from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import db, models
from ..ai_utils import VECTOR_INDEX, llm_generate
from ..services import translation

router = APIRouter(prefix="/api/ai", tags=["ai"])


class DraftRequest(BaseModel):
    case_id: int
    prompt_context: str
    instruction: str


class TranslateRequest(BaseModel):
    text: str
    target_lang: str


@router.post("/draft")
async def generate_draft(req: DraftRequest, db_session: Session = Depends(db.get_db)):
    passages = VECTOR_INDEX.query(req.prompt_context, k=5)
    context = "\n\n".join(passages)
    prompt = (
        f"Context: {context}\n\n"
        f"Instruction: {req.instruction}\n\n"
        "Produce a lawyer-ready draft reply in Indian legal tone. "
        "Mark citations if referenced and flag anything that needs human verification."
    )
    try:
        draft = llm_generate(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    draft_row = models.Draft(
        case_id=req.case_id,
        instruction=req.instruction,
        content=draft,
        language="en",
    )
    db_session.add(draft_row)
    db_session.commit()
    db_session.refresh(draft_row)

    return {"draft": draft, "sources": passages, "draft_id": draft_row.id}


@router.post("/translate")
async def translate_text(req: TranslateRequest):
    if req.target_lang not in translation.SUPPORTED_LANGS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported target_lang '{req.target_lang}'. Supported: {sorted(translation.SUPPORTED_LANGS)}",
        )
    try:
        translated_text = translation.translate(req.text, req.target_lang)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    return {"translated_text": translated_text}
