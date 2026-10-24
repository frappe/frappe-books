# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document

from frappe_books.accounting.accounts import validate_payment_account
from frappe_books.company import default_company


class BooksModeofPayment(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		from frappe_books.frappe_books.doctype.books_mode_of_payment_account.books_mode_of_payment_account import (
			BooksModeofPaymentAccount,
		)

		accounts: DF.Table[BooksModeofPaymentAccount]
		mode_of_payment: DF.Data
		requires_clearance_date: DF.Check
		type: DF.Literal["Cash", "Bank", "General", "Phone"]
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Mode of Payment"

	def validate(self):
		self.set_company()
		self.validate_accounts()

	def set_company(self):
		"""Rows belong to the one company."""
		company = default_company()
		for row in self.accounts:
			row.company = row.company or company

	def validate_accounts(self):
		companies = [row.company for row in self.accounts]
		if len(companies) != len(set(companies)):
			frappe.throw(_("Same Company is entered more than once"))
		for row in self.accounts:
			validate_payment_account(row, "default_account", self.type)
