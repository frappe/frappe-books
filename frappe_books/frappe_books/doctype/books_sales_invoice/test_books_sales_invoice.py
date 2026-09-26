# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.setup_service import ensure_currency
from frappe_books.tests.accounting import (
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_party,
	make_tax,
)


class IntegrationTestBooksSalesInvoice(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Receivable", account_type="Receivable")
		self.income = make_account("Sales", root_type="Income", account_type="Income Account")
		self.expense = make_account("Expense", root_type="Expense", account_type="Expense Account")
		self.tax_account = make_account("Sales Tax", root_type="Liability", account_type="Tax")
		self.discount = make_account("Discount", root_type="Expense", account_type="Expense Account")
		self.party = make_party(self.receivable.name)
		self.tax = make_tax(self.tax_account.name)
		self.item = make_item(self.income.name, self.expense.name, self.tax.name)
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.discount.name)

	def test_calculates_and_posts_tax_and_discount(self):
		invoice = self._make_invoice()
		self.assertEqual(Decimal(str(invoice.net_total)), Decimal("200"))
		self.assertEqual(Decimal(str(invoice.taxes[0].amount)), Decimal("18"))
		self.assertEqual(Decimal(str(invoice.grand_total)), Decimal("198"))

		invoice.submit()
		entries = ledger_entries(invoice.doctype, invoice.name)
		self.assertEqual(sum(Decimal(str(row.debit or 0)) for row in entries), Decimal("218"))
		self.assertEqual(sum(Decimal(str(row.credit or 0)) for row in entries), Decimal("218"))
		self.assertEqual(Decimal(str(invoice.db_get("outstanding_amount"))), Decimal("198"))

	def test_cancel_posts_reversals_and_clears_outstanding(self):
		invoice = self._make_invoice()
		invoice.submit()
		invoice.cancel()

		entries = ledger_entries(invoice.doctype, invoice.name)
		self.assertEqual(len(entries), 8)
		self.assertEqual(sum(bool(row.reverts) for row in entries), 4)
		self.assertEqual(invoice.db_get("outstanding_amount"), 0)

	def test_multi_currency_posting_balances_with_round_off(self):
		round_off = make_account("Round Off", root_type="Expense", account_type="Round Off")
		frappe.db.set_single_value("Books Accounting Settings", "round_off_account", round_off.name)
		item = make_item(self.income.name, self.expense.name)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			item.name,
			self.income.name,
			exchange_rate=1.2345,
		)
		invoice.items[0].update({"rate": 10, "quantity": 3, "item_discount_percent": 5})
		invoice.save().submit()

		entries = ledger_entries(invoice.doctype, invoice.name)
		debit = sum(Decimal(str(row.debit or 0)) for row in entries)
		credit = sum(Decimal(str(row.credit or 0)) for row in entries)
		self.assertEqual(debit, credit)
		self.assertEqual(debit, Decimal("37.04"))
		round_off_entry = next(row for row in entries if row.account == round_off.name)
		self.assertEqual(Decimal(str(round_off_entry.debit)), Decimal("0.01"))

	def test_rounds_to_company_currency_precision(self):
		item = make_item(self.income.name, self.expense.name)
		for currency, rate, total in (("KWD", "1.2345", "2.469"), ("JPY", "10.25", "21")):
			with self.subTest(currency=currency):
				frappe.db.set_single_value("Books System Settings", "currency", currency)
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					item.name,
					self.income.name,
				)
				invoice.items[0].update({"rate": Decimal(rate), "quantity": 2, "item_discount_percent": 0})
				invoice.discount_percent = 0
				invoice.save().submit()

				self.assertEqual(Decimal(str(invoice.grand_total)), Decimal(total))
				entries = ledger_entries(invoice.doctype, invoice.name)
				self.assertEqual(sum(Decimal(str(row.debit)) for row in entries), Decimal(total))

	def test_rounds_invoice_amounts_to_invoice_currency(self):
		ensure_currency("USD")
		frappe.db.set_single_value("Books System Settings", "currency", "JPY")
		item = make_item(self.income.name, self.expense.name)
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, item.name, self.income.name
		)
		invoice.update({"currency": "USD", "exchange_rate": 150})
		invoice.items[0].update({"rate": Decimal("10.25"), "quantity": 1, "item_discount_percent": 0})
		invoice.save().submit()

		self.assertEqual(Decimal(str(invoice.grand_total)), Decimal("10.25"))
		self.assertEqual(Decimal(str(invoice.base_grand_total)), Decimal("1538"))
		entries = ledger_entries(invoice.doctype, invoice.name)
		self.assertEqual(sum(Decimal(str(row.debit)) for row in entries), Decimal("1538"))

	def _make_invoice(self):
		return make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
		)
