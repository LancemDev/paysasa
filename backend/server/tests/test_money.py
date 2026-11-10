import pytest

from app.money import (
    MoneyError, check_currency, check_invoice_currency, format_minor, format_money, invoice_currency,
    parse_amount, parse_percent_hundredths, split_amount,
)


@pytest.mark.parametrize("text,minor", [
    ("1200.00", 120000), ("1200", 120000), ("1,200", 120000), ("0.5", 50), ("45.50", 4550), ("0.01", 1),
])
def test_parse_amount(text, minor):
    assert parse_amount(text) == minor


@pytest.mark.parametrize("text", ["", "abc", "-5", "1.234", "1e3", "12.", ".5", "$10"])
def test_parse_amount_rejects(text):
    with pytest.raises(MoneyError):
        parse_amount(text)


def test_split_rounds_down():
    assert split_amount(120000, parse_percent_hundredths("20")) == 24000
    assert split_amount(999, parse_percent_hundredths("33.33")) == 332
    assert split_amount(100, parse_percent_hundredths("12.5")) == 12


def test_format():
    assert format_money(120000, "USD") == "$1,200.00"
    assert format_money(8000, "GBP") == "£80.00"
    assert format_money(4550, "EUR") == "€45.50"
    assert format_money(150000, "KES") == "KSh 1,500.00"
    assert format_minor(120000) == "1200.00"


def test_currency():
    assert check_currency("usd") == "USD"
    assert check_currency("kes") == "KES"
    for bad in ("ZAR", "NGN", "XYZ", ""):
        with pytest.raises(MoneyError):
            check_currency(bad)


def test_invoice_currency():
    # PayPal Invoicing supports these for our merchant account.
    for code in ("usd", "EUR", "gbp", "CAD", "AUD", "CHF"):
        assert check_invoice_currency(code) == code.upper()
    # KES is display-only: new invoices fall back to USD.
    with pytest.raises(MoneyError):
        check_invoice_currency("KES")
    assert invoice_currency("KES") == "USD"
    assert invoice_currency("eur") == "EUR"
    assert invoice_currency(None) == "USD"
    assert invoice_currency("ZZZ") == "USD"
