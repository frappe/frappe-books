import frappe
from frappe.api.v2 import run_doc_method
from frappe.client import get_list
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, now_datetime, set_request

from frappe_books.accounting.returns import map_return
from frappe_books.commerce.pos import open_shift_name, transacted_amounts
from frappe_books.dates import posting_datetime
from frappe_books.frappe_books.doctype.books_pos_closing_entry.test_books_pos_closing_entry import (
	cash_amounts,
	close_shift,
)
from frappe_books.frappe_books.doctype.books_pos_opening_entry.test_books_pos_opening_entry import (
	start_pos_shift,
)
from frappe_books.frappe_books.doctype.books_sales_invoice.books_sales_invoice import (
	make_payment,
	pay_pos_invoice,
)
from frappe_books.tests.accounting import (
	ensure_user,
	make_account,
	make_customer,
	make_invoice,
	make_item,
	make_mode_of_payment,
	set_company_value,
)


class IntegrationTestPosPayments(IntegrationTestCase):
	def setUp(self):
		start_pos_shift()
		self.counter = frappe.db.get_single_value("Books POS Settings", "cash_account")
		self.receivable = make_account("POS Receivable", account_type="Receivable")
		self.income = make_account("POS Income", root_type="Income", account_type="Income Account")
		expense = make_account("POS Expense", root_type="Expense", account_type="Expense Account")
		set_company_value("default_discount_account", expense.name)
		self.item = make_item(self.income.name, expense.name)
		self.party = make_customer(self.receivable.name)

	def test_payment_for_a_pos_invoice_defaults_to_the_counter(self):
		invoice = self.make_pos_invoice()
		invoice.submit()

		payment = make_payment(invoice.name)

		self.assertEqual(payment.paid_to, self.counter)
		payment.insert().submit()
		self.assertEqual(invoice.reload().outstanding_amount, 0)

	def test_pos_cash_must_go_through_the_counter(self):
		invoice = self.make_pos_invoice()
		invoice.submit()
		payment = make_payment(invoice.name)
		payment.paid_to = make_account("Other Cash", account_type="Cash").name

		self.assertRaisesRegex(frappe.ValidationError, "counter cash account", payment.insert)

	def test_submit_pays_the_tendered_cash_and_keeps_the_change(self):
		invoice = self.make_pos_invoice(payments=[{"mode_of_payment": "Cash", "amount": 200}])

		invoice.submit()

		payment = frappe.get_doc("Books Payment Entry", counter_payments(invoice)[0])
		self.assertEqual((payment.paid_amount, payment.paid_to), (180, self.counter))
		self.assertEqual((invoice.outstanding_amount, invoice.reload().status), (0, "Paid"))

	def test_a_cashier_lists_the_payments_a_paid_sale_made(self):
		invoice = self.make_pos_invoice(payments=[{"mode_of_payment": "Cash", "amount": 200}])
		invoice.submit()

		# The query the POS runs after checkout to toast each payment.
		with self.set_user(ensure_user("pos-cashier@example.com", "Books User")):
			rows = get_list(
				"Books Payment Entry Reference",
				parent="Books Payment Entry",
				fields=["parent"],
				filters=[
					["reference_doctype", "=", "Books Sales Invoice"],
					["reference_name", "=", invoice.name],
				],
				order_by="creation asc",
				limit_page_length=0,
			)

		self.assertEqual(len(rows), 1)
		self.assertEqual([row.parent for row in rows], counter_payments(invoice))

	def test_a_submit_of_the_client_copy_pays_the_tendered_rows(self):
		invoice = self.make_pos_invoice(payments=[{"mode_of_payment": "Cash", "amount": 200}])
		set_request(method="POST", path="/api/v2/method/run_doc_method")

		run_doc_method("submit", invoice.as_dict(convert_dates_to_str=True))

		invoice.reload()
		self.assertEqual((invoice.outstanding_amount, invoice.status), (0, "Paid"))

	def test_failed_payment_fails_the_submit(self):
		card = make_mode_of_payment("Card", account=make_account("Card Clearing", account_type="Bank").name)
		# A card payment's account must be a bank or cash account, which this is not.
		card.accounts[0].db_set("default_account", self.income.name)
		invoice = self.make_pos_invoice(
			payments=[{"mode_of_payment": card.name, "amount": 180, "reference_no": "R1"}]
		)

		# Raised inside the submit, so the request rolls the sale back with the payment.
		self.assertRaises(frappe.ValidationError, invoice.submit)

	def test_a_tendered_payment_needs_what_its_method_asks_for(self):
		with self.assertRaisesRegex(frappe.ValidationError, "Please enter a reference number."):
			self.make_pos_invoice(payments=[{"mode_of_payment": "Bank", "amount": 180}])

		card = make_mode_of_payment("Card", account=make_account("Card Clearing", account_type="Bank").name)
		card.db_set("requires_clearance_date", 1)
		with self.assertRaisesRegex(frappe.ValidationError, "Please select a clearance date."):
			self.make_pos_invoice(
				payments=[{"mode_of_payment": card.name, "amount": 180, "reference_no": "R1"}]
			)

	def test_a_tendered_amount_must_be_above_zero(self):
		invoice = self.make_pos_invoice()
		invoice.append("payments", {"mode_of_payment": "Cash", "amount": -5})

		self.assertRaisesRegex(
			frappe.ValidationError, "Please enter an amount greater than zero.", invoice.save
		)

	def test_non_cash_cannot_pay_more_than_is_due(self):
		invoice = self.make_pos_invoice()
		invoice.append("payments", {"mode_of_payment": "Bank", "amount": 200, "reference_no": "R1"})

		self.assertRaisesRegex(frappe.ValidationError, "cannot exceed the outstanding", invoice.save)

	def test_only_pos_invoices_take_counter_payments(self):
		with self.assertRaisesRegex(frappe.ValidationError, "Only POS invoices"):
			make_invoice(
				"Books Sales Invoice",
				self.party.name,
				self.receivable.name,
				self.item.name,
				self.income.name,
				payments=[{"mode_of_payment": "Cash", "amount": 180}],
			)

	def test_submitted_pos_invoice_is_paid_at_the_counter(self):
		card = make_mode_of_payment("Card", account=make_account("Card Clearing", account_type="Bank").name)
		invoice = self.make_pos_invoice()
		invoice.submit()

		names = pay_pos_invoice(
			invoice.name, [{"mode_of_payment": card.name, "amount": 180, "reference_no": "R1"}]
		)

		payment = frappe.get_doc("Books Payment Entry", names[0])
		self.assertEqual((payment.paid_to, payment.reference_no), (card.accounts[0].default_account, "R1"))
		self.assertEqual(invoice.reload().outstanding_amount, 0)

	def test_refund_is_paid_from_the_counter(self):
		invoice = self.make_pos_invoice(payments=[{"mode_of_payment": "Cash", "amount": 180}])
		invoice.submit()
		refund = map_return(invoice.doctype, invoice.name)
		refund.append("payments", {"mode_of_payment": "Cash", "amount": 180})

		refund.insert().submit()

		payment = frappe.get_doc("Books Payment Entry", counter_payments(refund)[0])
		self.assertEqual((payment.payment_type, payment.paid_from), ("Pay", self.counter))
		sold_at = posting_datetime(invoice.posting_date, invoice.posting_time)
		self.assertEqual(transacted_amounts(sold_at, now_datetime()), {"Cash": 0})

	def test_closing_shift_reconciles_counter_payments(self):
		shift = frappe.get_doc("Books POS Opening Entry", open_shift_name())
		self.make_pos_invoice(payments=[{"mode_of_payment": "Cash", "amount": 200}]).submit()

		closing = close_shift(shift, 180)

		self.assertEqual(cash_amounts(closing).difference, 0)
		self.assertEqual(account_balance(self.counter), 0)

	def test_pos_invoice_is_dated_at_checkout(self):
		yesterday = getdate(add_days(now_datetime(), -1))
		held = self.make_pos_invoice(posting_date=yesterday)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			posting_date=yesterday,
			make_auto_payment=0,
		)

		held.submit()
		invoice.submit()

		self.assertEqual(getdate(held.reload().posting_date), getdate(now_datetime()))
		self.assertEqual(getdate(invoice.reload().posting_date), yesterday)

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
		"Books Payment Entry Reference",
		filters={"reference_name": invoice.name, "docstatus": 1},
		pluck="parent",
	)


def account_balance(account):
	entries = frappe.get_all("Books GL Entry", filters={"account": account}, fields=["debit", "credit"])
	return sum(entry.debit - entry.credit for entry in entries)
