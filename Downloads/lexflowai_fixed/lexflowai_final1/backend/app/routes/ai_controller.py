from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import db, models
from ..auth import get_current_user
from ..ai_utils import VECTOR_INDEX, llm_generate
from ..services import translation, institution_templates
from .billing import documents_used_this_month, FREE_MONTHLY_DOCUMENT_LIMIT

router = APIRouter(prefix="/api/ai", tags=["ai"])

DISCLAIMER = (
    "This is an AI-generated draft for reference only. It does not constitute legal advice. "
    "Please have it reviewed by a qualified advocate before submission."
)

FORMATTING_RULES = (
    "FORMATTING — output PLAIN TEXT ONLY. This is absolute, never violate it:\n"
    "- Never use '#', '##', '###', or any other heading marker.\n"
    "- Never use '**bold**', '__bold__', or '*italic*' markers.\n"
    "- Never use '---', '***', '___', or any divider/rule line.\n"
    "- Never use Markdown tables or the '|' character.\n"
    "- Write each section heading in ALL CAPS on its own line, using exactly the heading names "
    "given below (e.g. FACTS, GROUNDS, PRAYER) — nothing else marks a heading.\n"
    "- Write the annexure list as plain numbered lines (e.g. '1. Copy of FIR'), never a table."
)

CITATION_RULE = (
    "Determine the applicable criminal code from the date of the offence in the facts. "
    "Offence on or after 1 July 2024: cite BNS 2023 sections (with [VERIFY] if unsure of the "
    "number) and do NOT cite IPC 1860 at all. Only cite IPC for offences before that date. "
    "Apply the same date rule for procedure — Bharatiya Nagarik Suraksha Sanhita (BNSS) instead "
    "of CrPC 1973 — and for evidence — Bharatiya Sakshya Adhiniyam (BSA) instead of the Indian "
    "Evidence Act 1872. The Prevention of Corruption Act 1988 and RTI Act 2005 remain in force "
    "and may be cited regardless of date."
)

FACTS_RULE = (
    "The text under 'Case Facts' below is the ACTUAL, REAL facts of this case as given by the "
    "user. You MUST base the numbered FACTS section directly on these facts — do not invent a "
    "different or fictional scenario. Only use placeholders like [Date] or [Amount] where a "
    "specific detail is genuinely missing from what the user provided."
)

SECTION_HEADINGS = {
    "cause_title": "CAUSE TITLE",
    "numbered_facts": "FACTS",
    "legal_grounds": "GROUNDS",
    "prayer": "PRAYER",
    "verification_clause": "VERIFICATION",
    "annexure_list": "ANNEXURES",
    "place_date_signature": "PLACE / DATE / SIGNATURE",
}


class DraftRequest(BaseModel):
    case_id: int
    prompt_context: str
    instruction: str


class TranslateRequest(BaseModel):
    text: str
    target_lang: str


class EscalateRequest(BaseModel):
    case_id: int
    instruction: Optional[str] = None


def _enforce_document_quota(db_session: Session, current_user: models.User) -> None:
    if current_user.is_paid_active:
        return
    used = documents_used_this_month(db_session, current_user.id)
    if used >= FREE_MONTHLY_DOCUMENT_LIMIT:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Free plan limit reached ({FREE_MONTHLY_DOCUMENT_LIMIT} AI document"
                f"{'s' if FREE_MONTHLY_DOCUMENT_LIMIT != 1 else ''} per month). "
                "Upgrade at /billing to continue."
            ),
        )


