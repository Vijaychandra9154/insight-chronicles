import os
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel
from sqlalchemy.orm import Session
from .. import db, models
from ..auth import (
    get_password_hash,
    verify_password,
    create_access_token,
    get_current_user,
    COOKIE_NAME,
    ACCESS_TOKEN_EXPIRE_MINUTES,
)

router = APIRouter(prefix="/api", tags=["auth"])

COOKIE_SECURE = os.getenv("COOKIE_SECURE", "false").lower() == "true"


class UserCreate(BaseModel):
    email: str
    password: str
    full_name: str | None = None


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserOut(BaseModel):
    id: int
    email: str
    full_name: str | None = None
    plan: str = "free"
    plan_expires_at: datetime | None = None


def _set_auth_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=COOKIE_SECURE,
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )


@router.post("/signup", response_model=TokenOut)
def signup(u: UserCreate, response: Response, db: Session = Depends(db.get_db)):
    exists = db.query(models.User).filter(models.User.email == u.email).first()
    if exists:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = models.User(
        email=u.email,
        hashed_password=get_password_hash(u.password),
        full_name=u.full_name,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": str(user.id)})
    _set_auth_cookie(response, token)
    return {"access_token": token, "token_type": "bearer"}


@router.post("/token", response_model=TokenOut)
def login(u: UserCreate, response: Response, db: Session = Depends(db.get_db)):
    user = db.query(models.User).filter(models.User.email == u.email).first()
    if not user or not verify_password(u.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Invalid credentials")
    token = create_access_token({"sub": str(user.id)})
    _set_auth_cookie(response, token)
    return {"access_token": token, "token_type": "bearer"}


@router.get("/me", response_model=UserOut)
def me(current_user: models.User = Depends(get_current_user)):
    return current_user


@router.post("/logout")
def logout(response: Response):
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return {"ok": True}
