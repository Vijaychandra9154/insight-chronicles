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
