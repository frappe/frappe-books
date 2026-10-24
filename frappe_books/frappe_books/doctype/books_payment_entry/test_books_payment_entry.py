# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal

import frappe
from frappe.permissions import add_permission, add_user_permission, update_permission_property
from frappe.tests import IntegrationTestCase
from frappe.utils import nowdate

from frappe_books.accounting.returns import map_return
from frappe_books.tests.accounting import (
	ensure_user,
	ledger_entries,
	make_account,
	make_customer,
	make_invoice,
	make_item,
	make_mode_of_payment,
	make_number_series,
	make_supplier,
	set_company_value,
	set_mode_of_payment_account,
	unique_name,
)


class IntegrationTestBooksPaymentEntry(IntegrationTestCase):
	def test_payment_allocates_and_cancel_restores_invoice(self):
		receivable = make_account("Receivable", account_type="Receivable")
		cash = make_account("Cash", account_type="Cash")
		income = make_account("Income", root_type="Income", account_type="Income Account")
		expense = make_account("Expense", root_type="Expense", account_type="Expense Account")
		party = make_customer(receivable.name)
		item = make_item(income.name, expense.name)
		invoice = make_invoice(
			"Books Sales Invoice",
			party.name,
			receivable.name,
			item.name,
			income.name,
		)
		invoice.items[0].discount_percentage = 0
		invoice.save()
		invoice.submit()

		payment = frappe.get_doc(
			{
				"doctype": "Books Payment Entry",
				"party_type": party.doctype,
				"party": party.name,
				"posting_date": nowdate(),
				"payment_type": "Receive",
				"paid_from": receivable.name,
				"paid_to": cash.name,
				"mode_of_payment": "Cash",
				"paid_amount": invoice.base_grand_total,
				"references": [
					{
						"reference_doctype": invoice.doctype,
						"reference_name": invoice.name,
						"allocated_amount": invoice.base_grand_total,
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
		party = make_customer(receivable.name)
		other_party = make_customer(receivable.name)
		item = make_item(income.name, expense.name)
		invoice = make_invoice("Books Sales Invoice", party.name, receivable.name, item.name, income.name)
		invoice.items[0].discount_percentage = 0
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
				"doctype": "Books Payment Entry",
				"party_type": party.doctype,
				"party": party.name,
				"posting_date": nowdate(),
				"payment_type": "Receive",
				"paid_from": account.name,
				"paid_to": cash.name,
				"mode_of_payment": "Cash",
				"paid_amount": invoice.base_grand_total,
				"references": [
					{
						"reference_doctype": invoice.doctype,
						"reference_name": invoice.name,
						"allocated_amount": invoice.base_grand_total,
					}
				],
			}
		)

	def test_pay_credits_cash_and_debits_payable(self):
		payable = make_account("Payable", root_type="Liability", account_type="Payable")
		cash = make_account("Cash", account_type="Cash")
		income = make_account("Income", root_type="Income", account_type="Income Account")
		expense = make_account("Expense", root_type="Expense", account_type="Expense Account")
		party = make_supplier(payable.name)
		item = make_item(income.name, expense.name)
		invoice = make_invoice(
			"Books Purchase Invoice",
			party.name,
			payable.name,
			item.name,
			expense.name,
		)
		invoice.items[0].discount_percentage = 0
		invoice.save().submit()

		payment = frappe.get_doc(
			{
				"doctype": "Books Payment Entry",
				"party_type": party.doctype,
				"party": party.name,
				"posting_date": nowdate(),
				"payment_type": "Pay",
				"paid_from": cash.name,
				"paid_to": payable.name,
				"mode_of_payment": "Cash",
				"paid_amount": invoice.base_grand_total,
				"references": [
					{
						"reference_doctype": invoice.doctype,
						"reference_name": invoice.name,
						"allocated_amount": invoice.base_grand_total,
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
		set_company_value("default_discount_account", self.expense.name)
		self.party = make_customer(self.receivable.name)
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
		refund.references[0].allocated_amount = outstanding
		with self.assertRaisesRegex(frappe.ValidationError, "Allocated amounts must be greater than zero"):
			refund.insert()

	def test_number_series_cannot_change_after_insert(self):
		payment = self._payment(self.invoice).insert()
		payment.naming_series = make_number_series("PaymentEntry")
		self.assertRaises(frappe.CannotChangeConstantError, payment.save)

	def test_payment_needs_read_access_to_the_invoice(self):
		user = ensure_user("books-payment-reader@example.com", "Books User")
		own_party = make_customer(self.receivable.name)
		add_user_permission("Books Customer", own_party.name, user)
		payment = self._payment(self.invoice, party=own_party.name)
		with self.set_user(user), self.assertRaises(frappe.PermissionError):
			payment.insert()

	def test_payment_type_must_match_the_invoice(self):
		with self.assertRaisesRegex(frappe.ValidationError, "must be a Receive payment"):
			self._payment(self.invoice, payment_type="Pay").insert()

	def test_same_invoice_cannot_be_allocated_twice(self):
		payment = self._payment(self.invoice)
		payment.append("references", payment.references[0].as_dict(no_default_fields=True))
		payment.paid_amount = 360
		with self.assertRaisesRegex(frappe.ValidationError, "exceeds the invoice outstanding amount"):
			payment.insert()

	def test_accounts_must_differ(self):
		with self.assertRaisesRegex(frappe.ValidationError, "cannot be the same"):
			self._payment(self.invoice, paid_to=self.receivable.name).insert()

	def test_account_is_the_party_ledger_and_payment_account_is_cash_or_bank(self):
		for values, message in (
			({"paid_from": self.payable.name}, "must be of type Receivable"),
			({"paid_to": self.income.name, "mode_of_payment": "Bank"}, "must be of type Cash or Bank"),
		):
			with self.subTest(values=values), self.assertRaisesRegex(frappe.ValidationError, message):
				self._payment(self.invoice, **values).insert()

	def test_cash_methods_pay_from_cash_accounts(self):
		bank = make_account("Rules Bank", account_type="Bank")
		with self.assertRaisesRegex(frappe.ValidationError, "must be of type Cash, but"):
			self._payment(self.invoice, paid_to=bank.name).insert()

		values = {"paid_to": bank.name, "mode_of_payment": "Bank", "reference_no": "TRF-1"}
		self._payment(self.invoice, **values).insert()

	def test_partial_payment_needs_the_setting(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_partial_payment", 0)
		with self.assertRaisesRegex(frappe.ValidationError, "Enable partial payments"):
			self._payment(self.invoice, paid_amount=100).insert()
		frappe.db.set_single_value("Books Accounting Settings", "enable_partial_payment", 1)
		self._payment(self.invoice, paid_amount=100).insert()

	def test_missing_type_and_accounts_are_filled(self):
		set_mode_of_payment_account("Cash", self.cash.name)
		receipt = self._payment(self.invoice, payment_type=None, paid_from=None, paid_to=None)
		receipt.insert()
		self.assertEqual(
			(receipt.payment_type, receipt.paid_from, receipt.paid_to),
			("Receive", self.receivable.name, self.cash.name),
		)

		supplier = make_supplier(self.payable.name)
		cash = make_account("Rules Petty Cash", account_type="Cash")
		# A payment out uses the method's account too, else the newest cash account.
		for method_account, paid_from in ((self.cash.name, self.cash.name), (None, cash.name)):
			with self.subTest(method_account=method_account):
				set_mode_of_payment_account("Cash", method_account)
				payment = frappe.get_doc(
					{
						"doctype": "Books Payment Entry",
						"party_type": supplier.doctype,
						"party": supplier.name,
						"posting_date": nowdate(),
						"paid_amount": 10,
					}
				).insert()
				self.assertEqual(
					(payment.payment_type, payment.paid_from, payment.paid_to),
					("Pay", paid_from, self.payable.name),
				)

	def test_pos_cash_defaults_to_the_counter_account(self):
		counter = make_account("Rules Counter", account_type="Cash")
		frappe.db.set_single_value("Books POS Settings", "cash_account", counter.name)
		self.invoice.db_set("is_pos", 1)
		payment = self._payment(self.invoice, paid_to=None)

		payment.set_missing_values()

		self.assertEqual(payment.paid_to, counter.name)

	def test_preview_fills_a_payment_from_its_invoice_without_saving(self):
		set_mode_of_payment_account("Cash", self.cash.name)
		payment = frappe.new_doc("Books Payment Entry", mode_of_payment="Cash")
		payment.append("references", {"reference_name": self.invoice.name})
		payments = frappe.db.count("Books Payment Entry")

		payment.preview()

		self.assertEqual(
			(payment.party, payment.payment_type, payment.paid_from, payment.paid_to),
			(self.party.name, "Receive", self.receivable.name, self.cash.name),
		)
		row = payment.references[0]
		self.assertEqual((row.reference_doctype, row.allocated_amount), (self.invoice.doctype, 180))
		self.assertEqual((payment.paid_amount, payment.received_amount), (180, 180))
		self.assertEqual(payment.naming_series, "PAY-")
		self.assertEqual(frappe.db.count("Books Payment Entry"), payments)

	def test_preview_settles_the_only_reference_with_the_amount(self):
		payment = self._payment(self.invoice, paid_amount=100)
		payment.references[0].allocated_amount = 180
		payment.preview()
		self.assertEqual(payment.references[0].allocated_amount, 100)

		payment.append("references", {"reference_name": self.invoice.name, "allocated_amount": 180})
		payment.preview()
		self.assertEqual([row.allocated_amount for row in payment.references], [100, 180])

	def test_a_payment_party_is_a_customer_or_a_supplier(self):
		lead = frappe.get_doc({"doctype": "Books Lead", "lead_name": unique_name("Lead")}).insert()
		payment = self._payment(self.invoice, party_type="Books Lead", party=lead.name)

		self.assertRaisesRegex(frappe.ValidationError, "must be Customer or Supplier", payment.insert)

	def test_a_supplier_reference_is_a_purchase_invoice(self):
		supplier = make_supplier(self.payable.name)
		payment = frappe.new_doc("Books Payment Entry", party_type=supplier.doctype, party=supplier.name)
		payment.append("references", {})
		payment.set_missing_values()
		self.assertEqual(payment.references[0].reference_doctype, "Books Purchase Invoice")

	def test_a_payment_lists_with_its_party_type(self):
		bank = make_account("Rules Bank", account_type="Bank")
		frappe.db.set_single_value("Books Defaults", "purchase_payment_account", bank.name)
		supplier = make_supplier(self.payable.name)
		purchase = make_invoice(
			"Books Purchase Invoice",
			supplier.name,
			self.payable.name,
			self.item.name,
			self.expense.name,
			make_auto_payment=1,
		).submit()
		payment = frappe.db.get_value(
			"Books Payment Entry Reference", {"reference_name": purchase.name}, "parent"
		)
		self.assertEqual(frappe.db.get_value("Books Payment Entry", payment, "party_type"), "Books Supplier")

		for party, payment_type, party_type in (
			(supplier.name, "Pay", "Books Supplier"),
			(self.party.name, "Receive", "Books Customer"),
		):
			with self.subTest(payment_type=payment_type):
				payment = frappe.new_doc("Books Payment Entry", party=party, payment_type=payment_type)
				payment.set_missing_values()
				self.assertEqual(payment.party_type, party_type)

	def test_a_draft_refund_still_lists_with_its_customer(self):
		payment = self._payment(self.invoice, party_type=None, references=[]).insert()
		self.assertEqual(payment.party_type, "Books Customer")

		payment.update({"payment_type": "Pay", "paid_from": self.cash.name, "paid_to": self.receivable.name})
		payment.save()

		self.assertEqual(payment.party_type, "Books Customer")

	def test_a_save_allocates_what_the_invoice_owes(self):
		payment = self._payment(self.invoice)
		payment.paid_amount = None
		payment.references[0].allocated_amount = None
		payment.insert()
		self.assertEqual((payment.paid_amount, payment.references[0].allocated_amount), (180, 180))

	def test_preview_needs_the_right_to_make_payments_and_read_their_invoices(self):
		role = frappe.get_doc({"doctype": "Role", "role_name": unique_name("Books Payer")}).insert()
		add_permission("Books Payment Entry", role.name)
		update_permission_property("Books Payment Entry", role.name, 0, "create", 1)
		payment = self._payment(self.invoice)
		with self.set_user(
			ensure_user(f"books-payer-{frappe.generate_hash(length=8)}@example.com", role.name)
		):
			self.assertRaises(frappe.PermissionError, payment.preview)
		with self.set_user(ensure_user("books-payment-preview-stranger@example.com")):
			self.assertRaises(frappe.PermissionError, payment.preview)

	def test_payment_method_requirements(self):
		method = make_mode_of_payment("Cheque")
		payment = self._payment(self.invoice, mode_of_payment=method.name)
		with self.assertRaisesRegex(frappe.ValidationError, "Please enter a reference number."):
			payment.insert()
		payment.reference_no = "CHQ-1"
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

				first = self._payment(invoice, paid_amount=invoice.grand_total / 2)
				first.append(
					"realised_taxes",
					{"account": self.cash.name, "from_account": self.income.name, "rate": 1, "amount": 1},
				)
				first.insert().submit()
				self._payment(invoice, paid_amount=invoice.grand_total / 2).insert().submit()

				self.assertEqual(
					[(row.account, row.from_account) for row in first.realised_taxes],
					[(realised.name, unrealised.name)],
				)
				self.assertEqual(Decimal(str(first.realised_taxes[0].amount)), tax_amount / 2)
				self.assertEqual(self._balance(realised), tax_amount)
				self.assertEqual(self._balance(unrealised), 0)

	def test_an_internal_transfer_moves_money_between_own_accounts(self):
		set_mode_of_payment_account("Cash", self.cash.name)
		bank = make_account("Rules Bank", account_type="Bank")

		transfer = self._transfer(bank.name).insert().submit()

		self.assertEqual(transfer.paid_from, self.cash.name)
		self.assertFalse(transfer.party_type or transfer.party)
		entries = frappe.get_all(
			"Books GL Entry",
			filters={"voucher_type": transfer.doctype, "voucher_no": transfer.name},
			fields=["account", "debit", "credit", "party_type", "party"],
			order_by="debit desc",
		)
		self.assertEqual(
			[(row.account, row.debit, row.credit) for row in entries],
			[(bank.name, 50, 0), (self.cash.name, 0, 50)],
		)
		self.assertFalse(any(row.party_type or row.party for row in entries))

	def test_an_internal_transfer_cannot_settle_invoices_or_write_off(self):
		bank = make_account("Rules Bank", account_type="Bank")
		reference = {"reference_doctype": self.invoice.doctype, "reference_name": self.invoice.name}
		for values in (
			{"references": [{**reference, "allocated_amount": 50}]},
			{"deductions": [{"account": self.expense.name, "amount": 5}]},
		):
			with (
				self.subTest(values=values),
				self.assertRaisesRegex(frappe.ValidationError, "An internal transfer cannot settle invoices"),
			):
				self._transfer(bank.name, paid_from=self.cash.name, **values).insert()

	def test_a_transfer_preview_drops_what_the_form_hides(self):
		bank = make_account("Rules Bank", account_type="Bank")
		reference = {"reference_doctype": self.invoice.doctype, "reference_name": self.invoice.name}
		transfer = self._transfer(bank.name, references=[reference], deductions=[{"amount": 5}])

		transfer.preview()

		self.assertEqual((transfer.references, transfer.deductions), ([], []))
		self.assertEqual((transfer.party_type, transfer.party), (None, None))

	def test_an_internal_transfer_goes_to_a_cash_or_bank_account(self):
		transfer = self._transfer(self.income.name, paid_from=self.cash.name)
		with self.assertRaisesRegex(frappe.ValidationError, "Account Paid To must be of type Cash or Bank"):
			transfer.insert()

	def test_a_receipt_write_off_debits_the_company_write_off_account(self):
		writeoff = make_account("Rules Write Off", root_type="Expense")
		set_company_value("write_off_account", writeoff.name)
		payment = self._payment(self.invoice, paid_amount=170, deductions=[{"amount": 10}])
		payment.references[0].allocated_amount = 180

		payment.insert().submit()

		self.assertEqual(payment.deductions[0].account, writeoff.name)
		self.assertEqual(self.invoice.db_get("outstanding_amount"), 0)
		entries = ledger_entries(payment.doctype, payment.name)
		self.assertEqual(
			[(row.debit, row.credit) for row in entries if row.account == writeoff.name], [(10, 0)]
		)

	def test_a_payment_write_off_credits_the_company_write_off_account(self):
		writeoff = make_account("Rules Write Off", root_type="Expense")
		set_company_value("write_off_account", writeoff.name)
		supplier = make_supplier(self.payable.name)
		purchase = make_invoice(
			"Books Purchase Invoice",
			supplier.name,
			self.payable.name,
			self.item.name,
			self.expense.name,
			make_auto_payment=0,
		).submit()
		payment = self._payment(
			purchase,
			paid_amount=170,
			payment_type="Pay",
			paid_to=self.payable.name,
			deductions=[{"amount": -10}],
		)
		payment.references[0].allocated_amount = 180

		payment.insert().submit()

		entries = {
			row.account: (row.debit, row.credit) for row in ledger_entries(payment.doctype, payment.name)
		}
		self.assertEqual(entries[writeoff.name], (0, 10))
		self.assertEqual(entries[self.payable.name], (180, 0))
		self.assertEqual(purchase.db_get("outstanding_amount"), 0)

	def test_a_write_off_needs_the_company_write_off_account(self):
		set_company_value("write_off_account", None)
		payment = self._payment(self.invoice, paid_amount=170, deductions=[{"amount": 10}])
		with self.assertRaisesRegex(frappe.ValidationError, "Set a write-off account in Books Company."):
			payment.insert()

	def test_submit_and_cancel_show_what_each_invoice_still_owes(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_partial_payment", 1)
		payment = self._payment(self.invoice, paid_amount=100).insert()
		row = payment.references[0]
		self.assertEqual(row.total_amount, self.invoice.base_grand_total)

		for action, outstanding in ((payment.submit, 80), (payment.cancel, 180)):
			with self.subTest(action=action.__name__):
				action()
				self.assertEqual(row.db_get("outstanding_amount"), outstanding)

	def test_an_allocation_cannot_exceed_what_the_invoice_owes(self):
		message = "Row #1: Allocated Amount cannot be greater than outstanding amount."
		with self.assertRaisesRegex(frappe.ValidationError, message):
			self._payment(self.invoice, paid_amount=200).preview()

		payment = self._payment(self.invoice)
		payment.references[0].allocated_amount = 200
		with self.assertRaisesRegex(frappe.ValidationError, message):
			payment.insert()

	def test_a_receipt_or_payment_needs_a_party(self):
		for payment_type, party_type, paid_to in (
			("Receive", "Books Customer", self.cash.name),
			("Pay", "Books Supplier", self.payable.name),
		):
			with self.subTest(payment_type=payment_type):
				payment = self._payment(
					self.invoice,
					payment_type=payment_type,
					party_type=party_type,
					party=None,
					paid_to=paid_to,
					references=[],
				)
				self.assertRaisesRegex(frappe.ValidationError, "Party is mandatory.", payment.insert)

	def test_the_amount_settled_must_be_above_zero(self):
		payment = self._payment(
			self.invoice, paid_amount=10, deductions=[{"account": self.expense.name, "amount": -10}]
		)
		with self.assertRaisesRegex(
			frappe.ValidationError, "The amount settled, after the write-off, must be greater than zero."
		):
			payment.insert()

	def _transfer(self, paid_to, **values):
		return frappe.get_doc(
			{
				"doctype": "Books Payment Entry",
				"payment_type": "Internal Transfer",
				"posting_date": nowdate(),
				"mode_of_payment": "Cash",
				"paid_to": paid_to,
				"paid_amount": 50,
				**values,
			}
		)

	def _taxed_invoice(self, unrealised, realised, discount_after_tax):
		tax = frappe.get_doc(
			{
				"doctype": "Books Item Tax Template",
				"title": unique_name("Deferred Tax"),
				"taxes": [{"tax_type": unrealised.name, "payment_account": realised.name, "tax_rate": 10}],
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
		invoice.items[0].item_tax_template = tax.name
		return invoice.save().submit()

	def _balance(self, account):
		entries = frappe.get_all(
			"Books GL Entry", filters={"account": account.name}, fields=["debit", "credit"]
		)
		return sum(Decimal(str(row.credit)) - Decimal(str(row.debit)) for row in entries)

	def _submitted_invoice(self):
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, self.item.name, self.income.name
		)
		return invoice.submit()

	def _payment(self, invoice, paid_amount=None, **values):
		paid_amount = paid_amount or abs(invoice.grand_total)
		# A receipt moves money from the customer's ledger to cash, a refund back.
		accounts = {"paid_from": self.receivable.name, "paid_to": self.cash.name}
		if values.get("payment_type") == "Pay":
			accounts = {"paid_from": self.cash.name, "paid_to": self.receivable.name}
		return frappe.get_doc(
			{
				"doctype": "Books Payment Entry",
				"party_type": invoice.party_type,
				"party": invoice.party,
				"posting_date": nowdate(),
				"payment_type": "Receive",
				**accounts,
				"mode_of_payment": "Cash",
				"paid_amount": paid_amount,
				"references": [
					{
						"reference_doctype": invoice.doctype,
						"reference_name": invoice.name,
						"allocated_amount": paid_amount,
					}
				],
				**values,
			}
		)
