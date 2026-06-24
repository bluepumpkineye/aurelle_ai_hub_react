import re

BLOCKED_PATTERNS = [
    r"\b(competitor|LVMH secret|Richemont secret|confidential pricing)\b",
    r"\b(hack|exploit|bypass|jailbreak)\b",
    r"\b(personal data dump|export all clients)\b",
]

BRAND_TONE_VIOLATIONS = [
    "cheap", "discount", "bargain", "sale price", "knock-off", "fake"
]


def check_input_guardrails(text: str) -> tuple:
    """
    Check user input for blocked content, prompt-injection, and length abuse.
    Returns (is_safe: bool, reason: str)
    """
    # Length + prompt-injection / jailbreak detection (centralized).
    try:
        from utils.security import vet_user_prompt
        ok, payload = vet_user_prompt(text)
        if not ok:
            return False, payload
    except Exception:
        pass

    for pattern in BLOCKED_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE):
            try:
                from utils import audit
                audit.log_security("guardrail_block", reason="restricted_content")
            except Exception:
                pass
            return False, "Query blocked: Contains restricted content."
    return True, "OK"


def check_output_guardrails(text: str) -> tuple:
    """
    Check LLM output for brand tone violations.
    Returns (is_safe: bool, message: str)
    """
    for word in BRAND_TONE_VIOLATIONS:
        if word in text.lower():
            return False, f"Output flagged: Contains off-brand term '{word}'"
    return True, text


def sanitize_response(text: str) -> str:
    """Redact PII (emails, phone numbers) from LLM output."""
    if not text:
        return text

    # Redact email addresses
    text = re.sub(
        r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b',
        '[EMAIL REDACTED]',
        text
    )

    # Redact phone-like sequences only — require phone formatting and 8–15
    # digits so monetary/figure values (e.g. "$1,234,567") are left intact.
    def _redact_phone(m: re.Match) -> str:
        digits = re.sub(r'\D', '', m.group(0))
        return '[PHONE REDACTED]' if 8 <= len(digits) <= 15 else m.group(0)

    text = re.sub(
        r'(?<![\w$])\+?\d[\d\s().-]{6,17}\d(?![\w])',
        _redact_phone,
        text
    )
    return text