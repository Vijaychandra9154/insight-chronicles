import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .db import engine
from .models import Base
from .routes import cases, ai_controller, auth_routes, drafts, citation_checker, billing

Base.metadata.create_all(bind=engine)
app = FastAPI(title="LexFlowAI Backend")

allowed_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(cases.router)
app.include_router(ai_controller.router)
app.include_router(auth_routes.router)
app.include_router(drafts.router)
app.include_router(citation_checker.router)
app.include_router(billing.router)


@app.get("/api/health")
def health():
    return {"status": "LexFlowAI backend up"}
