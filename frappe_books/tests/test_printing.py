"""Native Frappe print formats for Books documents."""

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import money_in_words, now_datetime
from frappe.utils.print_utils import get_print

from frappe_books.accounting.money import company_currency
from frappe_books.printing import get_print_totals
from frappe_books.tests.accounting import (
	make_account,
	make_invoice,
	make_item,
	make_party,
	make_tax,
	unique_name,
)


class IntegrationTestPrinting(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Print Receivable", account_type="Receivable")
		self.income = make_account("Print Sales", root_type="Income", account_type="Income Account")
		expense = make_account("Print Expense", root_type="Expense", account_type="Expense Account")
		self.cash = make_account("Print Cash", account_type="Cash")
		frappe.db.set_single_value(
			"Books Accounting Settings", {"discount_account": expense.name, "enable_partial_payment": 1}
		)
		self.party = make_party(self.receivable.name)
		self.tax_account = make_account("Print Tax", root_type="Liability", account_type="Tax")
		self.item = make_item(self.income.name, expense.name, make_tax(self.tax_account.name).name)

	def test_native_print_format_renders_invoice(self):
		invoice = self.make_invoice()

		html = get_print(invoice.doctype, invoice.name, print_format="Frappe Books - Sales Invoice")

		self.assertIn(invoice.name, html)
		self.assertIn(self.party.name, html)
		self.assertIn("Grand Total", html)

	def test_invoice_prints_the_amount_each_payment_allocates_to_it(self):
		invoice, other = self.make_invoice(), self.make_invoice()
		self.make_payment({invoice: 50}).cancel()
		payment = self.make_payment({invoice: 100, other: 98})

		totals = get_print_totals(invoice)

		self.assertEqual(
			totals["payment_details"],
			[{"amount": 100, "amount_paid": 198, "payment_method": "Cash", "outstanding_amount": 98}],
		)
		self.assertEqual(payment.amount_paid, 198)

	def test_invoice_totals_and_amount_in_words(self):
		invoice = self.make_invoice()

		totals = get_print_totals(invoice)

		self.assertEqual(totals["sub_total"], 180)
		self.assertEqual(totals["grand_total_in_words"], money_in_words(198, invoice.currency))

	def test_payment_prints_every_invoice_tax(self):
		payment = self.make_payment({self.make_invoice(): 99})

		totals = get_print_totals(payment)

		self.assertEqual(totals["taxes"], [{"account": self.tax_account.name, "amount": 9}])
		self.assertEqual(totals["sub_total"], 90)
		self.assertEqual(totals["amount_paid_in_words"], money_in_words(99, company_currency()))

	def test_payment_prints_the_realised_tax_it_stored(self):
		paid_tax = make_account("Print Tax Paid", root_type="Liability", account_type="Tax")
		other_tax = make_account("Print Other Tax", root_type="Liability", account_type="Tax")
		tax = frappe.get_doc(
			{
				"doctype": "Books Tax",
				"name": unique_name("Print Cash Tax"),
				"details": [
					{"account": self.tax_account.name, "rate": 10, "payment_account": paid_tax.name},
					{"account": other_tax.name, "rate": 5},
				],
			}
		).insert()
		self.item.db_set("tax", tax.name)
		invoice = self.make_invoice()
		self.make_payment({invoice: Decimal("10.04")})
		# A fresh share of 18 * 10.04 / 207 rounds to 0.87; the second payment realised 0.88.
		payment = self.make_payment({invoice: Decimal("10.04")})

		totals = get_print_totals(payment)

		self.assertEqual([row.amount for row in payment.taxes], [Decimal("0.88")])
		self.assertEqual(
			totals["taxes"],
			[
				{"account": self.tax_account.name, "amount": Decimal("0.88")},
				{"account": other_tax.name, "amount": Decimal("0.44")},
			],
		)
		self.assertEqual(totals["sub_total"], Decimal("8.72"))

	def make_invoice(self):
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			make_auto_payment=0,
		)
		return invoice.submit()

	def make_payment(self, allocations):
		payment = frappe.get_doc(
			{
				"doctype": "Books Payment",
				"party": self.party.name,
				"date": now_datetime(),
				"payment_type": "Receive",
				"account": self.receivable.name,
				"payment_account": self.cash.name,
				"payment_method": "Cash",
				"amount": sum(allocations.values()),
				"payment_references": [
					{"reference_type": invoice.doctype, "reference_name": invoice.name, "amount": amount}
					for invoice, amount in allocations.items()
				],
			}
		).insert()
		return payment.submit()
