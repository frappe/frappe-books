# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.tests.accounting import (
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_party,
	unique_name,
)


class IntegrationTestBooksPayment(IntegrationTestCase):
	def test_payment_allocates_and_cancel_restores_invoice(self):
		receivable = make_account("Receivable", account_type="Receivable")
		cash = make_account("Cash", account_type="Cash")
		income = make_account("Income", root_type="Income", account_type="Income Account")
		expense = make_account("Expense", root_type="Expense", account_type="Expense Account")
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		invoice = make_invoice(
			"Books Sales Invoice",
			party.name,
			receivable.name,
			item.name,
			income.name,
		)
		invoice.items[0].item_discount_percent = 0
		invoice.save()
		invoice.submit()

		payment = frappe.get_doc(
			{
				"doctype": "Books Payment",
				"party": party.name,
				"date": now_datetime(),
				"payment_type": "Receive",
				"account": receivable.name,
				"payment_account": cash.name,
				"payment_method": "Cash",
				"amount": invoice.base_grand_total,
				"payment_references": [
					{
						"reference_type": invoice.doctype,
						"reference_name": invoice.name,
						"amount": invoice.base_grand_total,
					}
				],
			}
		).insert()
		payment.submit()

		self.assertEqual(invoice.db_get("outstanding_amount"), 0)
		entries = ledger_entries(payment.doctype, payment.name)
		self.assertEqual(sum(Decimal(str(row.debit or 0)) for row in entries), Decimal("200"))
		self.assertEqual(sum(Decimal(str(row.credit or 0)) for row in entries), Decimal("200"))

		payment.cancel()
		self.assertEqual(Decimal(str(invoice.db_get("outstanding_amount"))), Decimal("200"))

	def test_payment_requires_submitted_invoice_of_same_party(self):
		receivable = make_account("Receivable", account_type="Receivable")
		cash = make_account("Cash", account_type="Cash")
		income = make_account("Income", root_type="Income", account_type="Income Account")
		expense = make_account("Expense", root_type="Expense", account_type="Expense Account")
		party = make_party(receivable.name)
		other_party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		invoice = make_invoice("Books Sales Invoice", party.name, receivable.name, item.name, income.name)
		invoice.items[0].item_discount_percent = 0
		invoice.save()

		with self.assertRaisesRegex(frappe.ValidationError, "Submit invoice .* before allocating a payment"):
			self._payment_for(invoice, party, receivable, cash).insert()

		invoice.submit()
		with self.assertRaisesRegex(frappe.ValidationError, "Invoice .* belongs to .* not to"):
			self._payment_for(invoice, other_party, receivable, cash).insert()
		self._payment_for(invoice, party, receivable, cash).insert()

	def _payment_for(self, invoice, party, account, cash):
		return frappe.get_doc(
			{
				"doctype": "Books Payment",
				"party": party.name,
				"date": now_datetime(),
				"payment_type": "Receive",
				"account": account.name,
				"payment_account": cash.name,
				"payment_method": "Cash",
				"amount": invoice.base_grand_total,
				"payment_references": [
					{
						"reference_type": invoice.doctype,
						"reference_name": invoice.name,
						"amount": invoice.base_grand_total,
					}
				],
			}
		)

	def test_pay_credits_cash_and_debits_payable(self):
		payable = make_account("Payable", root_type="Liability", account_type="Payable")
		cash = make_account("Cash", account_type="Cash")
		income = make_account("Income", root_type="Income", account_type="Income Account")
		expense = make_account("Expense", root_type="Expense", account_type="Expense Account")
		party = make_party(payable.name, role="Supplier")
		item = make_item(income.name, expense.name)
		invoice = make_invoice(
			"Books Purchase Invoice",
			party.name,
			payable.name,
			item.name,
			expense.name,
		)
		invoice.items[0].item_discount_percent = 0
		invoice.save().submit()

		payment = frappe.get_doc(
			{
				"doctype": "Books Payment",
				"party": party.name,
				"date": now_datetime(),
				"payment_type": "Pay",
				"account": payable.name,
				"payment_account": cash.name,
				"payment_method": "Cash",
				"amount": invoice.base_grand_total,
				"payment_references": [
					{
						"reference_type": invoice.doctype,
						"reference_name": invoice.name,
						"amount": invoice.base_grand_total,
					}
				],
			}
		).insert()
		payment.submit()

		entries = ledger_entries(payment.doctype, payment.name)
		payable_entry = next(row for row in entries if row.account == payable.name)
		cash_entry = next(row for row in entries if row.account == cash.name)
		self.assertEqual(Decimal(str(payable_entry.debit)), Decimal("200"))
		self.assertEqual(Decimal(str(cash_entry.credit)), Decimal("200"))


