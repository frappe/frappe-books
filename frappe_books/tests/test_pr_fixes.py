"""Regression coverage for the functional PR replacements."""

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import nowdate

from frappe_books.currency import currency_precision
from frappe_books.setup_service import complete_site_setup
from frappe_books.tests.accounting import (
	ledger_entries,
	make_account,
	make_customer,
	make_invoice,
	make_item,
	make_supplier,
	restored_company_settings,
	set_company_value,
)


class IntegrationTestPrFixes(IntegrationTestCase):
	def setUp(self):
		frappe.db.set_single_value("System Settings", "currency", "INR")
		self.cash = make_account("PR Cash", account_type="Cash")
		self.income = make_account("PR Income", root_type="Income")
		self.expense = make_account("PR Expense", root_type="Expense")
		self.writeoff = make_account("PR Writeoff", root_type="Expense")
		set_company_value("write_off_account", self.writeoff.name)
		set_company_value("default_discount_account", self.expense.name)
		self.item = make_item(self.income.name, self.expense.name)

	def test_writeoff_settles_invoice_and_cancel_restores_it(self):
		for payment_type in ("Receive", "Pay"):
			for writeoff in (0, Decimal("2.50")):
				with self.subTest(payment_type=payment_type, writeoff=writeoff):
					invoice, account, party = self.make_invoice(payment_type)
					invoice.submit()
					sign = 1 if payment_type == "Receive" else -1
					# A receipt comes from the party's ledger into cash, a payment the other way.
					paid_from, paid_to = account.name, self.cash.name
					if payment_type == "Pay":
						paid_from, paid_to = paid_to, paid_from
					payment = (
						frappe.get_doc(
							{
								"doctype": "Books Payment Entry",
								"party_type": party.doctype,
								"party": party.name,
								"posting_date": nowdate(),
								"payment_type": payment_type,
								"paid_from": paid_from,
								"paid_to": paid_to,
								"paid_amount": Decimal("157.50") - writeoff,
								# The write-off has no account, so it takes the company's.
								"deductions": [{"amount": sign * writeoff}] if writeoff else [],
								"mode_of_payment": "Cash",
								"references": [
									{
										"reference_doctype": invoice.doctype,
										"reference_name": invoice.name,
										"allocated_amount": 157.5,
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
			# 50 off the row is 50/3 off each of its three.
			row.update(
				{"price_list_rate": 100, "qty": 3, "discount_percentage": 0, "discount_amount": 50 / 3}
			)
			invoice.save().submit()
			self.assertEqual(Decimal(str(row.amount)), Decimal("250"))
			self.assertEqual(Decimal(str(invoice.grand_total)), Decimal("250"))
			entries = ledger_entries(invoice.doctype, invoice.name)
			debit = sum(Decimal(str(row.debit or 0)) for row in entries)
			credit = sum(Decimal(str(row.credit or 0)) for row in entries)
			self.assertEqual(debit, credit)
			self.assertEqual(debit, Decimal("300"))

	def test_manual_zero_rate_survives_save(self):
		invoice, _, _ = self.make_invoice("Receive")
		invoice.items[0].update({"price_list_rate": 0, "is_manual_rate": 1})
		invoice.save()
		invoice.reload()
		self.assertEqual(invoice.items[0].price_list_rate, 0)
		self.assertEqual(invoice.items[0].is_manual_rate, 1)

	def test_flat_discount_with_tax_matches_before_and_after_tax_postings(self):
		tax = frappe.get_doc(
			{
				"doctype": "Books Item Tax Template",
				"title": "PR Tax " + frappe.generate_hash(length=8),
				"taxes": [{"tax_type": self.income.name, "tax_rate": 10}],
			}
		).insert()
		for after_tax, total, taxed_total in ((0, 275, 275), (1, 280, 330)):
			invoice, _, _ = self.make_invoice("Receive")
			invoice.discount_after_tax = after_tax
			invoice.items[0].update(
				{
					"price_list_rate": 100,
					"qty": 3,
					"item_tax_template": tax.name,
					"discount_percentage": 0,
					"discount_amount": 50 / 3,
				}
			)
			invoice.save().submit()
			self.assertEqual(invoice.grand_total, total)
			row_tax = sum(detail.amount for detail in invoice.item_wise_tax_details)
			self.assertEqual(invoice.items[0].amount + row_tax, taxed_total)
			entries = ledger_entries(invoice.doctype, invoice.name)
			self.assertEqual(
				sum(Decimal(str(row.debit or 0)) - Decimal(str(row.credit or 0)) for row in entries), 0
			)

	def test_currency_precision_follows_currency_not_country(self):
		for country, currency, precision in (("Japan", "USD", 2), ("India", "JPY", 0), ("Japan", "JPY", 0)):
			with restored_company_settings():
				complete_site_setup(frappe._dict(country=country, currency=currency))
				self.assertEqual(frappe.get_single("Books System Settings").currency_precision, precision)
		self.assertEqual(currency_precision("JPY"), 0)

	def make_invoice(self, payment_type):
		is_sales = payment_type == "Receive"
		account = make_account(
			"PR Party",
			root_type="Asset" if is_sales else "Liability",
			account_type="Receivable" if is_sales else "Payable",
		)
		party = (make_customer if is_sales else make_supplier)(account.name)
		invoice = make_invoice(
			"Books Sales Invoice" if is_sales else "Books Purchase Invoice",
			party.name,
			account.name,
			self.item.name,
			self.income.name if is_sales else self.expense.name,
		)
		invoice.items[0].update(
			{"price_list_rate": 157.5, "qty": 1, "discount_percentage": 0, "discount_amount": 0}
		)
		invoice.save()
		return invoice, account, party
