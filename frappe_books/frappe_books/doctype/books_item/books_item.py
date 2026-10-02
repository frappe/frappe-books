# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt

from frappe_books.accounting.accounts import latest_ledger_account, validate_account
from frappe_books.permissions import check_preview_permission
from frappe_books.series import INVALID_PREFIX_CHARACTERS, ITEM_SERIES, validate_prefix
from frappe_books.settings import company_country, require_features

# Item fields the Books app offers only while their feature is on.
ITEM_FEATURES = {
	"track_item": "enable_inventory",
	"has_batch": "enable_batches",
	"has_serial_number": "enable_serial_number",
	"uom_conversions": "enable_uom_conversions",
	"item_group": "enableitem_group",
}


class BooksItem(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_uom_conversion_item.books_uom_conversion_item import (
			BooksUomConversionItem,
		)

		barcode: DF.Data | None
		batch_series: DF.Data | None
		description: DF.Text | None
		expense_account: DF.Link
		has_batch: DF.Check
		has_serial_number: DF.Check
		hsn_code: DF.Data | None
		image: DF.AttachImage | None
		income_account: DF.Link
		item_code: DF.Data | None
		item_group: DF.Link | None
		item_type: DF.Literal["Product", "Service"]
		item_usage: DF.Literal["Purchases", "Sales", "Both"]
		rate: DF.Currency
		serial_number_series: DF.Data | None
		tax: DF.Link | None
		track_item: DF.Check
		unit: DF.Link | None
		uom_conversions: DF.Table[BooksUomConversionItem]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Item"

	def before_validate(self):
		for flag, fieldname in ITEM_SERIES.values():
			series = (self.get(fieldname) or "").strip()
			if self.get(flag) and series:
				# A dash keeps the series prefix apart from its numbers.
				self.set(fieldname, series if series.endswith("-") else f"{series}-")
		self.set_missing_values()

	def set_missing_values(self):
		self.income_account = self.income_account or _default_income_account(self.item_type)
		self.expense_account = self.expense_account or _default_expense_account(self.track_item)

	@frappe.whitelist()
	def preview(self):
		"""Fill the values a save would fill, without saving, for the form to show them."""
		check_preview_permission(self)
		# Frappe fills fetched values, like the item group's HSN code, while it checks the links.
		self.get_invalid_links()
		self.set_missing_values()

	def validate(self):
		require_features(self, ITEM_FEATURES)
		self.validate_stock_settings()
		self.validate_accounts()
		# HSN/SAC is India's GST code.
		if (
			self.hsn_code
			and company_country() == "India"
			and not re.fullmatch(r"[0-9]{4,8}", str(self.hsn_code))
		):
			frappe.throw(_("HSN/SAC code must contain between 4 and 8 digits."))
		if self.barcode and not re.fullmatch(r"[0-9]{12}", self.barcode):
			frappe.throw(_("Barcode must contain exactly 12 digits."))
		self.validate_unit_conversions()
		self.validate_series()

	def validate_stock_settings(self):
		if self.track_item and self.item_type != "Product":
			frappe.throw(_("Only products can track inventory."))
		if self.has_serial_number and not self.track_item:
			frappe.throw(_("Only items that track inventory can have serial numbers."))
		if self.has_batch and not self.track_item:
			frappe.throw(_("Only items that track inventory can have batches."))

	def validate_unit_conversions(self):
		units = [row.uom for row in self.uom_conversions]
		if len(units) != len(set(units)):
			frappe.throw(_("Each unit can have only one conversion factor."))
		if any(flt(row.conversion_factor) <= 0 for row in self.uom_conversions):
			frappe.throw(_("Conversion factors must be greater than zero."))

	def validate_series(self):
		for flag, fieldname in ITEM_SERIES.values():
			if self.get(flag) and self.get(fieldname):
				message = _("{0} cannot contain the following characters: {1}")
				label = _(self.meta.get_label(fieldname))
				validate_prefix(self.get(fieldname), message.format(label, INVALID_PREFIX_CHARACTERS))

	def validate_accounts(self):
		"""A tracked item is bought into stock received but not billed, a liability."""
		validate_account(self, "income_account", root_types=("Income",))
		validate_account(self, "expense_account", root_types=("Liability" if self.track_item else "Expense",))


def _default_income_account(item_type):
	"""Products sell into Sales and services into Service, when the chart has them."""
	account = "Sales" if item_type == "Product" else "Service"
	return account if frappe.db.exists("Books Account", account) else None


def _default_expense_account(track_item):
	"""Tracked items are bought into stock received but not billed, others into cost of goods sold."""
	if track_item:
		return frappe.db.get_single_value("Books Inventory Settings", "stock_received_but_not_billed")
	return latest_ledger_account("Cost of Goods Sold")


@frappe.whitelist()
def make_sales_invoice(source_name: str):
	return _map_invoice(source_name, "Books Sales Invoice")


@frappe.whitelist()
def make_purchase_invoice(source_name: str):
	return _map_invoice(source_name, "Books Purchase Invoice")


def _map_invoice(item, invoice_doctype):
	"""Return an unsaved invoice for one of the item, priced as a save would price it."""
	return get_mapped_doc(
		"Books Item", item, {"Books Item": {"doctype": invoice_doctype}}, postprocess=_bill_item
	)


def _bill_item(item, invoice):
	invoice.append("items", {"item": item.name, "quantity": 1})
	invoice.fill_mapped_values()