class IntegrationTestPaymentRules(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Rules Receivable", account_type="Receivable")
		self.payable = make_account("Rules Payable", root_type="Liability", account_type="Payable")
		self.cash = make_account("Rules Cash", account_type="Cash")
		self.income = make_account("Rules Income", root_type="Income", account_type="Income Account")
		self.expense = make_account("Rules Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		self.party = make_party(self.receivable.name)
		self.item = make_item(self.income.name, self.expense.name)
		self.invoice = self._submitted_invoice()

	def test_cancelling_a_refund_restores_the_credit_note(self):
		credit_note = frappe.copy_doc(self.invoice)
		credit_note.return_against = self.invoice.name
		credit_note.items[0].quantity = -2
		credit_note.insert().submit()
		refund = self._payment(credit_note, payment_type="Pay").insert()
		refund.submit()
		self.assertEqual(credit_note.db_get("outstanding_amount"), 0)

		refund.cancel()
		self.assertEqual(credit_note.db_get("outstanding_amount"), -180)

	def test_payment_type_must_match_the_invoice(self):
		with self.assertRaisesRegex(frappe.ValidationError, "must be a Receive payment"):
			self._payment(self.invoice, payment_type="Pay").insert()

	def test_same_invoice_cannot_be_allocated_twice(self):
		payment = self._payment(self.invoice)
		payment.append("payment_references", payment.payment_references[0].as_dict(no_default_fields=True))
		payment.amount = 360
		with self.assertRaisesRegex(frappe.ValidationError, "exceeds the invoice outstanding amount"):
			payment.insert()

	def test_accounts_must_differ(self):
		with self.assertRaisesRegex(frappe.ValidationError, "cannot be the same"):
			self._payment(self.invoice, payment_account=self.receivable.name).insert()

	def test_partial_payment_needs_the_setting(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_partial_payment", 0)
		with self.assertRaisesRegex(frappe.ValidationError, "Enable partial payments"):
			self._payment(self.invoice, amount=100).insert()
		frappe.db.set_single_value("Books Accounting Settings", "enable_partial_payment", 1)
		self._payment(self.invoice, amount=100).insert()

	def test_payment_method_requirements(self):
		method = frappe.get_doc(
			{"doctype": "Books Payment Method", "name": unique_name("Cheque"), "type": "Bank"}
		).insert()
		payment = self._payment(self.invoice, payment_method=method.name)
		with self.assertRaisesRegex(frappe.ValidationError, "reference ID"):
			payment.insert()
		payment.reference_id = "CHQ-1"
		payment.insert()

		method.db_set("requires_clearance_date", 1)
		with self.assertRaisesRegex(frappe.ValidationError, "clearance date"):
			payment.save()
		payment.reload()
		payment.clearance_date = frappe.utils.nowdate()
		payment.save()

	def _submitted_invoice(self):
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, self.item.name, self.income.name
		)
		return invoice.submit()

	def _payment(self, invoice, amount=None, **values):
		amount = amount or abs(invoice.grand_total)
		return frappe.get_doc(
			{
				"doctype": "Books Payment",
				"party": invoice.party,
				"date": now_datetime(),
				"payment_type": "Receive",
				"account": self.receivable.name,
				"payment_account": self.cash.name,
				"payment_method": "Cash",
				"amount": amount,
				"payment_references": [
					{"reference_type": invoice.doctype, "reference_name": invoice.name, "amount": amount}
				],
				**values,
			}
		)
