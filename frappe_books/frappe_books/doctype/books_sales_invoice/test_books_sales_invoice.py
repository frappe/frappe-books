# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal
from unittest.mock import patch

import frappe
from frappe.client import insert
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.money import company_currency
from frappe_books.accounting.returns import map_return
from frappe_books.frappe_books.doctype.books_pos_opening_shift.test_books_pos_opening_shift import (
	open_shift,
	set_pos_accounts,
)
from frappe_books.tests.accounting import (
	foreign_currency,
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_party,
	make_tax,
	unique_name,
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

	def test_total_discount_is_a_virtual_field(self):
		invoice = self._make_invoice()
		self.assertEqual(Decimal(str(invoice.as_dict().total_discount)), Decimal("20"))

	def test_the_api_cannot_set_an_invoice_wide_discount(self):
		values = {
			"doctype": "Books Sales Invoice",
			"party": self.party.name,
			"date": str(frappe.utils.now_datetime()),
			"items": [{"item": self.item.name, "rate": 100, "quantity": 2, "item_discount_percent": 10}],
		}
		saved = insert({**values, "set_discount_amount": 1, "discount_amount": 50, "discount_percent": 50})
		invoice = frappe.get_doc(saved.doctype, saved.name).submit()

		self.assertEqual(Decimal(str(invoice.grand_total)), Decimal("198"))
		discount = next(
			row for row in ledger_entries(invoice.doctype, invoice.name) if row.account == self.discount.name
		)
		self.assertEqual(Decimal(str(discount.debit)), Decimal("20"))

	def test_row_tax_defaults_to_the_item_group_tax(self):
		group = frappe.get_doc(
			{"doctype": "Books Item Group", "name": unique_name("Taxed Group"), "tax": self.tax.name}
		).insert()
		item = make_item(self.income.name, self.expense.name, item_group=group.name)
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, item.name, self.income.name
		)

		self.assertEqual(invoice.items[0].tax, self.tax.name)
		self.assertEqual(Decimal(str(invoice.taxes[0].amount)), Decimal("18"))

	def test_row_hsn_code_comes_from_the_item(self):
		item = make_item(self.income.name, self.expense.name, hsn_code="998314")
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, item.name, self.income.name
		)

		self.assertEqual(invoice.items[0].db_get("hsn_code"), 998314)

	def test_item_discount_stays_within_the_row(self):
		for values, message in (
			({"item_discount_percent": 101}, "between 0 and 100"),
			({"set_item_discount_amount": 1, "item_discount_amount": 201}, "cannot exceed the row amount"),
			({"set_item_discount_amount": 1, "item_discount_amount": -1}, "cannot exceed the row amount"),
		):
			with self.subTest(values=values):
				invoice = self._make_invoice()
				invoice.items[0].update(values)
				self.assertRaisesRegex(frappe.ValidationError, message, invoice.save)

	def test_transfer_quantity_counts_transfer_units(self):
		box = frappe.get_doc({"doctype": "Books Uom", "name": unique_name("Box")}).insert()
		self.item.append("uom_conversions", {"uom": box.name, "conversion_factor": 12})
		self.item.save()
		invoice = self._make_invoice()
		invoice.items[0].update(
			{
				"transfer_unit": box.name,
				"quantity": 24,
				"transfer_quantity": None,
			}
		)
		invoice.save()

		self.assertEqual(invoice.items[0].transfer_quantity, 2)

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
		party = make_party(self.receivable.name, currency=foreign_currency())
		invoice = make_invoice(
			"Books Sales Invoice",
			party.name,
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
			with (
				self.subTest(currency=currency),
				self.change_settings("System Settings", currency=currency),
			):
				invoice = make_invoice(
					"Books Sales Invoice",
					make_party(self.receivable.name).name,
					self.receivable.name,
					item.name,
					self.income.name,
				)
				invoice.items[0].update({"rate": Decimal(rate), "quantity": 2, "item_discount_percent": 0})
				invoice.save().submit()

				self.assertEqual(Decimal(str(invoice.grand_total)), Decimal(total))
				entries = ledger_entries(invoice.doctype, invoice.name)
				self.assertEqual(sum(Decimal(str(row.debit)) for row in entries), Decimal(total))

	def test_rounds_invoice_amounts_to_invoice_currency(self):
		item = make_item(self.income.name, self.expense.name)
		with self.change_settings("System Settings", currency="JPY"):
			party = make_party(self.receivable.name, currency=foreign_currency())
			invoice = make_invoice(
				"Books Sales Invoice",
				party.name,
				self.receivable.name,
				item.name,
				self.income.name,
				exchange_rate=150,
			)
			invoice.items[0].update({"rate": Decimal("10.25"), "quantity": 1, "item_discount_percent": 0})
			invoice.save().submit()

			self.assertEqual(Decimal(str(invoice.grand_total)), Decimal("10.25"))
			self.assertEqual(Decimal(str(invoice.base_grand_total)), Decimal("1538"))
			entries = ledger_entries(invoice.doctype, invoice.name)
			self.assertEqual(sum(Decimal(str(row.debit)) for row in entries), Decimal("1538"))

	def test_return_posts_item_discounts(self):
		item = make_item(self.income.name, self.expense.name)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			item.name,
			self.income.name,
		)
		invoice.submit()
		credit_note = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			item.name,
			self.income.name,
			return_against=invoice.name,
			items=[
				{
					"item": item.name,
					"account": self.income.name,
					"rate": 100,
					"quantity": -2,
					"item_discount_percent": 10,
				}
			],
		)
		credit_note.submit()

		self.assertEqual(Decimal(str(credit_note.grand_total)), Decimal("-180"))
		entries = ledger_entries(credit_note.doctype, credit_note.name)
		discount = next(row for row in entries if row.account == self.discount.name)
		self.assertEqual(Decimal(str(discount.credit)), Decimal("20"))

	def test_partial_returns_share_fixed_discounts(self):
		item = make_item(self.income.name, self.expense.name)
		for row_discount, refund in ((20, 90), (150, 25)):
			with self.subTest(row_discount=row_discount):
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					item.name,
					self.income.name,
				)
				invoice.items[0].update(
					{
						"set_item_discount_amount": 1,
						"item_discount_amount": row_discount,
						"item_discount_percent": 0,
					}
				)
				invoice.save().submit()

				for _ in range(2):
					credit_note = map_return(invoice.doctype, invoice.name)
					credit_note.items[0].quantity = -1
					credit_note.insert().submit()
					self.assertEqual(credit_note.grand_total, -refund)

	def test_return_cannot_credit_more_than_was_billed(self):
		item = make_item(self.income.name, self.expense.name)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			item.name,
			self.income.name,
		)
		invoice.submit()
		credit_note = frappe.copy_doc(invoice)
		credit_note.update({"docstatus": 0, "return_against": invoice.name})
		credit_note.items[0].update({"quantity": -2, "item_discount_percent": 0})

		with self.assertRaisesRegex(frappe.ValidationError, "cannot exceed its value"):
			credit_note.insert()

	def test_return_quantities_are_negative(self):
		invoice = self._make_invoice()
		invoice.submit()
		credit_note = map_return(invoice.doctype, invoice.name)
		credit_note.items[0].quantity = 1

		credit_note.insert()

		row = credit_note.items[0]
		self.assertEqual((row.quantity, row.transfer_quantity, row.qty), (-1, -1, -1))
		self.assertLess(credit_note.grand_total, 0)

	def test_other_invoices_have_positive_quantities(self):
		invoice = self._make_invoice()
		invoice.items[0].quantity = -2

		invoice.save()

		row = invoice.items[0]
		self.assertEqual((row.quantity, row.transfer_quantity, row.qty), (2, 2, 2))

	def test_items_follow_their_item_usage(self):
		purchase_item = make_item(self.income.name, self.expense.name, item_usage="Purchases")
		with self.assertRaisesRegex(frappe.ValidationError, "is not for Sales"):
			make_invoice(
				"Books Sales Invoice",
				self.party.name,
				self.receivable.name,
				purchase_item.name,
				self.income.name,
			)

		payable = make_account("Payable", root_type="Liability", account_type="Payable")
		supplier = make_party(payable.name, role="Supplier")
		sales_item = make_item(self.income.name, self.expense.name, item_usage="Sales")
		with self.assertRaisesRegex(frappe.ValidationError, "is not for Purchases"):
			make_invoice(
				"Books Purchase Invoice", supplier.name, payable.name, sales_item.name, self.expense.name
			)

	def test_new_documents_start_with_the_default_terms(self):
		frappe.db.set_single_value("Books Defaults", "sales_invoice_terms", "Pay within 30 days")
		for doctype in ("Books Sales Invoice", "Books Sales Quote"):
			with self.subTest(doctype=doctype):
				invoice = make_invoice(
					doctype, self.party.name, self.receivable.name, self.item.name, self.income.name
				)
				self.assertEqual(invoice.terms, "Pay within 30 days")

		invoice = self._make_invoice()
		invoice.terms = ""
		invoice.save()
		self.assertEqual(invoice.terms, "")
		without_terms = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			terms="",
		)
		self.assertEqual(without_terms.terms, "")

	def test_pos_invoice_keeps_rate_and_discount_when_profile_forbids(self):
		frappe.db.set_single_value(
			"Books Pos Settings", {"pos_profile": None, "can_change_rate": 0, "can_edit_discount": 0}
		)
		item = make_item(self.income.name, self.expense.name, rate=100)
		for values, message in (
			({"rate": 90, "item_discount_percent": 0}, "changing the rate"),
			({"rate": 100, "item_discount_percent": 10}, "editing the discount"),
		):
			with self.subTest(values=values):
				invoice = frappe.get_doc(
					{
						"doctype": "Books Sales Invoice",
						"party": self.party.name,
						"account": self.receivable.name,
						"date": frappe.utils.now_datetime(),
						"is_pos": 1,
						"items": [{"item": item.name, "quantity": 1, **values}],
					}
				)
				with self.assertRaisesRegex(frappe.ValidationError, message):
					invoice.insert()

		frappe.db.set_single_value("Books Pos Settings", {"can_change_rate": 1, "can_edit_discount": 1})
		invoice.insert()

	def test_pos_invoice_defaults_to_the_pos_customer_and_account(self):
		frappe.db.set_single_value(
			"Books Pos Settings", {"pos_profile": None, "default_account": self.receivable.name}
		)
		frappe.db.set_single_value("Books Defaults", "pos_customer", self.party.name)
		invoice = frappe.get_doc(
			{
				"doctype": "Books Sales Invoice",
				"date": frappe.utils.now_datetime(),
				"is_pos": 1,
				"items": [{"item": self.item.name, "quantity": 1, "rate": 100}],
			}
		).insert()

		self.assertEqual((invoice.party, invoice.account), (self.party.name, self.receivable.name))

	def test_a_new_pos_sale_previews_the_customer_of_the_pos_profile(self):
		profile = frappe.get_doc(
			{
				"doctype": "Books Pos Profile",
				"name": unique_name("POS Profile"),
				"inventory": "Stores",
				"pos_customer": self.party.name,
			}
		).insert()
		frappe.db.set_single_value("Books Pos Settings", "pos_profile", profile.name)
		frappe.db.set_single_value("Books Defaults", "pos_customer", make_party(self.receivable.name).name)
		invoice = frappe.get_doc({"doctype": "Books Sales Invoice", "is_pos": 1})

		invoice.preview()

		self.assertEqual(invoice.party, self.party.name)

	def test_invoice_bills_in_the_party_currency(self):
		currency = foreign_currency()
		party = make_party(self.receivable.name, currency=currency)
		invoice = make_invoice(
			"Books Sales Invoice",
			party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			currency=company_currency(),
			exchange_rate=80,
		)

		self.assertEqual((invoice.currency, invoice.exchange_rate), (currency, 80))

	def test_foreign_currency_invoice_needs_an_exchange_rate(self):
		party = make_party(self.receivable.name, currency=foreign_currency())
		with (
			patch("frappe_books.accounting.invoice.get_exchange_rate", return_value=None),
			self.assertRaisesRegex(frappe.ValidationError, "Set an exchange rate"),
		):
			make_invoice(
				"Books Sales Invoice", party.name, self.receivable.name, self.item.name, self.income.name
			)

	def test_company_currency_invoice_has_an_exchange_rate_of_one(self):
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			currency=foreign_currency(),
			exchange_rate=80,
		)

		self.assertEqual((invoice.currency, invoice.exchange_rate), (company_currency(), 1))

	def test_sales_invoice_needs_a_receivable_ledger_account(self):
		group = make_account("Receivables", account_type="Receivable", is_group=1)
		for account, message in ((self.income, "must be of type Receivable"), (group, "group account")):
			with self.subTest(message=message), self.assertRaisesRegex(frappe.ValidationError, message):
				make_invoice(
					"Books Sales Invoice", self.party.name, account.name, self.item.name, self.income.name
				)

	def test_pos_invoice_needs_an_open_shift(self):
		set_pos_accounts()
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			is_pos=1,
		)

		self.assertRaisesRegex(frappe.ValidationError, "Open a POS shift", invoice.submit)
		open_shift(0)
		invoice.reload().submit()

	def _make_invoice(self):
		return make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
		)
