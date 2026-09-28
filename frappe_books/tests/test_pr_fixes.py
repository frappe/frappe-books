"""Regression coverage for the functional PR replacements."""

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.currency import currency_precision
from frappe_books.setup_service import _update_books_system_settings
from frappe_books.tests.accounting import ledger_entries, make_account, make_invoice, make_item, make_party


class IntegrationTestPrFixes(IntegrationTestCase):
	def setUp(self):
		frappe.db.set_single_value("System Settings", "currency", "INR")
		self.cash = make_account("PR Cash", account_type="Cash")
		self.income = make_account("PR Income", root_type="Income")
		self.expense = make_account("PR Expense", root_type="Expense")
		self.writeoff = make_account("PR Writeoff", root_type="Expense")
		frappe.db.set_single_value("Books Accounting Settings", "write_off_account", self.writeoff.name)
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		self.item = make_item(self.income.name, self.expense.name)

	def test_writeoff_settles_invoice_and_cancel_restores_it(self):
		for payment_type in ("Receive", "Pay"):
			for writeoff in (0, Decimal("2.50")):
				with self.subTest(payment_type=payment_type, writeoff=writeoff):
					invoice, account, party = self.make_invoice(payment_type)
					invoice.submit()
					payment = (
						frappe.get_doc(
							{
								"doctype": "Books Payment",
								"party": party.name,
								"date": now_datetime(),
								"payment_type": payment_type,
								"account": account.name,
								"payment_account": self.cash.name,
								"amount": 157.5,
								"writeoff": writeoff,
								"payment_method": "Cash",
								"payment_references": [
									{
										"reference_type": invoice.doctype,
										"reference_name": invoice.name,
										"amount": 157.5,
									}
								],
							}
						)
						.insert()
						.submit()
					)
					entries = ledger_entries(payment.doctype, payment.name)
					balances = {
						row.account: Decimal(str(row.debit or 0)) - Decimal(str(row.credit or 0))
						for row in entries
					}
					sign = 1 if payment_type == "Receive" else -1
					self.assertEqual(balances[self.cash.name], sign * (Decimal("157.50") - writeoff))
					self.assertEqual(balances[account.name], -sign * Decimal("157.50"))
					self.assertEqual(balances.get(self.writeoff.name, 0), sign * writeoff)
					self.assertEqual(sum(balances.values()), 0)
					self.assertEqual(invoice.db_get("outstanding_amount"), 0)
					payment.cancel()
					self.assertEqual(Decimal(str(invoice.db_get("outstanding_amount"))), Decimal("157.50"))

	def test_line_discount_matches_posted_ledger(self):
		for payment_type in ("Receive", "Pay"):
			invoice, _, _ = self.make_invoice(payment_type)
			row = invoice.items[0]
			row.update(
				{"rate": 100, "quantity": 3, "set_item_discount_amount": 1, "item_discount_amount": 50}
			)
			invoice.save().submit()
			self.assertEqual(Decimal(str(row.item_discounted_total)), Decimal("250"))
			self.assertEqual(Decimal(str(invoice.grand_total)), Decimal("250"))
			entries = ledger_entries(invoice.doctype, invoice.name)
			debit = sum(Decimal(str(row.debit or 0)) for row in entries)
			credit = sum(Decimal(str(row.credit or 0)) for row in entries)
			self.assertEqual(debit, credit)
			self.assertEqual(debit, Decimal("300"))

	def test_manual_zero_rate_survives_save(self):
		invoice, _, _ = self.make_invoice("Receive")
		invoice.items[0].update({"rate": 0, "is_manual_rate": 1})
		invoice.save()
		invoice.reload()
		self.assertEqual(invoice.items[0].rate, 0)
		self.assertEqual(invoice.items[0].is_manual_rate, 1)

	def test_flat_discount_with_tax_matches_before_and_after_tax_postings(self):
		tax = frappe.get_doc(
			{
				"doctype": "Books Tax",
				"name": "PR Tax " + frappe.generate_hash(length=8),
				"details": [{"account": self.income.name, "rate": 10}],
			}
		).insert()
		for after_tax, total, taxed_total in ((0, 275, 275), (1, 280, 330)):
			invoice, _, _ = self.make_invoice("Receive")
			invoice.discount_after_tax = after_tax
			invoice.items[0].update(
				{
					"rate": 100,
					"quantity": 3,
					"tax": tax.name,
					"set_item_discount_amount": 1,
					"item_discount_amount": 50,
				}
			)
			invoice.save().submit()
			self.assertEqual(invoice.grand_total, total)
			self.assertEqual(invoice.items[0].item_taxed_total, taxed_total)
			entries = ledger_entries(invoice.doctype, invoice.name)
			self.assertEqual(
				sum(Decimal(str(row.debit or 0)) - Decimal(str(row.credit or 0)) for row in entries), 0
			)

	def test_currency_precision_follows_currency_not_country(self):
		for country, currency, precision in (("Japan", "USD", 2), ("India", "JPY", 0), ("Japan", "JPY", 0)):
			_update_books_system_settings(frappe._dict(country=country, currency=currency))
			self.assertEqual(
				frappe.db.get_single_value("Books System Settings", "display_precision"), precision
			)
		self.assertEqual(currency_precision("JPY"), 0)

	def make_invoice(self, payment_type):
		is_sales = payment_type == "Receive"
		account = make_account(
			"PR Party",
			root_type="Asset" if is_sales else "Liability",
			account_type="Receivable" if is_sales else "Payable",
		)
		party = make_party(account.name, role="Customer" if is_sales else "Supplier")
		invoice = make_invoice(
			"Books Sales Invoice" if is_sales else "Books Purchase Invoice",
			party.name,
			account.name,
			self.item.name,
			self.income.name if is_sales else self.expense.name,
		)
		invoice.items[0].update({"rate": 157.5, "quantity": 1, "item_discount_percent": 0})
		invoice.save()
		return invoice, account, party
