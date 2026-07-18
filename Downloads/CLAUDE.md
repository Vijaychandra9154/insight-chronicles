# LexFlow AI — Project Context

## What this project is
LexFlow AI is a legal document drafting assistant for Indian quasi-judicial and judicial institutions. It helps citizens and paralegals generate correctly formatted complaints, petitions, and applications for:
- Lokayuktha (state anti-corruption ombudsman)
- NHRC (National Human Rights Commission)
- State Women's Commissions
- RTI applications (Central and State)
- Consumer forums (District/State/National)
- District courts (plaints, written statements, applications)

Built by Navottara Technologies Private Limited (DPIIT-registered, Hyderabad).

## Current state (working, runs locally)
- **Backend:** FastAPI in `backend/app/` — SQLite via SQLAlchemy (`lexflowai.db`, gitignored), JWT auth (`/api/signup`, `/api/token`), cases CRUD (`/api/cases`), document upload + listing (`/api/cases/{id}/documents`, `/api/cases/{id}/upload`). AI drafting at `/api/ai/draft` persists every generation to a `Draft` table and returns `draft_id`; drafts are listable (`/api/cases/{id}/drafts`) and downloadable as a formatted `.docx` (`/api/drafts/{id}/download`, via `python-docx` — bold/centered ALL-CAPS headings, justified body, defensive markdown stripping). Translation at `/api/ai/translate` (Sarvam AI, `hi-IN`/`te-IN`, with `[VERIFY: ...]` placeholder protection). Institution-specific drafting templates live in `backend/app/templates/*.json` (one per forum: addressee block, required section order, relevant acts, institution rules) and are injected into the drafting prompt along with a plain-text/no-markdown formatting instruction and the BNS/BNSS/BSA current-law citation rule (see Domain rules). `ai_utils.llm_generate` reads `LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY` so drafting can point at any OpenAI-compatible endpoint (currently configured for Gemini), falling back to `OPENAI_API_KEY`/`OPENAI_MODEL` for plain OpenAI. Local FAISS vector index with lazy-loaded sentence-transformers for uploaded-document context.
- **Frontend:** Next.js 13 (pages router) in `frontend/` — sidebar layout (`components/Layout.js`, Dashboard/Cases/New Case nav), dashboard and Cases pages showing case cards, a New Case form (`pages/case/new.js`), and a full case workspace (`pages/case/[id].js`) with document upload, a "Case Facts & Instructions" Generate Draft panel, a persisted Drafts list (click to reload a past draft), an English/हिंदी/తెలుగు language toggle with client-side translation caching, `[VERIFY: ...]` highlighting, and docx download. API calls proxied to the backend via the `/api` rewrite in `next.config.js` (`NEXT_PUBLIC_BACKEND_URL`, defaults to localhost:8000).
- Auth endpoints exist but no pages use them yet, and case/draft routes are NOT protected yet.
- Deploy targets (not yet deployed): Render for backend, Netlify or Render for frontend (`render.yaml` exists).

## Domain rules — IMPORTANT
- Output languages: English, Hindi, Telugu. Default English; user selects.
- Every generated document must include: correct addressee block for the institution, cause title, numbered paragraphs, prayer/relief section, verification clause, list of annexures, and place/date/signature block.
- RTI applications must mention the Rs. 10 fee and IPO payment option, and be addressed to the correct CPIO/SPIO.
- NEVER invent case citations, act sections, or judgment numbers. If a legal provision is uncertain, insert a clearly marked placeholder like `[VERIFY: Section __ of __ Act]` instead of guessing.
- For offences and procedures after 1 July 2024, cite the Bharatiya Nyaya Sanhita (BNS), Bharatiya Nagarik Suraksha Sanhita (BNSS), and Bharatiya Sakshya Adhiniyam (BSA) — NOT the repealed IPC 1860, CrPC 1973, or Indian Evidence Act 1872. The Prevention of Corruption Act 1988 and RTI Act 2005 remain in force and may be cited. If unsure of a new-code section number, use `[VERIFY]`.
- Always include a disclaimer that documents are drafts requiring review, not legal advice.

## Design direction (frontend)
Professional legal aesthetic — ink, parchment, and gold accents; serif display font (e.g. Playfair Display) with a clean sans for body. Trustworthy and document-like, not a generic blue SaaS dashboard.

## Coding conventions
- Python: FastAPI + Pydantic v2 models, type hints everywhere, black formatting.
- Keep institution templates as data (JSON/YAML per institution), not hardcoded in prompts, so new institutions can be added without code changes.
- Frontend: keep the Next.js pages router (do not migrate to app router without asking).
- Environment variables via `.env` (never commit). Backend needs `OPENAI_API_KEY` (or `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL` for a non-OpenAI provider) for drafting, `SARVAM_API_KEY` for translation, and `JWT_SECRET` in production.

## Commands
- Backend: `cd backend` then `uvicorn app.main:app --reload` (port 8000)
- Frontend: `cd frontend` then `npm run dev` (port 3000)
- Tests: `pytest` (backend)

## Working style
- Before large refactors or new features, propose a plan first and wait for approval.
- Small git commits with clear messages, one logical change per commit; commit after each completed feature.
- When touching legal templates or prompts, show the before/after diff and flag any change to legal wording explicitly.
- Never commit `venv/`, `__pycache__/`, `*.db`, `.env`, `node_modules/` (see .gitignore).
