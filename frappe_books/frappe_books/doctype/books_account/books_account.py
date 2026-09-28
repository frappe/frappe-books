# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.utils.nestedset import NestedSet


class BooksAccount(NestedSet):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		account_name: DF.Data
		account_type: DF.Literal[
			"",
			"Accumulated Depreciation",
			"Bank",
			"Cash",
			"Chargeable",
			"Cost of Goods Sold",
			"Depreciation",
			"Equity",
			"Expense Account",
			"Expenses Included In Valuation",
			"Fixed Asset",
			"Income Account",
			"Payable",
			"Receivable",
			"Round Off",
			"Stock",
			"Stock Adjustment",
			"Stock Received But Not Billed",
			"Tax",
			"Temporary",
		]
		is_group: DF.Check
		lft: DF.Int
		old_parent: DF.Link | None
		parent_books_account: DF.Link | None
		rgt: DF.Int
		root_type: DF.Literal["Asset", "Liability", "Equity", "Income", "Expense"]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Account"
	allow_root_deletion = False

	def before_validate(self):
		if not self.parent_books_account:
			return

		parent = frappe.db.get_value(
			"Books Account",
			self.parent_books_account,
			["root_type", "is_group", "account_type"],
			as_dict=True,
		)
		if not parent:
			frappe.throw(_("Parent account {0} does not exist.").format(self.parent_books_account))
		if not parent.is_group:
			frappe.throw(_("Parent account {0} must be a group.").format(self.parent_books_account))

		self.root_type = parent.root_type
		self.account_type = self.account_type or parent.account_type

	def validate(self):
		if not self.is_group and not self.parent_books_account:
			frappe.throw(_("Only group accounts can be root accounts. Select a parent group."))
		self.validate_account_type_change()

	def validate_account_type_change(self):
		"""An account type left empty at insert can be set later, but never changed."""
		previous = self.get_doc_before_save()
		if previous and previous.account_type and previous.account_type != self.account_type:
			frappe.throw(
				_("Value cannot be changed for {0}").format(self.meta.get_label("account_type")),
				frappe.CannotChangeConstantError,
			)
