# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, make_item, make_party, unique_name


class IntegrationTestBooksSalesQuote(IntegrationTestCase):
	def test_quote_calculates_without_posting_ledger(self):
		receivable = make_account("Receivable", account_type="Receivable")
		income = make_account("Income", root_type="Income", account_type="Income Account")
		expense = make_account("Expense", root_type="Expense", account_type="Expense Account")
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		quote = frappe.get_doc(
			{
				"doctype": "Books Sales Quote",
				"reference_type": "Books Party",
				"party": party.name,
				"date": frappe.utils.now_datetime(),
				"items": [{"item": item.name, "account": income.name, "rate": 25, "quantity": 2}],
			}
		).insert()
		quote.submit()

		self.assertEqual(quote.grand_total, 50)
		self.assertFalse(
			frappe.db.exists(
				"Books Ledger Entry",
				{"voucher_type": quote.doctype, "voucher_no": quote.name},
			)
		)

	def test_submitting_a_lead_quote_marks_the_lead(self):
		income = make_account("Income", root_type="Income", account_type="Income Account")
		expense = make_account("Expense", root_type="Expense", account_type="Expense Account")
		item = make_item(income.name, expense.name)
		lead = frappe.get_doc({"doctype": "Books Lead", "name": unique_name("Lead")}).insert()
		frappe.get_doc(
			{
				"doctype": "Books Sales Quote",
				"reference_type": "Books Lead",
				"party": lead.name,
				"date": frappe.utils.now_datetime(),
				"items": [{"item": item.name, "account": income.name, "rate": 25, "quantity": 2}],
			}
		).insert().submit()

		self.assertEqual(lead.db_get("status"), "Quotation")
