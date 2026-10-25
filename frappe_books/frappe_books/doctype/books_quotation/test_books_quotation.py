# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, make_customer, make_item, make_supplier, unique_name


class IntegrationTestBooksQuotation(IntegrationTestCase):
	def test_quote_calculates_without_posting_ledger(self):
		receivable = make_account("Receivable", account_type="Receivable")
		income = make_account("Income", root_type="Income", account_type="Income Account")
		expense = make_account("Expense", root_type="Expense", account_type="Expense Account")
		party = make_customer(receivable.name)
		item = make_item(income.name, expense.name)
		quote = frappe.get_doc(
			{
				"doctype": "Books Quotation",
				"quotation_to": "Books Customer",
				"party_name": party.name,
				"transaction_date": frappe.utils.nowdate(),
				"items": [{"item_code": item.name, "price_list_rate": 25, "qty": 2}],
			}
		).insert()
		quote.submit()

		self.assertEqual((quote.grand_total, quote.status), (50, "Open"))
		self.assertFalse(
			frappe.db.exists(
				"Books GL Entry",
				{"voucher_type": quote.doctype, "voucher_no": quote.name},
			)
		)

	def test_submitting_a_lead_quote_marks_the_lead(self):
		income = make_account("Income", root_type="Income", account_type="Income Account")
		expense = make_account("Expense", root_type="Expense", account_type="Expense Account")
		item = make_item(income.name, expense.name)
		lead = frappe.get_doc({"doctype": "Books Lead", "lead_name": unique_name("Lead")}).insert()
		frappe.get_doc(
			{
				"doctype": "Books Quotation",
				"quotation_to": "Books Lead",
				"party_name": lead.name,
				"transaction_date": frappe.utils.nowdate(),
				"items": [{"item_code": item.name, "price_list_rate": 25, "qty": 2}],
			}
		).insert().submit()

		self.assertEqual(lead.db_get("status"), "Quotation")

	def test_a_quotation_goes_only_to_a_customer_or_a_lead(self):
		supplier = make_supplier(make_account("Payable", root_type="Liability", account_type="Payable").name)
		quotation = frappe.get_doc(
			{"doctype": "Books Quotation", "quotation_to": "Books Supplier", "party_name": supplier.name}
		)

		self.assertRaisesRegex(frappe.ValidationError, "goes to a customer or a lead", quotation.insert)
