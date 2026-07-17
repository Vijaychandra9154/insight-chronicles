from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Dict
from datetime import datetime


class CaseCreate(BaseModel):
    title: str
    case_number: Optional[str] = None
    forum: Optional[str] = None
    extra_data: Optional[Dict] = Field(default_factory=dict)


class CaseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    title: str
    case_number: Optional[str] = None
    forum: Optional[str] = None
    extra_data: Optional[Dict] = None
    created_at: Optional[datetime] = None


class DocumentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    filename: str
    uploaded_at: Optional[datetime] = None


class DraftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    case_id: int
    instruction: str
    content: str
    language: str
    created_at: Optional[datetime] = None
