from collections import defaultdict
from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.returns import map_return
from frappe_books.tests.accounting import (
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_party,
	make_tax,
)

NO_FOLLOW_UPS = {"make_auto_payment": 0, "make_auto_stock_transfer": 0}


class IntegrationTestInvoicePosting(IntegrationTestCase):
	def setUp(self):
		self.ledgers = {
			"Books Sales Invoice": make_account("Receivable", account_type="Receivable").name,
			"Books Purchase Invoice": make_account(
				"Payable", root_type="Liability", account_type="Payable"
			).name,
		}
		self.income = make_account("Sales", root_type="Income", account_type="Income Account").name
		self.expense = make_account("Purchases", root_type="Expense", account_type="Expense Account").name
		self.tax_account = make_account("Tax", root_type="Liability", account_type="Tax").name
		self.discount = make_account("Discount", root_type="Expense", account_type="Expense Account").name
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.discount)
		self.item = make_item(self.income, self.expense, make_tax(self.tax_account).name).name

	def test_party_and_discount_post_opposite_the_items_and_taxes(self):
		# 2 x 100 less 10% is 180, with 10% tax 198.
		for doctype, is_return, party_side in (
			("Books Sales Invoice", False, "debit"),
			("Books Purchase Invoice", False, "credit"),
			("Books Sales Invoice", True, "credit"),
			("Books Purchase Invoice", True, "debit"),
		):
			with self.subTest(doctype=doctype, is_return=is_return):
				invoice = self.submit_invoice(doctype, is_return)
				item_account = self.expense if doctype == "Books Purchase Invoice" else self.income
				item_side = "credit" if party_side == "debit" else "debit"
				self.assertEqual(
					posted_amounts(invoice),
					{
						(self.ledgers[doctype], party_side): Decimal("198"),
						(self.discount, party_side): Decimal("20"),
						(item_account, item_side): Decimal("200"),
						(self.tax_account, item_side): Decimal("18"),
					},
				)
				outstanding = Decimal(str(invoice.db_get("outstanding_amount")))
				self.assertEqual(outstanding, Decimal("-198" if is_return else "198"))

	def submit_invoice(self, doctype, is_return):
		role = "Supplier" if doctype == "Books Purchase Invoice" else "Customer"
		party = make_party(self.ledgers[doctype], role=role).name
		item_account = self.expense if role == "Supplier" else self.income
		invoice = make_invoice(
			doctype, party, self.ledgers[doctype], self.item, item_account, **NO_FOLLOW_UPS
		).submit()
		if not is_return:
			return invoice
		return map_return(doctype, invoice.name).update(NO_FOLLOW_UPS).insert().submit()


def posted_amounts(invoice):
	"""Sum the invoice's ledger entries by (account, side)."""
	amounts = defaultdict(Decimal)
	for row in ledger_entries(invoice.doctype, invoice.name):
		side = "debit" if row.debit else "credit"
		amounts[row.account, side] += Decimal(str(row.debit or row.credit))
	return dict(amounts)
