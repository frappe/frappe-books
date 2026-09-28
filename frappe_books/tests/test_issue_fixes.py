"""Regression cases from the upstream issue audit."""

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.reports.stock import get_ledger_data
from frappe_books.tests.accounting import (
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_party,
	make_tax,
	set_inventory_accounts,
)


class IntegrationTestIssueFixes(IntegrationTestCase):
	def test_books_translations_are_available_to_the_frappe_catalog(self):
		from frappe.translate import get_translations_from_apps

		french = get_translations_from_apps("fr", apps=["frappe_books"])
		self.assertEqual(french["Cash"], "Espèces")
		self.assertEqual(french["Expenses"], "Dépenses")
		self.assertTrue(all(french.values()))
		self.assertTrue(any("{0}" in source for source in french))

	def test_taxed_purchase_receipt_posts_only_stock_value(self):
		payable = make_account("Receipt Payable", root_type="Liability", account_type="Payable")
		stock = make_account("Receipt Stock", account_type="Stock")
		received = make_account("Receipt Clearing", root_type="Liability")
		income = make_account("Receipt Income", root_type="Income")
		expense = make_account("Receipt Expense", root_type="Expense")
		tax_account = make_account("Recoverable Tax", account_type="Tax")
		tax = make_tax(tax_account.name, rate=18)
		party = make_party(payable.name, role="Supplier")
		item = make_item(income.name, received.name, tax=tax.name, track_item=1)
		set_inventory_accounts(stock.name, received.name, expense.name)
		frappe.db.set_single_value("Books Defaults", "purchase_receipt_location", "Stores")
		invoice = make_invoice(
			"Books Purchase Invoice",
			party.name,
			payable.name,
			item.name,
			received.name,
			make_auto_stock_transfer=1,
		)
		invoice.items[0].update({"quantity": 1, "rate": 100, "item_discount_percent": 0})
		invoice.save().submit()
		receipt = frappe.get_doc("Books Purchase Receipt", invoice.reload().back_reference)
		self.assertEqual(Decimal(str(invoice.grand_total)), Decimal("118"))
		self.assertEqual(Decimal(str(receipt.grand_total)), Decimal("100"))
		entries = ledger_entries(receipt.doctype, receipt.name)
		self.assertEqual(sum(Decimal(str(row.debit)) for row in entries if row.account == stock.name), 100)
		self.assertEqual(sum(Decimal(str(row.debit)) - Decimal(str(row.credit)) for row in entries), 0)
		self.assertEqual(get_ledger_data({"item": item.name})[0]["balance_value"], 100)
		invoice.cancel()
		self.assertFalse(get_ledger_data({"item": item.name}))

	def test_payment_settles_multiple_invoices_and_cancel_restores_each(self):
		receivable = make_account("Multiple Receivable", account_type="Receivable")
		income = make_account("Multiple Income", root_type="Income")
		expense = make_account("Multiple Expense", root_type="Expense")
		cash = make_account("Multiple Cash", account_type="Cash")
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		invoices = []
		for amount in (157.5, 63):
			invoice = make_invoice("Books Sales Invoice", party.name, receivable.name, item.name, income.name)
			invoice.items[0].update({"quantity": 1, "rate": amount, "item_discount_percent": 0})
			invoices.append(invoice.save().submit())
		payment = (
			frappe.get_doc(
				{
					"doctype": "Books Payment",
					"party": party.name,
					"date": frappe.utils.now_datetime(),
					"payment_type": "Receive",
					"account": receivable.name,
					"payment_account": cash.name,
					"amount": 220.5,
					"payment_method": "Cash",
					"payment_references": [
						{
							"reference_type": invoice.doctype,
							"reference_name": invoice.name,
							"amount": invoice.grand_total,
						}
						for invoice in invoices
					],
				}
			)
			.insert()
			.submit()
		)
		for invoice in invoices:
			self.assertEqual(invoice.db_get("outstanding_amount"), 0)
		payment.cancel()
		for invoice in invoices:
			self.assertEqual(invoice.db_get("outstanding_amount"), invoice.grand_total)
