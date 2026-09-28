import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.accounting.returns import map_return
from frappe_books.commerce.pos import open_shift_name, transacted_amounts
from frappe_books.frappe_books.doctype.books_pos_closing_shift.test_books_pos_closing_shift import (
	cash_amounts,
	close_shift,
)
from frappe_books.frappe_books.doctype.books_pos_opening_shift.test_books_pos_opening_shift import (
	start_pos_shift,
)
from frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice import (
	make_payment,
	pay_pos_invoice,
)
from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party, unique_name
from frappe_books.ui_api import lifecycle_action
from frappe_books.ui_bridge.database import BooksDatabaseBridge


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

	def test_submit_pays_the_tendered_cash_and_keeps_the_change(self):
		invoice = self.make_pos_invoice(payments=[{"payment_method": "Cash", "amount": 200}])

		invoice.submit()

		payment = frappe.get_doc("Books Payment", counter_payments(invoice)[0])
		self.assertEqual((payment.amount, payment.payment_account), (180, self.counter))
		self.assertEqual((invoice.outstanding_amount, invoice.reload().status), (0, "Paid"))

	def test_interface_submit_pays_the_tendered_rows(self):
		values = {
			"party": self.party.name,
			"account": self.receivable.name,
			"date": now_datetime().isoformat(),
			"isPOS": True,
			"items": [{"item": self.item.name, "rate": 90, "quantity": 2}],
			"payments": [{"paymentMethod": "Cash", "amount": 200}],
		}
		name = BooksDatabaseBridge().insert("SalesInvoice", values)["name"]

		invoice = lifecycle_action("submit", "SalesInvoice", name)

		self.assertEqual((invoice["outstandingAmount"], invoice["status"]), (0, "Paid"))

	def test_failed_payment_fails_the_submit(self):
		invoice = self.make_pos_invoice(payments=[{"payment_method": "Bank", "amount": 180}])

		# Raised inside the submit, so the request rolls the sale back with the payment.
		self.assertRaisesRegex(frappe.ValidationError, "reference ID", invoice.submit)

	def test_non_cash_cannot_pay_more_than_is_due(self):
		invoice = self.make_pos_invoice()
		invoice.append("payments", {"payment_method": "Bank", "amount": 200, "reference_id": "R1"})

		self.assertRaisesRegex(frappe.ValidationError, "cannot exceed the outstanding", invoice.save)

	def test_only_pos_invoices_take_counter_payments(self):
		with self.assertRaisesRegex(frappe.ValidationError, "Only POS invoices"):
			make_invoice(
				"Books Sales Invoice",
				self.party.name,
				self.receivable.name,
				self.item.name,
				self.income.name,
				payments=[{"payment_method": "Cash", "amount": 180}],
			)

	def test_submitted_pos_invoice_is_paid_at_the_counter(self):
		card = make_payment_method("Card", make_account("Card Clearing", account_type="Bank").name)
		invoice = self.make_pos_invoice()
		invoice.submit()

		names = pay_pos_invoice(
			invoice.name, [{"payment_method": card.name, "amount": 180, "reference_id": "R1"}]
		)

		payment = frappe.get_doc("Books Payment", names[0])
		self.assertEqual((payment.payment_account, payment.reference_id), (card.account, "R1"))
		self.assertEqual(invoice.reload().outstanding_amount, 0)

	def test_refund_is_paid_from_the_counter(self):
		invoice = self.make_pos_invoice(payments=[{"payment_method": "Cash", "amount": 180}])
		invoice.submit()
		refund = map_return(invoice.doctype, invoice.name)
		refund.append("payments", {"payment_method": "Cash", "amount": 180})

		refund.insert().submit()

		payment = frappe.get_doc("Books Payment", counter_payments(refund)[0])
		self.assertEqual((payment.payment_type, payment.payment_account), ("Pay", self.counter))
		self.assertEqual(transacted_amounts(invoice.date, now_datetime()), {"Cash": 0})

	def test_closing_shift_reconciles_counter_payments(self):
		shift = frappe.get_doc("Books Pos Opening Shift", open_shift_name())
		self.make_pos_invoice(payments=[{"payment_method": "Cash", "amount": 200}]).submit()

		closing = close_shift(shift, 180)

		self.assertEqual(cash_amounts(closing).difference_amount, 0)
		self.assertEqual(account_balance(self.counter), 0)

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


def counter_payments(invoice):
	return frappe.get_all(
		"Books Payment For",
		filters={"reference_name": invoice.name, "docstatus": 1},
		pluck="parent",
	)


def make_payment_method(label, account):
	return frappe.get_doc(
		{"doctype": "Books Payment Method", "name": unique_name(label), "type": "Bank", "account": account}
	).insert()


def account_balance(account):
	entries = frappe.get_all("Books Ledger Entry", filters={"account": account}, fields=["debit", "credit"])
	return sum(entry.debit - entry.credit for entry in entries)
