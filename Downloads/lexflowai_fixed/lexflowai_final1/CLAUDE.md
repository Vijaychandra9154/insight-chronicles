# LexFlow AI — Project Context

## What this project is
LexFlow AI is a legal document drafting assistant for Indian quasi-judicial and judicial institutions. It helps citizens and paralegals generate correctly formatted complaints, petitions, and applications for:
- Lokayuktha (state anti-corruption ombudsman)
- NHRC (National Human Rights Commission) and State Human Rights Commissions (SHRC)
- State Women's Commissions
- RTI applications (Central and State), including Second Appeal to the CIC/SIC
- Consumer forums (District/State/National)
- District courts (plaints, written statements, applications)
- Police complaints / FIR representations (including cyber crime)
- Labour Commissioner (wage and industrial disputes)
- Motor Accident Claims Tribunal (MACT)

Built by Navottara Technologies Private Limited (DPIIT-registered, Hyderabad).

## Current state (working, runs locally)
- **Backend:** FastAPI in `backend/app/` — SQLite via SQLAlchemy (`lexflowai.db`, gitignored), JWT auth (`/api/signup`, `/api/token`), cases CRUD (`/api/cases`), document upload + listing (`/api/cases/{id}/documents`, `/api/cases/{id}/upload`). AI drafting at `/api/ai/draft` persists every generation to a `Draft` table and returns `draft_id`; drafts are listable (`/api/cases/{id}/drafts`) and downloadable as a formatted `.docx` (`/api/drafts/{id}/download`, via `python-docx` — bold/centered ALL-CAPS headings, justified body, defensive markdown stripping). Translation at `/api/ai/translate` (Sarvam AI, `hi-IN`/`te-IN`, with `[VERIFY: ...]` placeholder protection). Institution-specific drafting templates live in `backend/app/templates/*.json` (one per forum: addressee block, required section order, relevant acts, institution rules) and are injected into the drafting prompt along with a plain-text/no-markdown formatting instruction and the BNS/BNSS/BSA current-law citation rule (see Domain rules). `ai_utils.llm_generate` reads `LLM_BASE_URL`/`LLM_MODEL`/`LLM_API_KEY` so drafting can point at any OpenAI-compatible endpoint (currently configured for Gemini), falling back to `OPENAI_API_KEY`/`OPENAI_MODEL` for plain OpenAI. Local FAISS vector index with lazy-loaded sentence-transformers for uploaded-document context.
- **Escalation Engine:** `Case.filed_date`/`escalation_deadline`/`escalation_deadline_basis` track statutory response deadlines — auto-computed from `response_deadline_days` in an institution template where one genuinely exists (currently only `rti.json`, 30 days under Section 7), otherwise left for the user to set manually. `POST /api/cases/{id}/filed` and `POST /api/cases/{id}/escalation-deadline` manage these; `POST /api/ai/escalate` drafts a follow-up (a real Section 19(1) First Appeal for RTI, a generic non-invented reminder representation for everything else), saved as `Draft(kind="escalation")`.
- **Citation Checker:** `POST /api/citation-check` is a genuinely public (unauthenticated) endpoint — paste text, get back the same text with outdated IPC/CrPC/Indian Evidence Act citations flagged inline and mapped to BNS/BNSS/BSA (or `[VERIFY]` where uncertain), reusing the same `CITATION_RULE` as drafting. Rate-limited to 5 checks/IP/hour (`CitationCheckLog`) since it's public and hits a paid LLM. Public page at `frontend/pages/citation-checker.js`.
- **Billing:** `User.plan`/`plan_expires_at` gate a free tier (1 AI-generated document/month, draft + escalation share one counter) vs. a paid "Individual" tier (unlimited) — see `user_has_unlimited_access()` in `billing.py`, which also grants unlimited access to members of a paid Firm (see Firms/Teams below). `backend/app/routes/billing.py` wraps Razorpay's Subscriptions API (real auto-recurring monthly charge against pre-created Plans, `RAZORPAY_PLAN_ID_INDIVIDUAL`/`RAZORPAY_PLAN_ID_TEAM` — created once via `python -m app.create_razorpay_plan`) — `/api/billing/checkout` (`{"plan": "individual"|"team"}`), `/api/billing/verify` (subscription payment signature checked server-side via HMAC), `/api/billing/cancel` (cancels at cycle end, keeps access until expiry), `/api/billing/status` (includes a `firm` block when applicable), and `/api/billing/webhook` (verifies `X-Razorpay-Signature` against `RAZORPAY_WEBHOOK_SECRET`; handles `subscription.activated`/`charged`/`cancelled`/`completed`/`halted` and `payment.failed` so renewals/cancellations/failed-charges stay in sync even if the user never returns to the app). Gracefully 503s if Razorpay isn't configured. The `Subscription` table tracks `plan_type`, `razorpay_subscription_id`/status/`current_end` per paying user (and `firm_id` for team subscriptions); `Payment` rows log each individual charge. Webhook needs a public HTTPS URL to actually receive events (not yet deployed). Frontend at `pages/billing.js` using Razorpay Checkout.js with `subscription_id`, plus a self-service cancel button.
- **Firms/Teams:** A `Firm` (name, `owner_user_id`, unique `invite_code`, `plan`/`plan_expires_at` mirroring `User`'s paid-plan shape) lets a law firm put its whole team on one ₹999/month flat Team subscription instead of everyone paying individually. Subscribing to the Team plan (via `/api/billing/checkout {"plan":"team"}`) auto-creates a Firm for the payer on first successful charge (`_apply_active_subscription` in `billing.py`) and makes them `firm_role="owner"`; colleagues join with the invite code via `POST /api/firms/join` (requires the firm's Team plan to be currently active) and become `firm_role="member"`. `routes/firms.py` also has `/api/firms/me`, `/api/firms/invite/regenerate` (owner only), `/api/firms/leave`, and `DELETE /api/firms/members/{user_id}` (owner only). A case created with `share_with_firm: true` gets `Case.firm_id` set, making it visible to every firm member via `_accessible_case_filter()` in `routes/cases.py` (in addition to the creator's own `user_id` ownership) — cases created without that flag stay private to their creator even within a firm. Frontend at `pages/firm.js`; the "Firm" nav item and sidebar badge are in `components/Layout.js`.
- **Frontend:** Next.js 13 (pages router) in `frontend/` — sidebar layout (`components/Layout.js`, Dashboard/Cases/New Case/Billing nav plus a plan badge), dashboard and Cases pages showing case cards, a New Case form (`pages/case/new.js`), and a full case workspace (`pages/case/[id].js`) with document upload, a "Case Facts & Instructions" Generate Draft panel, a persisted Drafts list (click to reload a past draft), an English/हिंदी/తెలుగు language toggle with client-side translation caching, `[VERIFY: ...]` highlighting, docx download, and the Response Deadline / escalation section described above. API calls proxied to the backend via the `/api` rewrite in `next.config.js` (`NEXT_PUBLIC_BACKEND_URL`, defaults to localhost:8000).
- Auth is wired end to end: JWT in an httpOnly cookie, `pages/login.js` / `pages/signup.js`, and a frontend `AuthGate` (`pages/_app.js`) that redirects unauthenticated users to `/login`. Case, document, and draft routes are protected on the backend via a per-request ownership check (`_get_owned_case` in `backend/app/routes/cases.py`) that returns 404 (not 403) on any cross-user access attempt.
- No automated test suite yet beyond `.claude/skills/run-lexflowai/smoke-api.sh` (backend API + cross-user isolation + Escalation Engine + Citation Checker + billing checks, 20 passing) and `driver.mjs` (Playwright login/dashboard/case-workspace walkthrough).
- Deploy targets: Render for backend + Postgres, Render for frontend (`render.yaml`). Not yet live — repo just set up for deployment.

## Domain rules — IMPORTANT
- Output languages: English, Hindi, Telugu. Default English; user selects.
- Every generated document must include: correct addressee block for the institution, cause title, numbered paragraphs, prayer/relief section, verification clause, list of annexures, and place/date/signature block.
- RTI applications must mention the Rs. 10 fee and IPO payment option, and be addressed to the correct CPIO/SPIO.
- NEVER invent case citations, act sections, or judgment numbers. If a legal provision is uncertain, insert a clearly marked placeholder like `[VERIFY: Section __ of __ Act]` instead of guessing. This extends to deadlines/SLAs too — only compute an automatic statutory response deadline where a template genuinely documents one (currently just RTI); don't invent one for other institutions.
- For offences and procedures after 1 July 2024, cite the Bharatiya Nyaya Sanhita (BNS), Bharatiya Nagarik Suraksha Sanhita (BNSS), and Bharatiya Sakshya Adhiniyam (BSA) — NOT the repealed IPC 1860, CrPC 1973, or Indian Evidence Act 1872. The Prevention of Corruption Act 1988 and RTI Act 2005 remain in force and may be cited. If unsure of a new-code section number, use `[VERIFY]`.
- Always include a disclaimer that documents are drafts requiring review, not legal advice.

## Design direction (frontend)
Professional legal aesthetic — ink, parchment, and gold accents; serif display font (e.g. Playfair Display) with a clean sans for body. Trustworthy and document-like, not a generic blue SaaS dashboard.

## Coding conventions
- Python: FastAPI + Pydantic v2 models, type hints everywhere, black formatting.
- Keep institution templates as data (JSON/YAML per institution), not hardcoded in prompts, so new institutions can be added without code changes.
- Frontend: keep the Next.js pages router (do not migrate to app router without asking).
- Environment variables via `.env` (never commit — see `.env.example` for the full list). Backend needs `OPENAI_API_KEY` (or `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL` for a non-OpenAI provider) for drafting, `SARVAM_API_KEY` for translation, `ECOURTS_API_KEY` for case tracking, `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` for billing, and `JWT_SECRET` in production.
- New columns on an *existing* table need a one-off `migrate_add_*.py` script (raw `ALTER TABLE`, see `migrate_add_escalation_fields.py`/`migrate_add_billing_fields.py`) since `Base.metadata.create_all()` only creates missing tables, not missing columns. A brand-new table or a brand-new DB needs no migration.

## Commands
- Backend: `cd backend` then `uvicorn app.main:app --reload` (port 8000)
- Frontend: `cd frontend` then `npm run dev` (port 3000)
- Smoke tests: `bash .claude/skills/run-lexflowai/smoke-api.sh` (backend must be running)

## Working style
- Before large refactors or new features, propose a plan first and wait for approval.
- Small git commits with clear messages, one logical change per commit; commit after each completed feature.
- When touching legal templates or prompts, show the before/after diff and flag any change to legal wording explicitly.
- Never commit `venv/`, `__pycache__/`, `*.db`, `.env`, `node_modules/`, `.claude/settings.local.json` (see `.gitignore`).
