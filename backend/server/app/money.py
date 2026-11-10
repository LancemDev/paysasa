"""Money helpers. Amounts are integer minor units; no floating-point maths on money."""
import re

DEFAULT_CURRENCY = "USD"
ALLOWED_CURRENCIES: tuple[str, ...] = ("KES", "USD", "EUR", "GBP", "CAD", "AUD", "CHF")
# The subset PayPal can invoice and pay out in. KES is not a PayPal REST currency, so it is display-only.
PAYPAL_CURRENCIES: tuple[str, ...] = ("USD", "EUR", "GBP", "CAD", "AUD", "CHF")
_SYMBOLS = {"KES": "KSh ", "USD": "$", "EUR": "€", "GBP": "£", "CAD": "CA$", "AUD": "A$", "CHF": "CHF "}
_DECIMALS = 2  # every allowed currency uses 2 decimal places

_AMOUNT_RE = re.compile(r"^\d+(\.\d+)?$")
_PERCENT_RE = re.compile(r"^\d+(\.\d{1,2})?$")


class MoneyError(ValueError):
    pass


def check_currency(currency: str) -> str:
    code = (currency or "").strip().upper()
    if code not in ALLOWED_CURRENCIES:
        raise MoneyError(
            f"Currency {currency!r} is not supported. Use one of: {', '.join(ALLOWED_CURRENCIES)}."
        )
    return code


def check_paypal_currency(currency: str) -> str:
    """Like check_currency, but only for currencies PayPal can invoice and pay out in."""
    code = (currency or "").strip().upper()
    if code in PAYPAL_CURRENCIES:
        return code
    supported = ", ".join(PAYPAL_CURRENCIES)
    if code in ALLOWED_CURRENCIES:
        raise MoneyError(f"PayPal can't invoice or pay out in {code}. Use one of: {supported}.")
    raise MoneyError(f"Currency {currency!r} is not supported. Use one of: {supported}.")


def parse_amount(value: str) -> int:
    """'1200.00' -> 120000. Accepts thousands commas ('1,200'). Rejects more than 2 decimals."""
    text = str(value).strip().replace(",", "")
    if not _AMOUNT_RE.match(text):
        raise MoneyError(f"Invalid amount {value!r}; use a decimal string like '1200.00'.")
    whole, _, frac = text.partition(".")
    if len(frac) > _DECIMALS:
        raise MoneyError(f"Invalid amount {value!r}; at most {_DECIMALS} decimal places.")
    return int(whole) * 10**_DECIMALS + int(frac.ljust(_DECIMALS, "0") or "0")


def parse_percent_hundredths(value: str) -> int:
    """'20' -> 2000, '12.5' -> 1250. Percent with at most 2 decimals, as hundredths of a percent."""
    text = str(value).strip()
    if not _PERCENT_RE.match(text):
        raise MoneyError(f"Invalid percent {value!r}; use a number with at most 2 decimals.")
    whole, _, frac = text.partition(".")
    return int(whole) * 100 + int(frac.ljust(2, "0") or "0")


def split_amount(amount_minor: int, percent_hundredths: int) -> int:
    """floor(amount_minor * percent / 100). 20% of 120000 -> 24000."""
    return amount_minor * percent_hundredths // 10_000


def format_minor(amount_minor: int) -> str:
    """120000 -> '1200.00' (PayPal-style decimal string, no symbol)."""
    whole, frac = divmod(amount_minor, 10**_DECIMALS)
    return f"{whole}.{frac:0{_DECIMALS}d}"


def format_money(amount_minor: int, currency: str) -> str:
    """120000, 'USD' -> '$1,200.00'."""
    whole, frac = divmod(amount_minor, 10**_DECIMALS)
    symbol = _SYMBOLS.get(currency, f"{currency} ")
    return f"{symbol}{whole:,}.{frac:0{_DECIMALS}d}"
