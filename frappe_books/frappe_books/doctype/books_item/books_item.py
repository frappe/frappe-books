# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import re

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import flt

from frappe_books.accounting.accounts import validate_account
from frappe_books.series import ITEM_SERIES


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
		for flag, fieldname, _series_doctype in ITEM_SERIES.values():
			series = (self.get(fieldname) or "").strip()
			if self.get(flag) and series:
				# A dash keeps the series prefix apart from its numbers.
				self.set(fieldname, series if series.endswith("-") else f"{series}-")

	def validate(self):
		self.validate_accounts()
		if self.hsn_code and not re.fullmatch(r"[0-9]{4,8}", str(self.hsn_code)):
			frappe.throw(_("HSN/SAC code must contain between 4 and 8 digits."))
		if self.barcode and not re.fullmatch(r"[0-9]{12}", self.barcode):
			frappe.throw(_("Barcode must contain exactly 12 digits."))
		self.validate_unit_conversions()

	def validate_unit_conversions(self):
		units = [row.uom for row in self.uom_conversions]
		if len(units) != len(set(units)):
			frappe.throw(_("Each unit can have only one conversion factor."))
		if any(flt(row.conversion_factor) <= 0 for row in self.uom_conversions):
			frappe.throw(_("Conversion factors must be greater than zero."))

	def validate_accounts(self):
		"""A tracked item is bought into stock received but not billed, a liability."""
		validate_account(self, "income_account", root_types=("Income",))
		validate_account(self, "expense_account", root_types=("Liability" if self.track_item else "Expense",))

	def on_update(self):
		if self.has_serial_number:
			self._create_series("Books Serial Number Series", self.serial_number_series)
		if self.has_batch:
			self._create_series("Books Batch Series", self.batch_series)

	def _create_series(self, doctype, name):
		name = (name or "").strip()
		if not name or frappe.db.exists(doctype, name):
			return
		frappe.get_doc({"doctype": doctype, "name": name, "start": 1001, "pad_zeros": 4}).insert(
			ignore_if_duplicate=True
		)
