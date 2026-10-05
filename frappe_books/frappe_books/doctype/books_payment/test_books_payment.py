# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal

import frappe
from frappe.permissions import add_permission, add_user_permission, update_permission_property
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.accounting.returns import map_return
from frappe_books.tests.accounting import (
	ensure_user,
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_number_series,
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
		with self.assertRaisesRegex(frappe.ValidationError, f"does not belong to party {other_party.name}"):
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
		credit_note = map_return(self.invoice.doctype, self.invoice.name).insert().submit()
		refund = self._payment(credit_note, payment_type="Pay").insert()
		refund.submit()
		self.assertEqual(credit_note.db_get("outstanding_amount"), 0)

		refund.cancel()
		self.assertEqual(credit_note.db_get("outstanding_amount"), -180)

	def test_a_refund_allocates_a_credit_note_as_a_positive_amount(self):
		credit_note = map_return(self.invoice.doctype, self.invoice.name).insert().submit()
		outstanding = credit_note.db_get("outstanding_amount")
		self.assertLess(outstanding, 0)

		refund = self._payment(credit_note, payment_type="Pay")
		refund.payment_references[0].amount = outstanding
		with self.assertRaisesRegex(frappe.ValidationError, "Allocated amounts must be greater than zero"):
			refund.insert()

	def test_number_series_cannot_change_after_insert(self):
		payment = self._payment(self.invoice).insert()
		payment.number_series = make_number_series("Payment")
		self.assertRaises(frappe.CannotChangeConstantError, payment.save)

	def test_payment_needs_read_access_to_the_invoice(self):
		user = ensure_user("books-payment-reader@example.com", "Books User")
		own_party = make_party(self.receivable.name)
		add_user_permission("Books Party", own_party.name, user)
		payment = self._payment(self.invoice, party=own_party.name)
		with self.set_user(user), self.assertRaises(frappe.PermissionError):
			payment.insert()

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

	def test_account_is_the_party_ledger_and_payment_account_is_cash_or_bank(self):
		for values, message in (
			({"account": self.payable.name}, "must be of type Receivable"),
			({"payment_account": self.income.name, "payment_method": "Bank"}, "must be of type Cash or Bank"),
		):
			with self.subTest(values=values), self.assertRaisesRegex(frappe.ValidationError, message):
				self._payment(self.invoice, **values).insert()

	def test_cash_methods_pay_from_cash_accounts(self):
		bank = make_account("Rules Bank", account_type="Bank")
		with self.assertRaisesRegex(frappe.ValidationError, "must be of type Cash, but"):
			self._payment(self.invoice, payment_account=bank.name).insert()

		values = {"payment_account": bank.name, "payment_method": "Bank", "reference_id": "TRF-1"}
		self._payment(self.invoice, **values).insert()

	def test_partial_payment_needs_the_setting(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_partial_payment", 0)
		with self.assertRaisesRegex(frappe.ValidationError, "Enable partial payments"):
			self._payment(self.invoice, amount=100).insert()
		frappe.db.set_single_value("Books Accounting Settings", "enable_partial_payment", 1)
		self._payment(self.invoice, amount=100).insert()

	def test_missing_type_and_accounts_are_filled(self):
		frappe.db.set_value("Books Payment Method", "Cash", "account", self.cash.name)
		receipt = self._payment(self.invoice, payment_type=None, account=None, payment_account=None)
		receipt.insert()
		self.assertEqual(
			(receipt.payment_type, receipt.account, receipt.payment_account),
			("Receive", self.receivable.name, self.cash.name),
		)

		supplier = make_party(self.payable.name, role="Supplier")
		cash = make_account("Rules Petty Cash", account_type="Cash")
		# A payment out uses the method's account too, else the newest cash account.
		for method_account, payment_account in ((self.cash.name, self.cash.name), (None, cash.name)):
			with self.subTest(method_account=method_account):
				frappe.db.set_value("Books Payment Method", "Cash", "account", method_account)
				payment = frappe.get_doc(
					{"doctype": "Books Payment", "party": supplier.name, "date": now_datetime(), "amount": 10}
				).insert()
				self.assertEqual(
					(payment.payment_type, payment.account, payment.payment_account),
					("Pay", self.payable.name, payment_account),
				)

	def test_pos_cash_defaults_to_the_counter_account(self):
		counter = make_account("Rules Counter", account_type="Cash")
		frappe.db.set_single_value("Books Pos Settings", "cash_account", counter.name)
		self.invoice.db_set("is_pos", 1)
		payment = self._payment(self.invoice, payment_account=None)

		payment.set_missing_values()

		self.assertEqual(payment.payment_account, counter.name)

	def test_preview_fills_a_payment_from_its_invoice_without_saving(self):
		frappe.db.set_value("Books Payment Method", "Cash", "account", self.cash.name)
		payment = frappe.new_doc("Books Payment", payment_method="Cash")
		payment.append("payment_references", {"reference_name": self.invoice.name})
		payments = frappe.db.count("Books Payment")

		payment.preview()

		self.assertEqual(
			(payment.party, payment.payment_type, payment.account, payment.payment_account),
			(self.party.name, "Receive", self.receivable.name, self.cash.name),
		)
		row = payment.payment_references[0]
		self.assertEqual((row.reference_type, row.amount), (self.invoice.doctype, 180))
		self.assertEqual((payment.amount, payment.amount_paid), (180, 180))
		self.assertEqual(payment.number_series, "PAY-")
		self.assertEqual(frappe.db.count("Books Payment"), payments)

	def test_preview_settles_the_only_reference_with_the_amount(self):
		payment = self._payment(self.invoice, amount=100)
		payment.payment_references[0].amount = 180
		payment.preview()
		self.assertEqual(payment.payment_references[0].amount, 100)

		payment.append("payment_references", {"reference_name": self.invoice.name, "amount": 180})
		payment.preview()
		self.assertEqual([row.amount for row in payment.payment_references], [100, 180])

	def test_a_supplier_reference_is_a_purchase_invoice(self):
		supplier = make_party(self.payable.name, role="Supplier")
		payment = frappe.new_doc("Books Payment", party=supplier.name)
		payment.append("payment_references", {})
		payment.set_missing_values()
		self.assertEqual(payment.payment_references[0].reference_type, "Books Purchase Invoice")

	def test_a_payment_lists_with_its_invoice_else_its_type(self):
		bank = make_account("Rules Bank", account_type="Bank")
		frappe.db.set_single_value("Books Defaults", "purchase_payment_account", bank.name)
		supplier = make_party(self.payable.name, role="Supplier")
		purchase = make_invoice(
			"Books Purchase Invoice",
			supplier.name,
			self.payable.name,
			self.item.name,
			self.expense.name,
			make_auto_payment=1,
		).submit()
		payment = frappe.db.get_value("Books Payment For", {"reference_name": purchase.name}, "parent")
		self.assertEqual(frappe.db.get_value("Books Payment", payment, "reference_type"), "PurchaseInvoice")

		for party, payment_type, reference_type in (
			(supplier.name, "Pay", "PurchaseInvoice"),
			(self.party.name, "Receive", "SalesInvoice"),
		):
			with self.subTest(payment_type=payment_type):
				payment = frappe.new_doc("Books Payment", party=party, payment_type=payment_type)
				payment.set_missing_values()
				self.assertEqual(payment.reference_type, reference_type)

	def test_a_draft_lists_by_its_current_payment_type(self):
		payment = self._payment(self.invoice, payment_references=[]).insert()
		self.assertEqual(payment.reference_type, "SalesInvoice")

		payment.payment_type = "Pay"
		payment.save()

		self.assertEqual(payment.reference_type, "PurchaseInvoice")

	def test_a_save_allocates_what_the_invoice_owes(self):
		payment = self._payment(self.invoice, amount=None)
		payment.amount = None
		payment.payment_references[0].amount = None
		payment.insert()
		self.assertEqual((payment.amount, payment.payment_references[0].amount), (180, 180))

	def test_preview_needs_the_right_to_make_payments_and_read_their_invoices(self):
		role = frappe.get_doc({"doctype": "Role", "role_name": unique_name("Books Payer")}).insert()
		add_permission("Books Payment", role.name)
		update_permission_property("Books Payment", role.name, 0, "create", 1)
		payment = self._payment(self.invoice)
		with self.set_user(
			ensure_user(f"books-payer-{frappe.generate_hash(length=8)}@example.com", role.name)
		):
			self.assertRaises(frappe.PermissionError, payment.preview)
		with self.set_user(ensure_user("books-payment-preview-stranger@example.com")):
			self.assertRaises(frappe.PermissionError, payment.preview)

	def test_payment_method_requirements(self):
		method = frappe.get_doc(
			{"doctype": "Books Payment Method", "name": unique_name("Cheque"), "type": "Bank"}
		).insert()
		payment = self._payment(self.invoice, payment_method=method.name)
		with self.assertRaisesRegex(frappe.ValidationError, "Please enter a reference number."):
			payment.insert()
		payment.reference_id = "CHQ-1"
		payment.insert()

		method.db_set("requires_clearance_date", 1)
		with self.assertRaisesRegex(frappe.ValidationError, "Please select a clearance date."):
			payment.save()
		payment.reload()
		payment.clearance_date = frappe.utils.nowdate()
		payment.save()

	def test_server_builds_the_realised_tax_rows(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_partial_payment", 1)
		for discount_after_tax, tax_amount in ((0, Decimal("18")), (1, Decimal("20"))):
			with self.subTest(discount_after_tax=discount_after_tax):
				unrealised = make_account("Unrealised Tax", root_type="Liability", account_type="Tax")
				realised = make_account("Realised Tax", root_type="Liability", account_type="Tax")
				invoice = self._taxed_invoice(unrealised, realised, discount_after_tax)

				first = self._payment(invoice, amount=invoice.grand_total / 2)
				first.append(
					"taxes",
					{"account": self.cash.name, "from_account": self.income.name, "rate": 1, "amount": 1},
				)
				first.insert().submit()
				self._payment(invoice, amount=invoice.grand_total / 2).insert().submit()

				self.assertEqual(
					[(row.account, row.from_account) for row in first.taxes],
					[(realised.name, unrealised.name)],
				)
				self.assertEqual(Decimal(str(first.taxes[0].amount)), tax_amount / 2)
				self.assertEqual(self._balance(realised), tax_amount)
				self.assertEqual(self._balance(unrealised), 0)

	def _taxed_invoice(self, unrealised, realised, discount_after_tax):
		tax = frappe.get_doc(
			{
				"doctype": "Books Tax",
				"name": unique_name("Deferred Tax"),
				"details": [{"account": unrealised.name, "payment_account": realised.name, "rate": 10}],
			}
		).insert()
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			discount_after_tax=discount_after_tax,
		)
		invoice.items[0].tax = tax.name
		return invoice.save().submit()

	def _balance(self, account):
		entries = frappe.get_all(
			"Books Ledger Entry", filters={"account": account.name}, fields=["debit", "credit"]
		)
		return sum(Decimal(str(row.credit)) - Decimal(str(row.debit)) for row in entries)

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
