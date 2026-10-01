# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class BooksGetStarted(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		bill_created: DF.Check
		chart_of_accounts_reviewed: DF.Check
		company_setup: DF.Check
		customer_created: DF.Check
		invoice_created: DF.Check
		onboarding_complete: DF.Check
		opening_balance_checked: DF.Check
		print_setup: DF.Check
		purchase_item_created: DF.Check
		sales_item_created: DF.Check
		supplier_created: DF.Check
		system_setup: DF.Check
		tasks_complete: DF.Check
		taxes_added: DF.Check
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Get Started"

	@property
	def tasks_complete(self):
		"""Whether every task is checked; the stored ones are read first, as they need no query."""
		tasks = [
			df
			for df in self.meta.get("fields", {"fieldtype": "Check"})
			if df.fieldname not in ("onboarding_complete", "tasks_complete")
		]
		tasks.sort(key=lambda df: bool(df.is_virtual))
		return int(
			all(self.get_virtual_field_value(df) if df.is_virtual else self.get(df.fieldname) for df in tasks)
		)

	@property
	def sales_item_created(self):
		return has_record("Books Item", item_usage=["in", ["Sales", "Both"]])

	@property
	def purchase_item_created(self):
		return has_record("Books Item", item_usage=["in", ["Purchases", "Both"]])

	@property
	def customer_created(self):
		return has_record("Books Party", role=["in", ["Customer", "Both"]])

	@property
	def supplier_created(self):
		return has_record("Books Party", role=["in", ["Supplier", "Both"]])

	@property
	def invoice_created(self):
		return has_record("Books Sales Invoice")

	@property
	def bill_created(self):
		return has_record("Books Purchase Invoice")


def has_record(doctype, **filters):
	return int(bool(frappe.db.exists(doctype, filters or {"name": ["is", "set"]})))
