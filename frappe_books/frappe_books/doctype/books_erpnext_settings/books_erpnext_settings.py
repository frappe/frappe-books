# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accessory import erpnext_installed, erpnext_setup_complete


class BooksERPNextSettings(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		accessory_mode: DF.Check
		default_company: DF.Link | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books ERPNext Settings"

	def validate(self):
		if not (self.default_company or self.accessory_mode):
			return

		if not erpnext_installed():
			frappe.throw(_("Install ERPNext to use accessory mode."))

		if self.accessory_mode:
			self.validate_accessory_mode()

	def validate_accessory_mode(self):
		if not erpnext_setup_complete():
			frappe.throw(_("Complete the ERPNext setup wizard, then turn on accessory mode."))

		if not self.default_company:
			frappe.throw(_("Select a default company to turn on accessory mode."))

		before = self.get_doc_before_save()
		if before and before.accessory_mode and before.default_company != self.default_company:
			frappe.throw(_("Turn off accessory mode to change the default company."))

	def on_update(self):
		# The mode comes with the session boot, which Frappe caches per user.
		frappe.cache.delete_key("bootinfo")
