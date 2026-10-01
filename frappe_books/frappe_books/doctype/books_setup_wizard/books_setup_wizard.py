# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import json
from datetime import date
from functools import cache

import frappe
from frappe import _
from frappe.geo.country_info import get_country_info
from frappe.model.document import Document
from frappe.utils import add_days, add_years, getdate, momentjs

from frappe_books.coa import chart_options
from frappe_books.permissions import check_preview_permission
from frappe_books.setup_service import run_setup


class BooksSetupWizard(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		bank_name: DF.Data
		chart_of_accounts: DF.Autocomplete
		company_name: DF.Data
		country: DF.Link
		currency: DF.Link
		email: DF.Data
		fiscal_year_end: DF.Date
		fiscal_year_start: DF.Date
		fullname: DF.Data
		logo: DF.AttachImage | None
		time_zone: DF.Data | None
	# end: auto-generated types

	def before_validate(self):
		self.set_country_defaults()
		if not self.time_zone and self.country:
			# Frappe's setup wizard also starts from the country's first time zone.
			time_zones = sorted(get_country_info(self.country).get("timezones") or [])
			self.time_zone = time_zones[0] if time_zones else None
		if self.time_zone:
			# Browsers and Frappe's country data may use an old alias, e.g. Asia/Calcutta.
			self.time_zone = momentjs.data["links"].get(self.time_zone, self.time_zone)

	@frappe.whitelist()
	def preview(self):
		"""Fill what a save would take from the country, without saving, for the form to show it."""
		check_preview_permission(self)
		self.set_country_defaults()

	def set_country_defaults(self):
		"""Suggest the country's currency, chart and fiscal year; each date also follows the other."""
		country_info = get_country_info(self.country)
		info = get_books_country_info().get(self.country) or {}
		self.currency = self.currency or get_country_currency(country_info)
		self.chart_of_accounts = self.chart_of_accounts or get_country_chart(country_info.get("code"))
		self.fiscal_year_start = self.fiscal_year_start or get_fiscal_year_date(info, "fiscal_year_start")
		if not self.fiscal_year_start and self.fiscal_year_end:
			self.fiscal_year_start = add_days(add_years(self.fiscal_year_end, -1), 1)
		self.fiscal_year_end = self.fiscal_year_end or get_fiscal_year_date(info, "fiscal_year_end")
		if not self.fiscal_year_end and self.fiscal_year_start:
			self.fiscal_year_end = add_days(add_years(self.fiscal_year_start, 1), -1)

	def validate(self):
		if getdate(self.fiscal_year_end) <= getdate(self.fiscal_year_start):
			frappe.throw(_("Fiscal Year End Date must be after Fiscal Year Start Date."))
		if self.time_zone and self.time_zone not in momentjs.get_all_timezones():
			frappe.throw(_("{0} is not a valid time zone.").format(self.time_zone))


@cache
def get_books_country_info() -> dict:
	"""The fiscal years and locales Frappe's country data lacks, by Frappe country name."""
	path = frappe.get_app_path("frappe_books", "data", "country_info.json")
	with open(path) as file:
		return json.load(file)


def get_country_currency(info: dict) -> str | None:
	currency = info.get("currency")
	return currency if currency and frappe.db.exists("Currency", currency) else None


def get_country_chart(code: str | None) -> str | None:
	"""The country's chart in the user's language, else the standard chart."""
	if not code:
		return None
	language = (frappe.local.lang or "en").lower().replace("_", "-").split("-")[0]
	charts = chart_options()
	chart = next(
		(
			chart
			for chart in charts
			if chart["country_code"] == code and chart["language"] in (None, language)
		),
		charts[0],
	)
	return chart["name"]


def get_fiscal_year_date(info: dict, fieldname: str) -> date | None:
	"""The fiscal year that is current in Books' reckoning: before April it began last year."""
	month_day = info.get(fieldname)
	if not month_day:
		return None
	today = getdate()
	month, day = (int(part) for part in month_day.split("-"))
	is_first_quarter = today.month <= 3
	if fieldname == "fiscal_year_start":
		year = today.year - 1 if is_first_quarter else today.year
	else:
		year = today.year if is_first_quarter else today.year + 1
	return date(year, month, day)


@frappe.whitelist(methods=["POST"])
def complete_setup() -> dict:
	"""Set up the company from the saved wizard values, once."""
	wizard = frappe.get_single("Books Setup Wizard")
	wizard.check_permission("write")
	if frappe.db.get_single_value("Books Accounting Settings", "setup_complete"):
		frappe.throw(_("Frappe Books setup is already complete."))
	wizard.save()
	result = run_setup(wizard)
	frappe.msgprint(_("Frappe Books setup is complete."), alert=True)
	return result
