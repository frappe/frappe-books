"""Set up a Books company on the current Frappe site."""

import frappe

from frappe_books.accounting.money import as_decimal
from frappe_books.coa import (
	ensure_bank_account,
	ensure_chart,
	ensure_discount_account,
	find_account,
	find_ledger_account,
	load_chart,
)
from frappe_books.currency import currency_fraction_values, currency_precision
from frappe_books.regional import ensure_regional_records
from frappe_books.series import NUMBER_SERIES


def run_setup(wizard):
	chart = load_chart(wizard.chart_of_accounts)
	ensure_chart(chart)
	ensure_regional_records(wizard.country)
	bank_account = ensure_bank_account(wizard.bank_name, chart, wizard.country)
	discount_account = ensure_discount_account(chart)
	ensure_currency(wizard.currency)
	accounts = _default_accounts(chart)
	_update_accounting_settings(wizard, discount_account, accounts)
	_update_system_settings(wizard)
	_update_print_settings(wizard)
	_update_inventory_settings(accounts)
	_update_pos_settings(accounts)
	_update_defaults(bank_account, accounts)
	return {"setup_complete": True, "bank_account": bank_account}


def ensure_currency(currency):
	if not currency or frappe.db.exists("Books Currency", currency):
		return
	core_currency = (
		frappe.db.get_value(
			"Currency",
			currency,
			["symbol", "fraction", "fraction_units", "smallest_currency_fraction_value"],
			as_dict=True,
		)
		or {}
	)
	fraction_values = currency_fraction_values(currency)
	minimum = as_decimal(core_currency.get("smallest_currency_fraction_value"))
	if minimum and minimum > fraction_values["smallest_value"]:
		fraction_values["smallest_value"] = minimum
	frappe.get_doc(
		{
			"doctype": "Books Currency",
			"name": currency,
			"symbol": core_currency.get("symbol") or currency,
			"fraction": core_currency.get("fraction") or "Cent",
			**fraction_values,
		}
	).insert(ignore_permissions=True)


def _default_accounts(chart):
	"""Pick the chart's accounts for settings by name first, then by account type."""
	return {
		"write_off": find_account(chart, ["Write Off"]),
		"round_off": find_account(chart, ["Rounded Off", "Round Off"]),
		"cash": find_account(chart, ["Cash"], "Cash"),
		"receivable": find_account(chart, ["Debtors"], "Receivable"),
		"stock_in_hand": find_ledger_account(chart, ["Stock In Hand"], "Stock"),
		"stock_received_but_not_billed": find_ledger_account(
			chart, ["Stock Received But Not Billed"], "Stock Received But Not Billed"
		),
		"cost_of_goods_sold": find_ledger_account(chart, ["Cost of Goods Sold"], "Cost of Goods Sold"),
	}


def _update_accounting_settings(wizard, discount_account, accounts):
	settings = frappe.get_single("Books Accounting Settings")
	settings.update(
		{
			"fullname": wizard.fullname,
			"company_name": wizard.company_name,
			"bank_name": wizard.bank_name,
			"country": wizard.country,
			"email": wizard.email,
			"write_off_account": accounts["write_off"],
			"round_off_account": accounts["round_off"],
			"discount_account": discount_account,
			"fiscal_year_start": wizard.fiscal_year_start,
			"fiscal_year_end": wizard.fiscal_year_end,
			"setup_complete": 1,
		}
	)
	settings.save(ignore_permissions=True)


def _update_print_settings(wizard):
	settings = frappe.get_single("Books Print Settings")
	settings.update(
		{
			"logo": wizard.logo,
			"company_name": wizard.company_name,
			"email": wizard.email,
			"display_logo": bool(wizard.logo),
		}
	)
	settings.save(ignore_permissions=True)


def _update_system_settings(wizard):
	settings = frappe.get_single("Books System Settings")
	settings.update(
		{
			"currency": wizard.currency,
			"display_precision": currency_precision(wizard.currency),
			"country_code": _country_code(wizard.country),
			"locale": "en-IN" if wizard.country == "India" else "en-US",
		}
	)
	settings.save(ignore_permissions=True)


def _update_inventory_settings(accounts):
	settings = frappe.get_single("Books Inventory Settings")
	settings.update(
		{
			"default_location": "Stores",
			"stock_in_hand": accounts["stock_in_hand"],
			"stock_received_but_not_billed": accounts["stock_received_but_not_billed"],
			"cost_of_goods_sold": accounts["cost_of_goods_sold"],
		}
	)
	settings.save(ignore_permissions=True)


def _update_pos_settings(accounts):
	settings = frappe.get_single("Books Pos Settings")
	settings.update(
		{
			"inventory": "Stores",
			"cash_account": accounts["cash"],
			"write_off_account": accounts["write_off"],
			"default_account": accounts["receivable"],
		}
	)
	settings.save(ignore_permissions=True)
	if accounts["cash"]:
		frappe.db.set_value(
			"Books Payment Method", "Cash", "account", accounts["cash"], update_modified=False
		)


def _update_defaults(bank_account, accounts):
	defaults = frappe.get_single("Books Defaults")
	defaults.update(
		{
			"sales_payment_account": accounts["cash"],
			"purchase_payment_account": bank_account,
			"shipment_location": "Stores",
			"purchase_receipt_location": "Stores",
			**{field: prefix for prefix, _type, field in NUMBER_SERIES.values() if field},
		}
	)
	defaults.save(ignore_permissions=True)


def _country_code(country):
	return {"India": "in", "Switzerland": "ch"}.get(country, "-")
