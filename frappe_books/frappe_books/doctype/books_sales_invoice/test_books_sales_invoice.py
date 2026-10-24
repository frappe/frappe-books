# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal
from unittest.mock import patch

import frappe
from frappe.client import insert
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, nowdate

from frappe_books.accounting.invoice import item_discount
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
	make_customer,
	make_invoice,
	make_item,
	make_tax,
	set_company_value,
	unique_name,
)


class IntegrationTestBooksSalesInvoice(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Receivable", account_type="Receivable")
		self.income = make_account("Sales", root_type="Income", account_type="Income Account")
		self.expense = make_account("Expense", root_type="Expense", account_type="Expense Account")
		self.tax_account = make_account("Sales Tax", root_type="Liability", account_type="Tax")
		self.discount = make_account("Discount", root_type="Expense", account_type="Expense Account")
		self.party = make_customer(self.receivable.name)
		self.tax = make_tax(self.tax_account.name)
		self.item = make_item(self.income.name, self.expense.name, self.tax.name)
		set_company_value("default_discount_account", self.discount.name)

	def test_calculates_and_posts_tax_and_discount(self):
		invoice = self._make_invoice()
		self.assertEqual(Decimal(str(invoice.net_total)), Decimal("180"))
		self.assertEqual(Decimal(str(invoice.taxes[0].tax_amount)), Decimal("18"))
		self.assertEqual(Decimal(str(invoice.grand_total)), Decimal("198"))

		invoice.submit()
		entries = ledger_entries(invoice.doctype, invoice.name)
		self.assertEqual(sum(Decimal(str(row.debit or 0)) for row in entries), Decimal("218"))
		self.assertEqual(sum(Decimal(str(row.credit or 0)) for row in entries), Decimal("218"))
		self.assertEqual(Decimal(str(invoice.db_get("outstanding_amount"))), Decimal("198"))

	def test_item_discount_is_the_rows_discount_before_tax(self):
		invoice = self._make_invoice()
		self.assertEqual((invoice.items[0].rate, invoice.items[0].amount), (90, 180))
		self.assertEqual(item_discount(invoice), Decimal("20"))

	def test_the_api_cannot_set_an_invoice_wide_discount(self):
		values = {
			"doctype": "Books Sales Invoice",
			"customer": self.party.name,
			"posting_date": nowdate(),
			"items": [
				{"item_code": self.item.name, "price_list_rate": 100, "qty": 2, "discount_percentage": 10}
			],
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
			{
				"doctype": "Books Item Group",
				"item_group_name": unique_name("Taxed Group"),
				"taxes": [{"item_tax_template": self.tax.name}],
			}
		).insert()
		item = make_item(self.income.name, self.expense.name, item_group=group.name)
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, item.name, self.income.name
		)

		self.assertEqual(invoice.items[0].item_tax_template, self.tax.name)
		self.assertEqual(Decimal(str(invoice.taxes[0].tax_amount)), Decimal("18"))

	def test_row_tax_is_the_latest_item_tax_valid_on_the_invoice_date(self):
		later = make_tax(self.tax_account.name, rate=5)
		starts = add_days(nowdate(), 10)
		item = make_item(
			self.income.name,
			self.expense.name,
			taxes=[
				{"item_tax_template": self.tax.name},
				{"item_tax_template": later.name, "valid_from": starts},
			],
		)

		for date, tax in ((nowdate(), self.tax.name), (starts, later.name)):
			with self.subTest(date=date):
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					item.name,
					self.income.name,
					posting_date=date,
				)
				self.assertEqual(invoice.items[0].item_tax_template, tax)

	def test_row_hsn_code_comes_from_the_item_with_its_leading_zero(self):
		item = make_item(self.income.name, self.expense.name, gst_hsn_code="0902")
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, item.name, self.income.name
		)

		self.assertEqual(invoice.items[0].db_get("gst_hsn_code"), "0902")

	def test_row_hsn_code_must_contain_four_to_eight_digits(self):
		invoice = self._make_invoice()
		invoice.items[0].gst_hsn_code = "12A4"

		self.assertRaisesRegex(frappe.ValidationError, "between 4 and 8 digits", invoice.save)

	def test_item_discount_stays_within_the_row(self):
		for values, message in (
			({"discount_percentage": 101}, "between 0 and 100"),
			({"discount_percentage": 0, "discount_amount": 101}, "cannot exceed the row rate"),
			({"discount_percentage": 0, "discount_amount": -1}, "cannot exceed the row rate"),
		):
			with self.subTest(values=values):
				invoice = self._make_invoice()
				invoice.items[0].update(values)
				self.assertRaisesRegex(frappe.ValidationError, message, invoice.save)

	def test_quantity_counts_the_rows_unit(self):
		box = frappe.get_doc({"doctype": "Books UOM", "uom_name": unique_name("Box")}).insert()
		self.item.append("uoms", {"uom": box.name, "conversion_factor": 12})
		self.item.save()
		invoice = self._make_invoice()
		invoice.items[0].update(
			{
				"uom": box.name,
				"stock_qty": 24,
				"qty": None,
			}
		)
		invoice.save()

		self.assertEqual(invoice.items[0].qty, 2)

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
		set_company_value("round_off_account", round_off.name)
		item = make_item(self.income.name, self.expense.name)
		party = make_customer(self.receivable.name, default_currency=foreign_currency())
		invoice = make_invoice(
			"Books Sales Invoice",
			party.name,
			self.receivable.name,
			item.name,
			self.income.name,
			conversion_rate=1.2345,
		)
		invoice.items[0].update({"price_list_rate": 10, "qty": 3, "discount_percentage": 5})
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
					make_customer(self.receivable.name).name,
					self.receivable.name,
					item.name,
					self.income.name,
				)
				invoice.items[0].update(
					{"price_list_rate": Decimal(rate), "qty": 2, "discount_percentage": 0}
				)
				invoice.save().submit()

				self.assertEqual(Decimal(str(invoice.grand_total)), Decimal(total))
				entries = ledger_entries(invoice.doctype, invoice.name)
				self.assertEqual(sum(Decimal(str(row.debit)) for row in entries), Decimal(total))

	def test_rounds_invoice_amounts_to_invoice_currency(self):
		item = make_item(self.income.name, self.expense.name)
		with self.change_settings("System Settings", currency="JPY"):
			party = make_customer(self.receivable.name, default_currency=foreign_currency())
			invoice = make_invoice(
				"Books Sales Invoice",
				party.name,
				self.receivable.name,
				item.name,
				self.income.name,
				conversion_rate=150,
			)
			invoice.items[0].update({"price_list_rate": Decimal("10.25"), "qty": 1, "discount_percentage": 0})
			invoice.save().submit()

			self.assertEqual(Decimal(str(invoice.grand_total)), Decimal("10.25"))
			self.assertEqual(Decimal(str(invoice.base_grand_total)), Decimal("1538"))
			entries = ledger_entries(invoice.doctype, invoice.name)
			self.assertEqual(sum(Decimal(str(row.debit)) for row in entries), Decimal("1538"))

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
				# The discount is per unit: half the row's for each of its two.
				invoice.items[0].update({"discount_amount": row_discount / 2, "discount_percentage": 0})
				invoice.save().submit()

				for _ in range(2):
					credit_note = map_return(invoice.doctype, invoice.name)
					credit_note.items[0].qty = -1
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
		credit_note.items[0].update({"qty": -2, "discount_percentage": 0})

		with self.assertRaisesRegex(frappe.ValidationError, "cannot exceed its value"):
			credit_note.insert()

	def test_return_quantities_are_negative(self):
		invoice = self._make_invoice()
		invoice.submit()
		credit_note = map_return(invoice.doctype, invoice.name)
		credit_note.items[0].qty = 1

		credit_note.insert()

		row = credit_note.items[0]
		self.assertEqual((row.stock_qty, row.qty), (-1, -1))
		self.assertTrue(credit_note.is_return)
		self.assertLess(credit_note.grand_total, 0)

	def test_other_invoices_have_positive_quantities(self):
		invoice = self._make_invoice()
		invoice.items[0].qty = -2

		invoice.save()

		row = invoice.items[0]
		self.assertEqual((row.stock_qty, row.qty), (2, 2))

	def test_new_documents_start_with_the_default_terms(self):
		frappe.db.set_single_value("Books Defaults", "sales_invoice_terms", "Pay within 30 days")
		for doctype in ("Books Sales Invoice", "Books Quotation"):
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
		item = make_item(self.income.name, self.expense.name, standard_rate=100)
		for values, message in (
			({"price_list_rate": 90, "discount_percentage": 0}, "changing the rate"),
			({"price_list_rate": 100, "discount_percentage": 10}, "editing the discount"),
		):
			with self.subTest(values=values):
				invoice = frappe.get_doc(
					{
						"doctype": "Books Sales Invoice",
						"customer": self.party.name,
						"debit_to": self.receivable.name,
						"posting_date": nowdate(),
						"is_pos": 1,
						"items": [{"item_code": item.name, "qty": 1, **values}],
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
				"posting_date": nowdate(),
				"is_pos": 1,
				"items": [{"item_code": self.item.name, "qty": 1, "price_list_rate": 100}],
			}
		).insert()

		self.assertEqual((invoice.party, invoice.debit_to), (self.party.name, self.receivable.name))

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
		frappe.db.set_single_value("Books Defaults", "pos_customer", make_customer(self.receivable.name).name)
		invoice = frappe.get_doc({"doctype": "Books Sales Invoice", "is_pos": 1})

		invoice.preview()

		self.assertEqual(invoice.party, self.party.name)

	def test_invoice_bills_in_the_party_currency(self):
		currency = foreign_currency()
		party = make_customer(self.receivable.name, default_currency=currency)
		invoice = make_invoice(
			"Books Sales Invoice",
			party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			currency=company_currency(),
			conversion_rate=80,
		)

		self.assertEqual((invoice.currency, invoice.conversion_rate), (currency, 80))

	def test_foreign_currency_invoice_needs_an_exchange_rate(self):
		party = make_customer(self.receivable.name, default_currency=foreign_currency())
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
			conversion_rate=80,
		)

		self.assertEqual((invoice.currency, invoice.conversion_rate), (company_currency(), 1))

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
