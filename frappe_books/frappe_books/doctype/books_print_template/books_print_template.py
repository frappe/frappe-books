# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.setup import DEFAULT_PRINT_TEMPLATES, standard_print_template_values

TEMPLATE_TYPES = {
	"SalesInvoice",
	"SalesQuote",
	"PurchaseInvoice",
	"JournalEntry",
	"Payment",
	"Shipment",
	"PurchaseReceipt",
	"StockMovement",
}


class BooksPrintTemplate(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		height: DF.Float
		is_custom: DF.Check
		template: DF.Code
		type: DF.Autocomplete
		width: DF.Float
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Print Template"

	@property
	def is_standard(self):
		return self.name in DEFAULT_PRINT_TEMPLATES

	def validate(self):
		self.is_custom = not self.is_standard
		if self.type not in TEMPLATE_TYPES:
			frappe.throw(_("Print templates cannot be made for {0}.").format(self.type))
		if self.is_standard:
			self.validate_standard_template()

	def validate_standard_template(self):
		shipped = standard_print_template_values(self.name)
		if self.type != shipped["type"] or self.template != shipped["template"]:
			frappe.throw(_("Standard print templates cannot be edited. Duplicate the template to change it."))

	def before_rename(self, old_name, new_name, merge=False):
		if {old_name, new_name} & DEFAULT_PRINT_TEMPLATES.keys():
			frappe.throw(_("Standard print templates cannot be renamed."))

	def on_trash(self):
		if self.is_standard:
			frappe.throw(_("Standard print templates cannot be deleted."))
