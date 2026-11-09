# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.accounts import DASHBOARD_ROOT_TYPES, validate_account
from frappe_books.coa import ensure_discount_account
from frappe_books.company import company_value, default_company
from frappe_books.regional import validate_gstin
from frappe_books.settings import company_country, validate_one_way_switches

POINT_OF_SALE_FEATURES = (
	"enable_batches",
	"enable_uom_conversions",
	"enable_serial_number",
	"show_barcode_field",
	"enable_point_of_sale",
)
ONE_WAY_SWITCHES = (
	"enable_discounts_and_margin",
	"enable_inventory",
	"enable_lead",
	"enable_invoice_returns",
	"enable_loyalty_point_program",
	"enable_point_of_sale_with_out_inventory",
	"enable_item_group",
)


class BooksAccountingSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_dashboard_account.books_dashboard_account import (
			BooksDashboardAccount,
		)

		bank_name: DF.Data
		country: DF.Link | None
		dashboard_accounts: DF.Table[BooksDashboardAccount]
		enable_coupon_code: DF.Check
		enable_discounts_and_margin: DF.Check
		enable_form_customization: DF.Check
		enable_inventory: DF.Check
		enable_invoice_returns: DF.Check
		enable_item_enquiry: DF.Check
		enable_lead: DF.Check
		enable_loyalty_point_program: DF.Check
		enable_partial_payment: DF.Check
		enable_point_of_sale_with_out_inventory: DF.Check
		enable_price_list: DF.Check
		enable_pricing_rule: DF.Check
		enable_item_group: DF.Check
		year_end_date: DF.Date
		year_start_date: DF.Date
		fullname: DF.Data
		gstin: DF.Data | None
		setup_complete: DF.Check
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Accounting Settings"

	@property
	def country(self):
		"""The company country, which Frappe's System Settings holds."""
		return company_country()

	def on_update(self):
		if self.is_enabled_now("enable_discounts_and_margin"):
			set_discount_account()
		if self.is_enabled_now("enable_point_of_sale_with_out_inventory"):
			inventory_settings = frappe.get_single("Books Inventory Settings")
			inventory_settings.update(dict.fromkeys(POINT_OF_SALE_FEATURES, 1))
			inventory_settings.save()

	def is_enabled_now(self, fieldname):
		return bool(self.get(fieldname)) and self.has_value_changed(fieldname)

	def validate(self):
		validate_one_way_switches(self, ONE_WAY_SWITCHES)
		if self.gstin and company_country() == "India":
			self.gstin = validate_gstin(self.gstin)
		self.validate_dashboard_accounts()

	def validate_dashboard_accounts(self):
		"""Each account once; a new or changed row must be a leaf Asset or Liability account.

		A saved row whose account has since stopped qualifying is left alone, so it does not block
		saving other settings; the dashboard skips it. Rows are matched to the saved ones by name.
		"""
		rows = [row for row in self.dashboard_accounts if row.account]
		seen = set()
		for row in rows:
			if row.account in seen:
				frappe.throw(_("{0} is on the dashboard more than once.").format(row.account))
			seen.add(row.account)

		before = self.get_doc_before_save()
		previous = {row.name: row.account for row in before.dashboard_accounts} if before else {}
		for row in rows:
			if previous.get(row.name) != row.account:
				validate_account(row, "account", root_types=DASHBOARD_ROOT_TYPES)


def set_discount_account():
	"""Discounts post to the company discount account, so turning them on makes one if it is missing."""
	company = default_company()
	if company and not company_value("default_discount_account"):
		frappe.db.set_value("Books Company", company, "default_discount_account", ensure_discount_account())
