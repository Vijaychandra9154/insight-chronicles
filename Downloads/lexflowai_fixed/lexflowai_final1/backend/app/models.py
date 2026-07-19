from datetime import date as date_
from sqlalchemy import Column, Integer, String, Text, DateTime, Date, ForeignKey, JSON
from sqlalchemy.sql import func
from .db import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    full_name = Column(String, nullable=True)
    role = Column(String, default="lawyer")


class Case(Base):
    __tablename__ = "cases"
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String)
    case_number = Column(String, index=True, nullable=True)
    forum = Column(String)  # e.g., lokayukta, highcourt, district
    extra_data = Column(JSON, default=dict)  # "metadata" is reserved by SQLAlchemy
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    cnr_number = Column(String, index=True, nullable=True)
    manual_status = Column(String, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    filed_date = Column(Date, nullable=True)
    escalation_deadline = Column(Date, nullable=True)
    escalation_deadline_basis = Column(String, nullable=True)

    @property
    def is_overdue(self) -> bool:
        if not self.escalation_deadline:
            return False
        return date_.today() > self.escalation_deadline

    @property
    def days_remaining(self):
        if not self.escalation_deadline:
            return None
        return (self.escalation_deadline - date_.today()).days


class Document(Base):
    __tablename__ = "documents"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"))
    filename = Column(String)
    content = Column(Text)  # extracted text
    uploaded_at = Column(DateTime(timezone=True), server_default=func.now())


class Draft(Base):
    __tablename__ = "drafts"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"))
    instruction = Column(Text)
    content = Column(Text)
    language = Column(String, default="en")
    kind = Column(String, default="draft")  # "draft" | "escalation"
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class CaseStatusUpdate(Base):
    __tablename__ = "case_status_updates"
    id = Column(Integer, primary_key=True, index=True)
    case_id = Column(Integer, ForeignKey("cases.id"))
    fetched_at = Column(DateTime(timezone=True), server_default=func.now())
    stage = Column(String, nullable=True)
    next_hearing = Column(String, nullable=True)
    raw_json = Column(JSON, nullable=True)
