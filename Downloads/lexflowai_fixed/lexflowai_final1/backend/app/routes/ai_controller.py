from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import db, models
from ..ai_utils import VECTOR_INDEX, llm_generate
from ..services import translation, institution_templates

router = APIRouter(prefix="/api/ai", tags=["ai"])

DISCLAIMER = (
    "This is an AI-generated draft for reference only. It does not constitute legal advice. "
    "Please have it reviewed by a qualified advocate before submission."
)


class DraftRequest(BaseModel):
    case_id: int
    prompt_context: str
    instruction: str


class TranslateRequest(BaseModel):
    text: str
    target_lang: str


@router.post("/draft")
async def generate_draft(req: DraftRequest, db_session: Session = Depends(db.get_db)):
    case = db_session.query(models.Case).filter(models.Case.id == req.case_id).first()
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    passages = VECTOR_INDEX.query(req.prompt_context, k=5)
    context = "\n\n".join(passages)

    template = institution_templates.load_template(case.forum)
    template_block = ""
    if template:
        acts = ", ".join(template.get("relevant_acts", []))
        sections = ", ".join(template.get("required_sections", []))
        template_block = (
            f"\nINSTITUTION TEMPLATE — you MUST follow this structure:\n"
            f"Institution: {template.get('institution', case.forum)}\n"
            f"Addressee block (use exactly, filling placeholders from context if known):\n{template.get('addressee_block', '')}\n"
            f"Required sections, in this order: {sections}\n"
            f"Relevant acts to ground citations in (do not invent others): {acts}\n"
            f"Institution-specific rules: {template.get('institution_rules', '')}\n"
        )

    prompt = (
        f"Context: {context}\n\n"
        f"Instruction: {req.instruction}\n"
        f"{template_block}\n"
        "Produce a lawyer-ready draft reply in Indian legal tone. "
        "Mark citations if referenced and flag anything that needs human verification. "
        f'End the document with this exact disclaimer on its own line: "{DISCLAIMER}"'
    )
    try:
        draft = llm_generate(prompt)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if DISCLAIMER not in draft:
        draft = f"{draft.rstrip()}\n\n{DISCLAIMER}"

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