@router.post("/draft")
async def generate_draft(
    req: DraftRequest,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    case = (
        db_session.query(models.Case)
        .filter(models.Case.id == req.case_id, models.Case.user_id == current_user.id)
        .first()
    )
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    _enforce_document_quota(db_session, current_user)

    passages = VECTOR_INDEX.query(req.prompt_context, k=5)
    context = "\n\n".join(passages)

    template = institution_templates.load_template(case.forum)
    template_block = ""
    if template:
        acts = ", ".join(template.get("relevant_acts", []))
        sections = [SECTION_HEADINGS.get(s, s.upper()) for s in template.get("required_sections", [])]
        template_block = (
            f"\nINSTITUTION TEMPLATE — you MUST follow this structure:\n"
            f"Institution: {template.get('institution', case.forum)}\n"
            f"Addressee block (use exactly, filling placeholders from context if known):\n{template.get('addressee_block', '')}\n"
            f"Required sections, in this order, using exactly these ALL CAPS heading names: {', '.join(sections)}\n"
            f"Relevant acts to ground citations in (do not invent others, and apply the citation rule below): {acts}\n"
            f"Institution-specific rules: {template.get('institution_rules', '')}\n"
        )

    case_block = (
        f"Case title: {case.title}\n"
        f"Case number: {case.case_number or '[VERIFY: case number]'}\n"
    )

    prompt = (
        f"Additional context from uploaded case documents (if relevant): {context}\n\n"
        f"{case_block}\n"
        f"Case Facts: {req.instruction}\n"
        f"{template_block}\n"
        f"{FORMATTING_RULES}\n\n"
        f"CITATION RULE: {CITATION_RULE}\n\n"
        f"FACTS RULE: {FACTS_RULE}\n\n"
        "Produce a lawyer-ready draft in Indian legal tone using the case title and case number "
        "above in the cause title. Flag anything that needs human verification with [VERIFY]. "
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


@router.post("/escalate")
async def generate_escalation(
    req: EscalateRequest,
    db_session: Session = Depends(db.get_db),
    current_user: models.User = Depends(get_current_user),
):
    case = (
        db_session.query(models.Case)
        .filter(models.Case.id == req.case_id, models.Case.user_id == current_user.id)
        .first()
    )
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")

    _enforce_document_quota(db_session, current_user)

    template = institution_templates.load_template(case.forum) or {}
    escalation = template.get("escalation") or {}
    framing = escalation.get("framing", "reminder_representation")

    if case.filed_date:
        filed_note = f"This complaint/application was originally filed on {case.filed_date.isoformat()}."
    else:
        filed_note = "The original filing date is not recorded — use [VERIFY: original filing date]."

    if framing == "first_appeal":
        escalation_block = (
            "This is a FIRST APPEAL, not a fresh application.\n"
            f"Addressee: {escalation.get('addressee_block', '')}\n"
            f"Legal basis: {escalation.get('legal_basis', '')}\n"
            f"{escalation.get('instructions', '')}"
        )
    else:
        escalation_block = (
            "This is a FOLLOW-UP / REMINDER representation addressed to the SAME original addressee as the "
            "original complaint, reiterating the original request and noting that no response has been "
            "received within a reasonable time. Do NOT invent a formal statutory appeal mechanism for this "
            "institution — frame it as a reminder requesting expedited action, not a legal appeal."
        )

    case_block = (
        f"Case title: {case.title}\n"
        f"Case number: {case.case_number or '[VERIFY: case number]'}\n"
        f"{filed_note}"
    )

    extra_instruction = req.instruction or "No response has been received to date."

    prompt = (
        f"{case_block}\n\n"
        f"ESCALATION CONTEXT: {escalation_block}\n\n"
        f"Additional notes from the user: {extra_instruction}\n\n"
        f"{FORMATTING_RULES}\n\n"
        f"CITATION RULE: {CITATION_RULE}\n\n"
        "Produce a lawyer-ready follow-up/escalation document in Indian legal tone, referencing the original "
        "filing above. Flag anything needing human verification with [VERIFY]. "
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
        instruction=extra_instruction,
        content=draft,
        language="en",
        kind="escalation",
    )
    db_session.add(draft_row)
    db_session.commit()
    db_session.refresh(draft_row)

    return {"draft": draft, "draft_id": draft_row.id}


@router.post("/translate")
async def translate_text(
    req: TranslateRequest,
    current_user: models.User = Depends(get_current_user),
):
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
