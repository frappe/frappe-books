# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import getdate, validate_email_address

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
		country: DF.Autocomplete
		currency: DF.Autocomplete
		email: DF.Data
		fiscal_year_end: DF.Date
		fiscal_year_start: DF.Date
		fullname: DF.Data
		logo: DF.AttachImage | None
	# end: auto-generated types

	def validate(self):
		if getdate(self.fiscal_year_end) <= getdate(self.fiscal_year_start):
			frappe.throw(_("Fiscal Year End Date must be after Fiscal Year Start Date."))
		validate_email_address(self.email, throw=True)


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
