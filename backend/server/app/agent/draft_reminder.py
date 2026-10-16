"""LLM-drafted overdue reminder, checked in code; falls back to a fixed template."""
import logging
import re
from datetime import date

from app.agent.llm import LLM
from app.money import format_money, parse_amount

log = logging.getLogger(__name__)

MAX_CHARS = 500
_LINK_RE = re.compile(r"(https?://|www\.|\b[\w-]+\.(com|net|org|io|co|app|me|ke|uk)\b)", re.I)
_MONEY_RE = re.compile(
    r"(?:[$£€]\s?(\d[\d,]*(?:\.\d+)?))|(?:(\d[\d,]*(?:\.\d+)?)\s?(?:USD|GBP|EUR|dollars?|pounds?|euros?)\b)", re.I
)

SYSTEM = (
    "You write short, polite payment reminders from a freelancer to a client. "
    "Plain text only, at most 400 characters. No links, no placeholders, no subject line. "
    "Mention only the amount you are given. Sign off with the sender's name."
)


def template(client_name: str, sender_name: str, description: str, amount: str, days_overdue: int) -> str:
    days = "1 day" if days_overdue == 1 else f"{days_overdue} days"
    return (f"Hi {client_name}, a friendly reminder that the invoice for {description} ({amount}) "
            f"is now {days} overdue. You can pay it from the original PayPal invoice. Thank you! {sender_name}")


def is_valid(text: str, amount_minor: int) -> bool:
    if not text or len(text) > MAX_CHARS or _LINK_RE.search(text):
        return False
    for m in _MONEY_RE.finditer(text):
        try:
            if parse_amount(m.group(1) or m.group(2)) != amount_minor:
                return False
        except ValueError:
            return False
    return True


async def draft_reminder(
    llm: LLM | None, *, client_name: str, sender_name: str, description: str, amount_minor: int,
    currency: str, due_date: date, days_overdue: int,
) -> str:
    amount = format_money(amount_minor, currency)
    fallback = template(client_name, sender_name, description, amount, days_overdue)
    if llm is None:
        return fallback
    prompt = (f"Client: {client_name}\nSender: {sender_name}\nInvoice for: {description}\n"
              f"Amount: {amount}\nDue date: {due_date.isoformat()}\nDays overdue: {days_overdue}\n"
              "Write the reminder.")
    try:
        text = (await llm.complete(system=SYSTEM, prompt=prompt)).strip()
    except Exception:
        log.exception("draft_reminder LLM call failed; using template")
        return fallback
    if not is_valid(text, amount_minor):
        log.warning("draft_reminder output broke the rules; using template")
        return fallback
    return text
