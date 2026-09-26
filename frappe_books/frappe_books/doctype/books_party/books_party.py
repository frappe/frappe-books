# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.regional import validate_gstin


class BooksParty(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		address: DF.Link | None
		currency: DF.Link | None
		default_account: DF.Link | None
		email: DF.Data | None
		from_lead: DF.Link | None
		gst_type: DF.Literal["Unregistered", "Registered Regular", "Consumer"]
		gstin: DF.Data | None
		image: DF.AttachImage | None
		loyalty_points: DF.Int
		loyalty_program: DF.Link | None
		outstanding_amount: DF.Currency
		phone: DF.Data | None
		role: DF.Literal["Both", "Supplier", "Customer"]
		tax_id: DF.Data | None
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Party"

	def validate(self):
		if self.gst_type != "Registered Regular":
			self.gstin = None
		elif not self.gstin:
			frappe.throw(_("GSTIN is required for a registered party."))
		else:
			self.gstin = validate_gstin(self.gstin)

	def on_update(self):
		if not self.from_lead:
			return
		lead = frappe.get_doc("Books Lead", self.from_lead)
		if lead.status != "Converted":
			lead.status = "Converted"
			lead.save()
