import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import nowdate

from frappe_books.accounting.returns import map_return
from frappe_books.tests.accounting import (
	make_account,
	make_customer,
	make_invoice,
	make_item,
	set_company_value,
)

STATUS_DOCTYPES = (
	"Books Sales Invoice",
	"Books Purchase Invoice",
	"Books Delivery Note",
	"Books Purchase Receipt",
	"Books Quotation",
	"Books Payment Entry",
	"Books Lead",
	"Books Serial No",
)


class IntegrationTestDocumentStatus(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Status Receivable", account_type="Receivable")
		self.cash = make_account("Status Cash", account_type="Cash")
		income = make_account("Status Income", root_type="Income", account_type="Income Account")
		expense = make_account("Status Expense", root_type="Expense", account_type="Expense Account")
		set_company_value("default_discount_account", expense.name)
		frappe.db.set_single_value("Books Accounting Settings", "enable_partial_payment", 1)
		self.party = make_customer(self.receivable.name)
		item = make_item(income.name, expense.name)
		self.invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, item.name, income.name
		)

	def test_invoice_status_follows_payments(self):
		self.assertEqual(self.invoice.db_get("status"), "Draft")
		self.invoice.submit()
		self.assertEqual(self.invoice.db_get("status"), "Unpaid")

		self._pay(80)
		self.assertEqual(self.invoice.db_get("status"), "Partly Paid")
		final = self._pay(100)
		self.assertEqual(self.invoice.db_get("status"), "Paid")
		final.cancel()
		self.assertEqual(self.invoice.db_get("status"), "Partly Paid")
		self.assertEqual(final.db_get("status"), "Cancelled")

	def test_returns_mark_both_invoices(self):
		self.invoice.submit()
		credit_note = map_return(self.invoice.doctype, self.invoice.name).insert().submit()
		self.assertEqual(credit_note.db_get("status"), "Return")
		self.assertEqual(self.invoice.db_get("status"), "Credit Note Issued")

		credit_note.cancel()
		self.assertEqual(credit_note.db_get("status"), "Cancelled")
		self.assertEqual(self.invoice.db_get("status"), "Unpaid")

	def test_every_status_has_a_state_colour(self):
		for doctype in STATUS_DOCTYPES:
			meta = frappe.get_meta(doctype)
			with self.subTest(doctype=doctype):
				options = meta.get_field("status").options.split("\n")
				self.assertEqual(
					[state.title for state in meta.states], [option for option in options if option]
				)

	def _pay(self, amount):
		payment = frappe.get_doc(
			{
				"doctype": "Books Payment Entry",
				"party_type": self.party.doctype,
				"party": self.party.name,
				"posting_date": nowdate(),
				"payment_type": "Receive",
				"paid_from": self.receivable.name,
				"paid_to": self.cash.name,
				"mode_of_payment": "Cash",
				"paid_amount": amount,
				"references": [
					{
						"reference_doctype": self.invoice.doctype,
						"reference_name": self.invoice.name,
						"allocated_amount": amount,
					}
				],
			}
		).insert()
		payment.submit()
		self.assertEqual(payment.db_get("status"), "Submitted")
		return payment
