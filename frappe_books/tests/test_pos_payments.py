import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_pos_opening_shift.test_books_pos_opening_shift import (
	start_pos_shift,
)
from frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice import make_payment
from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party


class IntegrationTestPosPayments(IntegrationTestCase):
	def setUp(self):
		start_pos_shift()
		self.counter = frappe.db.get_single_value("Books Pos Settings", "cash_account")
		self.receivable = make_account("POS Receivable", account_type="Receivable")
		self.income = make_account("POS Income", root_type="Income", account_type="Income Account")
		expense = make_account("POS Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		self.item = make_item(self.income.name, expense.name)
		self.party = make_party(self.receivable.name)

	def test_payment_for_a_pos_invoice_defaults_to_the_counter(self):
		invoice = self.make_pos_invoice()
		invoice.submit()

		payment = make_payment(invoice.name)

		self.assertEqual(payment.payment_account, self.counter)
		payment.insert().submit()
		self.assertEqual(invoice.reload().outstanding_amount, 0)

	def test_pos_cash_must_go_through_the_counter(self):
		invoice = self.make_pos_invoice()
		invoice.submit()
		payment = make_payment(invoice.name)
		payment.payment_account = make_account("Other Cash", account_type="Cash").name

		self.assertRaisesRegex(frappe.ValidationError, "counter cash account", payment.insert)

	def make_pos_invoice(self, **values):
		return make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			is_pos=1,
			**values,
		)
