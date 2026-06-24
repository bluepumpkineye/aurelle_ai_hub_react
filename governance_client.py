"""GovernedClient — the single seam between Aurelle and Atelier's governance core.

Mode A (in-process): every clienteling data request flows through here, where
Atelier applies Identity -> RBAC -> Residency -> PII -> Cost -> Audit before any
row reaches the UI or the LLM. Swapping to Mode B later (Atelier as a standalone
HTTP service) changes only the method bodies in this file — nothing else in Aurelle.

See the Atelier repo: docs/INTEGRATION_SPEC.md.
"""
from __future__ import annotations

import os
from pathlib import Path

# Point Atelier's embedded engine at Aurelle's governed data (produced by the
# ingestion pipeline). MUST be set before `atelier` is imported, because the
# semantic layer reads this at import time. Using the repo-relative folder keeps
# the app self-contained on Hugging Face Spaces — no env config required.
_GOVERNED_DATA = Path(__file__).resolve().parent / "governed_data"
os.environ.setdefault("ATELIER_DATA_DIR", str(_GOVERNED_DATA))

from atelier import tools                  # noqa: E402  (must follow the env set)
from atelier.identity import Principal     # noqa: E402


# Demo identity directory. In production the role/region/clearance come from the
# SSO token claim (Supabase); for the demo a sidebar selector maps a friendly
# label to one of these principals so you can flip roles live on screen.
ROLES: dict[str, Principal] = {
    "Clienteling Lead — APAC": Principal(
        "lucy.chan", "Lucy Chan", "clienteling_lead", "Aurelle", "APAC", ["HK-PDPO"]),
    "Regional Manager — APAC": Principal(
        "marco.li", "Marco Li", "regional_manager", "Aurelle", "APAC", ["HK-PDPO"]),
    "Merchandiser": Principal(
        "sophie.merch", "Sophie Tan", "merchandiser", "Aurelle", "APAC", ["HK-PDPO"]),
    "Marketing Analyst — APAC": Principal(
        "raj.analyst", "Raj Mehta", "marketing_analyst", "Aurelle", "APAC", ["HK-PDPO"]),
    "Clienteling Lead — Greater China": Principal(
        "elena.zhou", "Elena Zhou", "clienteling_lead", "Aurelle", "GREATER_CHINA", ["CN-PIPL"]),
    "Group Admin": Principal(
        "group.admin", "Group Admin", "group_admin", "Aurelle", "GLOBAL",
        ["HK-PDPO", "CN-PIPL", "EU-GDPR", "US"]),
}

DEFAULT_ROLE = "Clienteling Lead — APAC"


class GovernedClient:
    """The ONLY path from Aurelle to clienteling data. Returns Atelier's governance
    envelope: {ok, summary, data, governance:{stages, redactions, rows_blocked,
    approval_required, cost, audit_event_hash}}."""

    def __init__(self, principal: Principal):
        self.principal = principal

    def lookup_client_360(self, query: str) -> dict:
        return tools.lookup_client_360(self.principal, query=query)

    def next_best_action(self, client_id: str) -> dict:
        return tools.vic_next_best_action(self.principal, client_id=client_id)


def get_governed_client(role_label: str) -> GovernedClient:
    return GovernedClient(ROLES.get(role_label, ROLES[DEFAULT_ROLE]))
