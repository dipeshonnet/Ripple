"""Validate referential integrity and commercial scoping for Performance Arena data."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List

ROOT = Path(__file__).resolve().parent
DATA_JS = ROOT / "data.js"


def load_data(path: Path = DATA_JS) -> Dict[str, List[Dict[str, Any]]]:
    text = path.read_text(encoding="utf-8")
    match = re.search(r"window\.SEED_DATA\s*=\s*(.*?);\s*$", text, re.S)
    if not match:
        raise ValueError(f"Could not parse window.SEED_DATA from {path}")
    return json.loads(match.group(1))


def money(row: Dict[str, Any], field: str) -> float:
    try:
        return abs(float(row.get(field) or 0))
    except Exception:
        return 0.0


def main():
    data = load_data()
    errors: List[str] = []
    users = {u.get("UserID"): u for u in data.get("Users", [])}
    teams = {t.get("TeamID"): t for t in data.get("Teams", [])}
    kpis = {k.get("KPI_ID"): k for k in data.get("KPI_Master", [])}
    tls = {u.get("UserID"): u for u in data.get("Users", []) if u.get("Role") == "Team Lead"}
    agents = [u for u in data.get("Users", []) if u.get("Role") == "Agent"]

    for u in agents:
        if not u.get("TeamID") or not u.get("ProcessID"):
            errors.append(f"Agent {u.get('UserID')} missing TeamID or ProcessID")
    for u in tls.values():
        if not u.get("TeamID") or not u.get("ProcessID"):
            errors.append(f"TL {u.get('UserID')} missing TeamID or ProcessID")
    for t in teams.values():
        if not t.get("TeamLeadID") or t.get("TeamLeadID") not in users:
            errors.append(f"Team {t.get('TeamID')} has invalid TeamLeadID {t.get('TeamLeadID')}")
        if not t.get("ManagerID") or t.get("ManagerID") not in users:
            errors.append(f"Team {t.get('TeamID')} has invalid ManagerID {t.get('ManagerID')}")
    for row in data.get("Performance_Data", []):
        if row.get("KPI_ID") not in kpis:
            errors.append(f"Performance_Data invalid KPI_ID {row.get('KPI_ID')}")
        if row.get("UserID") not in users:
            errors.append(f"Performance_Data invalid UserID {row.get('UserID')}")
    for row in data.get("Challenge_Participants", []):
        if row.get("UserID") not in users:
            errors.append(f"Challenge_Participants invalid UserID {row.get('UserID')}")
    for row in data.get("Mission_Assignments", []):
        if row.get("UserID") not in users:
            errors.append(f"Mission_Assignments invalid UserID {row.get('UserID')}")

    # Commercial verification scoping.
    account_penalty = 0.0
    team_penalty_by_owner: Dict[str, float] = {tl_id: 0.0 for tl_id in tls}
    for row in data.get("Commercial_Verification", []):
        role = row.get("Verifier_Role")
        owner = row.get("Owner_ID")
        entity = row.get("Entity_ID")
        level = row.get("Entity_Level")
        pen = money(row, "Forecast_Penalty")
        if role == "Team Lead":
            tl = tls.get(owner)
            if not tl:
                errors.append(f"TL commercial row {row.get('Verification_ID')} has invalid Owner_ID {owner}")
            else:
                expected_team = tl.get("TeamID")
                if entity != expected_team:
                    errors.append(f"TL commercial row {row.get('Verification_ID')} owner {owner} maps to {entity}, expected {expected_team}")
                if level != "Team":
                    errors.append(f"TL commercial row {row.get('Verification_ID')} is not team-level")
                team_penalty_by_owner[owner] = team_penalty_by_owner.get(owner, 0.0) + pen
        elif role == "Manager":
            if level != "Account" or entity != "HCA001":
                errors.append(f"Manager commercial row {row.get('Verification_ID')} is not account-level HCA001")
            account_penalty += pen

    if account_penalty <= 0:
        errors.append("Manager account penalty is zero or missing")
    for tl_id, tl_penalty in team_penalty_by_owner.items():
        if tl_penalty >= account_penalty:
            errors.append(f"TL {tl_id} penalty {tl_penalty} is not less than manager account penalty {account_penalty}")

    # No INR or Indian currency terms in active data.js.
    text = DATA_JS.read_text(encoding="utf-8")
    banned = ["₹", "INR", "Lakh", "Crore"]
    for term in banned:
        if term in text:
            errors.append(f"Banned currency/reference found in data.js: {term!r}")
    # Avoid false positives like Created_By. Only flag Cr/L when used as numeric Indian currency shorthand.
    for pattern in [r"\b\d+(?:\.\d+)?\s*Cr\b", r"\b\d+(?:\.\d+)?\s*L\b"]:
        if re.search(pattern, text):
            errors.append(f"Banned Indian currency shorthand found in data.js: {pattern}")

    if errors:
        print("VALIDATION FAILED")
        for e in errors[:250]:
            print(f" - {e}")
        if len(errors) > 250:
            print(f"... {len(errors) - 250} more")
        raise SystemExit(1)
    print("VALIDATION PASSED")
    print(f"Users: {len(users)} | Agents: {len(agents)} | TLs: {len(tls)} | Teams: {len(teams)} | KPIs: {len(kpis)}")
    print(f"Manager account penalty: {account_penalty:.2f}")
    print("TL penalties: " + ", ".join(f"{k}={v:.2f}" for k, v in sorted(team_penalty_by_owner.items())))


if __name__ == "__main__":
    main()
