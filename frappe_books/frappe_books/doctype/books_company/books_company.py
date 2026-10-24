# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.accounts import validate_changed_accounts
from frappe_books.company import default_company
from frappe_books.settings import company_country

ACCOUNT_TYPES = {
	"write_off_account": {"root_types": ("Expense",)},
	"round_off_account": {"root_types": ("Expense",)},
	"default_discount_account": {"root_types": ("Income",)},
	"default_inventory_account": {"account_types": ("Stock",)},
	"stock_received_but_not_billed": {"account_types": ("Stock Received But Not Billed",)},
	"default_expense_account": {"account_types": ("Cost of Goods Sold",)},
	"stock_adjustment_account": {"account_types": ("Stock Adjustment",)},
}


class BooksCompany(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		abbr: DF.Data
		company_name: DF.Data
		country: DF.Link | None
		default_currency: DF.Link | None
		default_discount_account: DF.Link | None
		default_expense_account: DF.Link | None
		default_inventory_account: DF.Link | None
		default_warehouse: DF.Link | None
		email: DF.Data
		round_off_account: DF.Link | None
		stock_adjustment_account: DF.Link | None
		stock_received_but_not_billed: DF.Link | None
		tax_id: DF.Data | None
		write_off_account: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Company"

	@property
	def country(self):
		"""The company country, which Frappe's System Settings holds."""
		return company_country()

	@property
	def default_currency(self):
		"""The company currency, which Frappe's System Settings holds."""
		return frappe.db.get_single_value("System Settings", "currency")

	def before_validate(self):
		# ERPNext's abbreviation: the initials of the company name.
		self.abbr = (self.abbr or "".join(word[0] for word in self.company_name.split()).upper()).strip()

	def validate(self):
		validate_changed_accounts(self, ACCOUNT_TYPES)

	def before_insert(self):
		if default_company():
			frappe.throw(_("Frappe Books keeps one company."))
