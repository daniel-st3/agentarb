"""Pre-execution screening: what must never be attempted.

This runs after scoring and after the human gate, immediately before a
handler does any work. It is the last chance to decline, and it declines
loudly rather than improvising -- an honest refusal costs nothing, a
confidently-wrong deliverable costs reputation.

Four independent reasons to refuse:

1. **Unsupported** -- no handler for the category.
2. **Harmful** -- the task asks for something we will not produce.
3. **Out of scope** -- it needs capabilities this agent does not have
   (physical presence, credentials, running untrusted code, real money).
4. **Ambiguous** -- too underspecified to attempt honestly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

from arbiter.models import SUPPORTED_CATEGORIES, Bounty, Category

#: Categories of work we decline outright, whatever the payout.
_HARMFUL_PATTERNS: list[tuple[str, str]] = [
    (r"\b(ddos|denial[- ]of[- ]service|botnet)\b", "attack tooling"),
    (r"\b(keylogger|ransomware|rootkit|spyware|stealer)\b", "malware"),
    (r"\b(phish|phishing|credential harvest\w*)\b", "phishing"),
    (r"\bbypass\w*\s+(auth\w*|2fa|mfa|captcha|paywall|drm|licen[cs]\w+)", "access-control bypass"),
    (r"\b(crack|keygen|pirat\w+|tors?ent)\b.*\b(licen[cs]\w+|software|drm)\b", "piracy"),
    (r"\bscrape\w*\b.*\b(personal|private|pii|email address(es)?)\b", "personal-data scraping"),
    (r"\b(dox+|doxx\w*)\b", "doxxing"),
    (r"\b(fake|forged|fraudulent)\b.*\b(ids?|identit(y|ies)|documents?|reviews?|invoices?|"
     r"testimonials?|ratings?)\b", "forgery/fraud"),
    (r"\bsql\s*inject\w*|\bexploit\s+(a\s+)?(vulnerab\w+|cve)\b", "exploitation"),
    (r"\b(spam|bulk\s+unsolicited)\b.*\b(email|dm|message)", "spam"),
    (r"\bimpersonat\w+\b", "impersonation"),
]

#: Work that needs capabilities this agent does not have.
_OUT_OF_SCOPE_PATTERNS: list[tuple[str, str]] = [
    (r"\b(photograph|photo of|take a picture|in[- ]person|on[- ]site|visit\s+the)\b",
     "requires physical presence"),
    (r"\b(notari[sz]e|courier|deliver\s+a\s+package|drive\s+to)\b", "requires physical action"),
    (r"\b(phone\s*call|call\s+them|speak\s+with|interview\s+in\s+person)\b",
     "requires real-time human interaction"),
    (r"\b(log\s*in\s+to|sign\s+in\s+to|use\s+my\s+account|my\s+credentials|api\s+key\s+provided)\b",
     "requires credentials we will not accept"),
    (r"\b(use|provide|paste|send|share|load|read)\b.{0,30}\b(api\s*key|access\s*token|"
     r"bearer\s*token|password|private\s*key|seed\s*phrase|mnemonic|wallet\s*secret)\b",
     "requires credentials or secrets we will not accept"),
    (r"\b(connect|link)\b.{0,20}\b(wallet|metamask|walletconnect)\b",
     "requires wallet connection"),
    (r"\bsign\b.{0,25}\b(message|transaction|authorization|eip[- ]?(191|3009)|payload)\b",
     "requires signing a message or transaction"),
    (r"\b(run|execute)\b.*\b(script|binary|executable|attached\s+code|untrusted)\b",
     "requires executing untrusted code"),
    (r"\b(deploy\s+to\s+production|push\s+to\s+main|merge\s+the\s+pr)\b",
     "requires write access to live systems"),
    (r"\b(send|transfer|pay)\s+(\$?\d[\d,.]*\s*)?(funds|money|usdc|usdt|eth|sol|btc|"
     r"dollars?)\b", "requires moving real funds"),
    (r"\b(make\s+a\s+payment|withdraw\s+(funds|money)|buy\s+.{0,20}\bon[- ]chain\b)\b",
     "requires moving real funds"),
    (r"\b(initiate|execute|complete|release|refund|deposit|capture)\b.{0,35}"
     r"\b(x402|escrow|payment|on[- ]chain\s+transaction)\b",
     "requires payment or escrow interaction"),
    (r"\b(bid|claim|accept|submit|cancel|settle)\b.{0,35}"
     r"\b(task|bounty|work|marketplace|submission)\b",
     "requires a marketplace write action"),
]

#: A task with none of these is probably too vague to attempt.
_MIN_DESCRIPTION_CHARS = 40

_VAGUE_PATTERNS: list[str] = [
    r"^\s*(test|testing|hello|hi|asdf|todo|tbd|placeholder)\s*\.?\s*$",
    r"\b(as\s+discussed|you\s+know\s+what\s+to\s+do|same\s+as\s+(last\s+time|before))\b",
    r"\b(details\s+(to\s+follow|on\s+request)|will\s+share\s+later|dm\s+for\s+details)\b",
]


@dataclass(frozen=True)
class SafetyVerdict:
    allowed: bool
    reason: str = ""
    kind: str = ""          # unsupported | harmful | out_of_scope | ambiguous

    def __bool__(self) -> bool:
        return self.allowed


SAFE = SafetyVerdict(True, "passed pre-execution screening")


def _text(bounty: Bounty) -> str:
    return f"{bounty.title}\n{bounty.description}\n{' '.join(bounty.tags)}".lower()


def screen(bounty: Bounty, max_effort_hours: float | None = None,
           est_effort_hours: float | None = None) -> SafetyVerdict:
    """Decide whether this bounty may be attempted at all."""
    if bounty.category not in SUPPORTED_CATEGORIES or bounty.category == Category.UNKNOWN:
        return SafetyVerdict(
            False, f"no handler for category {bounty.category.value}", "unsupported"
        )

    haystack = _text(bounty)

    for pattern, label in _HARMFUL_PATTERNS:
        if re.search(pattern, haystack):
            return SafetyVerdict(False, f"refused: {label}", "harmful")

    for pattern, label in _OUT_OF_SCOPE_PATTERNS:
        if re.search(pattern, haystack):
            return SafetyVerdict(False, f"out of scope: {label}", "out_of_scope")

    description = bounty.description.strip()
    if len(description) < _MIN_DESCRIPTION_CHARS:
        return SafetyVerdict(
            False,
            f"too underspecified to attempt honestly ({len(description)} chars of description)",
            "ambiguous",
        )
    for pattern in _VAGUE_PATTERNS:
        if re.search(pattern, description.lower()):
            return SafetyVerdict(False, "description is a placeholder, not a spec", "ambiguous")

    if (
        max_effort_hours is not None
        and est_effort_hours is not None
        and est_effort_hours > max_effort_hours
    ):
        return SafetyVerdict(
            False,
            f"estimated effort {est_effort_hours:.2f}h exceeds cap {max_effort_hours:.2f}h",
            "out_of_scope",
        )

    return SAFE
