"""Set up a Books company on the current Frappe site."""

import frappe
from frappe.desk.page.setup_wizard.setup_wizard import complete_app_setup

from frappe_books.coa import (
	ensure_bank_account,
	ensure_cash_account,
	ensure_chart,
	ensure_discount_account,
	find_ledger_account,
	load_chart,
)
from frappe_books.currency import currency_precision
from frappe_books.regional import ensure_regional_records
from frappe_books.series import NUMBER_SERIES
from frappe_books.settings import update_system_settings


def run_setup(wizard):
	complete_site_setup(wizard)
	chart = load_chart(wizard.chart_of_accounts)
	ensure_chart(chart)
	ensure_regional_records(wizard.country)
	bank_account = ensure_bank_account(wizard.bank_name, chart, wizard.country)
	discount_account = ensure_discount_account(chart)
	enable_currency(wizard.currency)
	accounts = {**default_accounts(chart), "cash": ensure_cash_account(chart)}
	_update_accounting_settings(wizard, discount_account, accounts)
	_update_books_system_settings(wizard)
	_update_print_settings(wizard)
	_update_inventory_settings(accounts)
	_update_pos_settings(accounts)
	_update_payment_methods(accounts["cash"], bank_account)
	_update_defaults()
	return {"setup_complete": True, "bank_account": bank_account}


def complete_site_setup(wizard):
	"""Frappe's setup sets System Settings: country, currency, time zone and formats.

	On a site Frappe has set up already, only the company country and currency change.
	"""
	if frappe.is_setup_complete():
		update_system_settings({"country": wizard.country, "currency": wizard.currency})
	else:
		complete_app_setup(country=wizard.country, currency=wizard.currency, timezone=wizard.time_zone)


def enable_currency(currency):
	"""Frappe offers only enabled currencies in Link searches and in the boot /books formats with."""
	doc = frappe.get_doc("Currency", currency)
	if not doc.enabled:
		doc.enabled = 1
		# Saving clears the cached boots, so the next page load has the currency.
		doc.save()


def default_accounts(chart):
	"""Pick the chart's ledger accounts for settings by name first, then by account type."""
	return {
		"write_off": find_ledger_account(chart, ["Write Off"]),
		"round_off": find_ledger_account(chart, ["Rounded Off", "Round Off"]),
		"receivable": find_ledger_account(chart, ["Debtors"], "Receivable"),
		"stock_in_hand": find_ledger_account(chart, ["Stock In Hand"], "Stock"),
		"stock_received_but_not_billed": find_ledger_account(
			chart, ["Stock Received But Not Billed"], "Stock Received But Not Billed"
		),
		"cost_of_goods_sold": find_ledger_account(chart, ["Cost of Goods Sold"], "Cost of Goods Sold"),
		"stock_adjustment": find_ledger_account(chart, ["Stock Adjustment"], "Stock Adjustment"),
	}


def _update_accounting_settings(wizard, discount_account, accounts):
	settings = frappe.get_single("Books Accounting Settings")
	settings.update(
		{
			"fullname": wizard.fullname,
			"company_name": wizard.company_name,
			"bank_name": wizard.bank_name,
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


def _update_books_system_settings(wizard):
	settings = frappe.get_single("Books System Settings")
	settings.update(
		{
			"display_precision": currency_precision(wizard.currency),
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
			"stock_adjustment": accounts["stock_adjustment"],
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


def _update_payment_methods(cash_account, bank_account):
	"""Receipts by the seeded methods default to the company's cash and bank accounts."""
	for method, account in (("Cash", cash_account), ("Bank", bank_account)):
		frappe.db.set_value("Books Payment Method", method, "account", account, update_modified=False)


def _update_defaults():
	"""Set the default number series.

	Payment accounts and stock locations stay empty, so invoices do not pay or move stock on submit unasked.
	"""
	defaults = frappe.get_single("Books Defaults")
	defaults.update({field: prefix for prefix, _type, field in NUMBER_SERIES.values() if field})
	defaults.save(ignore_permissions=True)
