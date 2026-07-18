"""
Court case tracking, backed by the eCourtsIndia Partner API v4.0
(https://ecourtsindia.com/api/docs). Everything provider-specific lives
behind the public functions below (fetch_case_detail, refresh_and_fetch,
is_valid_cnr) so a future provider swap only touches this file.
"""
import os
import re
import time
from dataclasses import dataclass, field
from typing import List, Optional

import requests

BASE_URL = "https://webapi.ecourtsindia.com"
CNR_PATTERN = re.compile(r"^[A-Z]{4}\d{12}$")

REFRESH_WAIT_SECONDS = 8
BACKOFF_SCHEDULE = [1, 2, 4]  # seconds, for 429 retries


class CourtTrackerError(Exception):
    def __init__(self, message, code=None, status_code=None):
        super().__init__(message)
        self.code = code
        self.status_code = status_code


class InvalidCnrError(CourtTrackerError):
    pass


class CaseNotFoundError(CourtTrackerError):
    pass


class InsufficientCreditsError(CourtTrackerError):
    pass


@dataclass
class CourtStatus:
    stage: Optional[str] = None
    case_status: Optional[str] = None
    next_hearing_date: Optional[str] = None
    last_hearing_date: Optional[str] = None
    last_order_date: Optional[str] = None
    decision_date: Optional[str] = None
    filing_date: Optional[str] = None
    registration_number: Optional[str] = None
    court_name: Optional[str] = None
    judges: List[str] = field(default_factory=list)
    petitioners: List[str] = field(default_factory=list)
    respondents: List[str] = field(default_factory=list)
    case_title: Optional[str] = None
    disposal_type: Optional[str] = None
    raw: dict = field(default_factory=dict)


def is_valid_cnr(cnr: str) -> bool:
    return bool(cnr) and bool(CNR_PATTERN.match(cnr))


def _headers() -> dict:
    key = os.getenv("ECOURTS_API_KEY")
    if not key:
        raise CourtTrackerError("ECOURTS_API_KEY not set in environment")
    return {"Authorization": f"Bearer {key}"}


def _raise_for_error(resp: requests.Response):
    try:
        body = resp.json()
        err = body.get("error", {})
        code = err.get("code")
        message = err.get("message") or resp.text
    except Exception:
        code = None
        message = resp.text

    if resp.status_code == 402:
        raise InsufficientCreditsError(message, code=code, status_code=402)
    if resp.status_code == 404:
        raise CaseNotFoundError(message, code=code, status_code=404)
    if resp.status_code == 400:
        raise InvalidCnrError(message, code=code, status_code=400)
    raise CourtTrackerError(message, code=code, status_code=resp.status_code)


def _request(method: str, path: str, **kwargs) -> dict:
    url = f"{BASE_URL}{path}"
    last_error = None
    for delay in [0] + BACKOFF_SCHEDULE:
        if delay:
            time.sleep(delay)
        resp = requests.request(method, url, headers=_headers(), timeout=30, **kwargs)
        if resp.status_code == 429:
            last_error = CourtTrackerError(
                "Rate limit exceeded after retries", code="RATE_LIMIT_EXCEEDED", status_code=429
            )
            continue
        if resp.status_code >= 400:
            _raise_for_error(resp)
        return resp.json()
    raise last_error


def _latest_order_date(court: dict) -> Optional[str]:
    dates = []
    for order in (court.get("interimOrders") or []):
        if order.get("orderDate"):
            dates.append(order["orderDate"])
    for order in (court.get("judgmentOrders") or []):
        if order.get("orderDate"):
            dates.append(order["orderDate"])
    return max(dates) if dates else None


def parse_status(payload: dict) -> CourtStatus:
    data = payload.get("data", {})
    court = data.get("courtCaseData", {}) or {}
    enum_lookup = (data.get("descriptions", {}) or {}).get("enumLookup", {}) or {}

    case_status_code = court.get("caseStatus")
    status_map = enum_lookup.get("caseStatus") or {}
    case_status_label = status_map.get(case_status_code, case_status_code) if isinstance(status_map, dict) else case_status_code

    petitioners = court.get("petitioners") or []
    respondents = court.get("respondents") or []
    case_title = f"{petitioners[0]} vs {respondents[0]}" if petitioners and respondents else None

    return CourtStatus(
        stage=court.get("purpose"),
        case_status=case_status_label,
        next_hearing_date=court.get("nextHearingDate"),
        last_hearing_date=court.get("lastHearingDate"),
        last_order_date=_latest_order_date(court),
        decision_date=court.get("decisionDate"),
        filing_date=court.get("filingDate"),
        registration_number=court.get("registrationNumber"),
        court_name=court.get("courtName"),
        judges=court.get("judges") or [],
        petitioners=petitioners,
        respondents=respondents,
        case_title=case_title,
        disposal_type=court.get("disposalType"),
        raw=payload,
    )


def fetch_case_detail(cnr: str) -> CourtStatus:
    if not is_valid_cnr(cnr):
        raise InvalidCnrError(f"Invalid CNR format: {cnr}")
    payload = _request("GET", f"/api/partner/case/{cnr}")
    return parse_status(payload)


def trigger_refresh(cnr: str) -> None:
    if not is_valid_cnr(cnr):
        raise InvalidCnrError(f"Invalid CNR format: {cnr}")
    _request("POST", f"/api/partner/case/{cnr}/refresh")


def refresh_and_fetch(cnr: str) -> CourtStatus:
    """Queue a refresh, wait for it to complete, then fetch the updated detail."""
    trigger_refresh(cnr)
    time.sleep(REFRESH_WAIT_SECONDS)
    return fetch_case_detail(cnr)
