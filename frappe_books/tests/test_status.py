import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.accounting.returns import map_return
from frappe_books.patches import set_document_status
from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party


class IntegrationTestDocumentStatus(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Status Receivable", account_type="Receivable")
		self.cash = make_account("Status Cash", account_type="Cash")
		income = make_account("Status Income", root_type="Income", account_type="Income Account")
		expense = make_account("Status Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value(
			"Books Accounting Settings", {"discount_account": expense.name, "enable_partial_payment": 1}
		)
		self.party = make_party(self.receivable.name)
		item = make_item(income.name, expense.name)
		self.invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, item.name, income.name
		)

	def test_invoice_status_follows_payments(self):
		self.assertEqual(self.invoice.db_get("status"), "Saved")
		self.invoice.submit()
		self.assertEqual(self.invoice.db_get("status"), "Unpaid")

		self._pay(80)
		self.assertEqual(self.invoice.db_get("status"), "PartlyPaid")
		final = self._pay(100)
		self.assertEqual(self.invoice.db_get("status"), "Paid")
		final.cancel()
		self.assertEqual(self.invoice.db_get("status"), "PartlyPaid")
		self.assertEqual(final.db_get("status"), "Cancelled")

	def test_returns_mark_both_invoices(self):
		self.invoice.submit()
		credit_note = map_return(self.invoice.doctype, self.invoice.name).insert().submit()
		self.assertEqual(credit_note.db_get("status"), "Return")
		self.assertEqual(self.invoice.db_get("status"), "ReturnIssued")

		credit_note.cancel()
		self.assertEqual(credit_note.db_get("status"), "Cancelled")
		self.assertEqual(self.invoice.db_get("status"), "Unpaid")

	def test_patch_stores_existing_statuses(self):
		self.invoice.submit()
		self.invoice.db_set("status", "Saved", update_modified=False)
		set_document_status.execute()
		self.assertEqual(self.invoice.db_get("status"), "Unpaid")

	def _pay(self, amount):
		payment = frappe.get_doc(
			{
				"doctype": "Books Payment",
				"party": self.party.name,
				"date": now_datetime(),
				"payment_type": "Receive",
				"account": self.receivable.name,
				"payment_account": self.cash.name,
				"payment_method": "Cash",
				"amount": amount,
				"payment_references": [
					{
						"reference_type": self.invoice.doctype,
						"reference_name": self.invoice.name,
						"amount": amount,
					}
				],
			}
		).insert()
		payment.submit()
		self.assertEqual(payment.db_get("status"), "Submitted")
		return payment
