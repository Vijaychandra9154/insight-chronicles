from pydantic import BaseModel, ConfigDict, Field
from typing import Optional, Dict, List
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
    cnr_number: Optional[str] = None
    manual_status: Optional[str] = None


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


class LinkCnrRequest(BaseModel):
    cnr_number: str


class ManualStatusRequest(BaseModel):
    manual_status: str


class CourtStatusOut(BaseModel):
    fetched: bool = True
    stage: Optional[str] = None
    case_status: Optional[str] = None
    next_hearing_date: Optional[str] = None
    last_hearing_date: Optional[str] = None
    last_order_date: Optional[str] = None
    decision_date: Optional[str] = None
    filing_date: Optional[str] = None
    registration_number: Optional[str] = None
    court_name: Optional[str] = None
    judges: List[str] = Field(default_factory=list)
    petitioners: List[str] = Field(default_factory=list)
    respondents: List[str] = Field(default_factory=list)
    case_title: Optional[str] = None
    disposal_type: Optional[str] = None
    fetched_at: Optional[datetime] = None
    refreshed: bool = False
