# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.model.mapper import get_mapped_doc
from frappe.utils import flt

from frappe_books.accounting.accounts import latest_ledger_account, validate_account
from frappe_books.company import company_value
from frappe_books.permissions import check_preview_permission
from frappe_books.regional import validate_hsn_codes
from frappe_books.series import INVALID_PREFIX_CHARACTERS, ITEM_SERIES, item_series_pattern, validate_pattern
from frappe_books.settings import require_features

# Item fields the Books app offers only while their feature is on.
ITEM_FEATURES = {
	"is_stock_item": "enable_inventory",
	"has_batch_no": "enable_batches",
	"has_serial_no": "enable_serial_number",
	"uoms": "enable_uom_conversions",
	"item_group": "enableitem_group",
}


class BooksItem(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_item_barcode.books_item_barcode import BooksItemBarcode
		from frappe_books.frappe_books.doctype.books_uom_conversion_detail.books_uom_conversion_detail import (
			BooksUOMConversionDetail,
		)

		barcodes: DF.Table[BooksItemBarcode]
		batch_number_series: DF.Data | None
		create_new_batch: DF.Check
		description: DF.Text | None
		expense_account: DF.Link
		gst_hsn_code: DF.Data | None
		has_batch_no: DF.Check
		has_serial_no: DF.Check
		image: DF.AttachImage | None
		income_account: DF.Link
		is_stock_item: DF.Check
		item_code: DF.Data
		item_group: DF.Link | None
		item_name: DF.Data | None
		item_type: DF.Literal["Product", "Service"]
		serial_no_series: DF.Data | None
		standard_rate: DF.Currency
		stock_uom: DF.Link | None
		tax: DF.Link | None
		uoms: DF.Table[BooksUOMConversionDetail]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Item"

	def before_validate(self):
		# Named by its code, an item is titled by it too unless it has a name of its own.
		self.item_name = self.item_name or self.item_code
		for flag, fieldname in ITEM_SERIES.values():
			if self.get(flag):
				self.set(fieldname, item_series_pattern(self.get(fieldname)))
		# A batch series makes the batches its receipts need, as ERPNext's switch says.
		self.create_new_batch = int(bool(self.has_batch_no and self.batch_number_series))
		self.set_missing_values()

	def set_missing_values(self):
		self.income_account = self.income_account or _default_income_account(self.item_type)
		self.expense_account = self.expense_account or _default_expense_account(self.is_stock_item)

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
		validate_hsn_codes([self], "gst_hsn_code")
		self.validate_unit_conversions()
		self.validate_series()

	def validate_stock_settings(self):
		if self.is_stock_item and self.item_type != "Product":
			frappe.throw(_("Only products can track inventory."))
		if self.has_serial_no and not self.is_stock_item:
			frappe.throw(_("Only items that track inventory can have serial numbers."))
		if self.has_batch_no and not self.is_stock_item:
			frappe.throw(_("Only items that track inventory can have batches."))

	def validate_unit_conversions(self):
		units = [row.uom for row in self.uoms]
		if len(units) != len(set(units)):
			frappe.throw(_("Each unit can have only one conversion factor."))
		if any(flt(row.conversion_factor) <= 0 for row in self.uoms):
			frappe.throw(_("Conversion factors must be greater than zero."))

	def validate_series(self):
		for flag, fieldname in ITEM_SERIES.values():
			if self.get(flag) and self.get(fieldname):
				message = _("{0} cannot contain the following characters: {1}")
				label = _(self.meta.get_label(fieldname))
				validate_pattern(self.get(fieldname), message.format(label, INVALID_PREFIX_CHARACTERS))

	def validate_accounts(self):
		"""A tracked item is bought into stock received but not billed, a liability."""
		validate_account(self, "income_account", root_types=("Income",))
		validate_account(
			self, "expense_account", root_types=("Liability" if self.is_stock_item else "Expense",)
		)


def _default_income_account(item_type):
	"""Products sell into Sales and services into Service, when the chart has them."""
	account = "Sales" if item_type == "Product" else "Service"
	return account if frappe.db.exists("Books Account", account) else None


def _default_expense_account(is_stock_item):
	"""Tracked items are bought into stock received but not billed, others into cost of goods sold."""
	if is_stock_item:
		return company_value("stock_received_but_not_billed")
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
