# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.geo.country_info import get_country_info
from frappe.model.document import Document
from frappe.utils import getdate, momentjs

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
		if not self.time_zone and self.country:
			# Frappe's setup wizard also starts from the country's first time zone.
			time_zones = sorted(get_country_info(self.country).get("timezones") or [])
			self.time_zone = time_zones[0] if time_zones else None
		if self.time_zone:
			# Browsers and Frappe's country data may use an old alias, e.g. Asia/Calcutta.
			self.time_zone = momentjs.data["links"].get(self.time_zone, self.time_zone)

	def validate(self):
		if getdate(self.fiscal_year_end) <= getdate(self.fiscal_year_start):
			frappe.throw(_("Fiscal Year End Date must be after Fiscal Year Start Date."))
		if self.time_zone and self.time_zone not in momentjs.get_all_timezones():
			frappe.throw(_("{0} is not a valid time zone.").format(self.time_zone))


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
