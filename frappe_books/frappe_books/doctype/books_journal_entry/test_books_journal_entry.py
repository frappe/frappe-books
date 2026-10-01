# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal

import frappe
from frappe.api.v2 import run_doc_method
from frappe.tests import IntegrationTestCase
from frappe.utils import flt, nowdate, set_request

from frappe_books.accounting.money import as_decimal
from frappe_books.tests.accounting import ensure_user, ledger_entries, make_account, make_number_series

READ_ONLY_USER = "books-journal-preview-reader@example.com"

# On IntegrationTestCase, the doctype test records and all
# link-field test record dependencies are recursively loaded
# Use these module variables to add/remove to/from that list
EXTRA_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]
IGNORE_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]


class IntegrationTestBooksJournalEntry(IntegrationTestCase):
	def setUp(self):
		self.cash = make_account("Test Cash")
		self.equity = make_account("Test Equity", root_type="Equity")

	def test_submit_posts_balanced_ledger_entries(self):
		journal_entry = make_journal_entry(
			[
				{"account": self.cash.name, "debit": 125.50},
				{"account": self.equity.name, "credit": 125.50},
			]
		)
		journal_entry.submit()

		entries = ledger_entries(journal_entry.doctype, journal_entry.name)
		self.assertEqual(len(entries), 2)
		self.assertEqual(sum(as_decimal(entry.debit) for entry in entries), Decimal("125.5"))
		self.assertEqual(sum(as_decimal(entry.credit) for entry in entries), Decimal("125.5"))

	def test_cancel_posts_reversals(self):
		journal_entry = make_journal_entry(
			[
				{"account": self.cash.name, "debit": 50},
				{"account": self.equity.name, "credit": 50},
			]
		)
		journal_entry.submit()
		journal_entry.cancel()

		entries = ledger_entries(journal_entry.doctype, journal_entry.name)
		self.assertEqual(len(entries), 4)
		self.assertEqual(sum(flt(entry.debit, 2) for entry in entries), 100)
		self.assertEqual(sum(flt(entry.credit, 2) for entry in entries), 100)
		self.assertEqual(sum(bool(entry.reverts) for entry in entries), 2)
		self.assertTrue(all(entry.reverted for entry in entries))

	def test_rejects_unbalanced_entry(self):
		journal_entry = frappe.get_doc(
			{
				"doctype": "Books Journal Entry",
				"posting_date": nowdate(),
				"accounts": [
					{"account": self.cash.name, "debit": 10},
					{"account": self.equity.name, "credit": 9},
				],
			}
		)
		self.assertRaises(frappe.ValidationError, journal_entry.insert)

	def test_fractional_amounts_balance(self):
		journal_entry = make_journal_entry(
			[
				{"account": self.cash.name, "debit": 0.1},
				{"account": self.cash.name, "debit": 0.2},
				{"account": self.equity.name, "credit": 0.3},
			]
		)
		journal_entry.submit()

		entries = ledger_entries(journal_entry.doctype, journal_entry.name)
		self.assertEqual(flt(sum(entry.debit for entry in entries), 2), 0.3)
		self.assertEqual(flt(sum(entry.credit for entry in entries), 2), 0.3)

	def test_posts_amounts_rounded_to_currency(self):
		journal_entry = make_journal_entry(
			[
				{"account": self.cash.name, "debit": 10.005},
				{"account": self.equity.name, "credit": 10.005},
			]
		)
		journal_entry.submit()

		entries = ledger_entries(journal_entry.doctype, journal_entry.name)
		self.assertEqual(sum(as_decimal(entry.debit) for entry in entries), Decimal("10.01"))
		self.assertEqual(sum(as_decimal(entry.credit) for entry in entries), Decimal("10.01"))

	def test_preview_fills_the_default_series_without_saving(self):
		series = make_number_series("JournalEntry")
		frappe.db.set_single_value("Books Defaults", "journal_entry_number_series", series)
		journal_entry = frappe.new_doc("Books Journal Entry")
		entries = frappe.db.count("Books Journal Entry")

		journal_entry.preview()

		self.assertEqual(journal_entry.number_series, series)
		self.assertEqual(frappe.db.count("Books Journal Entry"), entries)

	def test_number_series_cannot_change_after_insert(self):
		journal_entry = make_journal_entry(
			[{"account": self.cash.name, "debit": 5}, {"account": self.equity.name, "credit": 5}]
		)
		journal_entry.number_series = make_number_series("JournalEntry")
		self.assertRaises(frappe.CannotChangeConstantError, journal_entry.save)

	def test_preview_keeps_a_chosen_series(self):
		journal_entry = frappe.new_doc("Books Journal Entry", number_series="JV-")
		journal_entry.preview()
		self.assertEqual(journal_entry.number_series, "JV-")

	def test_preview_needs_the_right_to_make_journal_entries(self):
		journal_entry = frappe.new_doc("Books Journal Entry")
		with (
			self.set_user(ensure_user(READ_ONLY_USER, "Books User")),
			self.assertRaises(frappe.PermissionError),
		):
			journal_entry.preview()

	def test_the_client_copy_submits_and_cancels_through_run_doc_method(self):
		journal_entry = make_journal_entry(
			[{"account": self.cash.name, "debit": 5}, {"account": self.equity.name, "credit": 5}]
		)
		set_request(method="POST", path="/api/v2/method/run_doc_method")
		for method, docstatus in (("submit", 1), ("cancel", 2)):
			# /books sends the DocType's fields, and the stamps Frappe compares.
			document = client_copy(journal_entry)
			run_doc_method(method, document)
			journal_entry.reload()
			self.assertEqual(journal_entry.docstatus, docstatus)

		draft = make_journal_entry(
			[{"account": self.cash.name, "debit": 5}, {"account": self.equity.name, "credit": 5}]
		)
		without_creation = client_copy(draft)
		without_creation.pop("creation")
		with self.assertRaises(frappe.CannotChangeConstantError):
			run_doc_method("submit", without_creation)


def client_copy(doc):
	values = field_values(doc)
	values["accounts"] = [{**field_values(row), "name": row.name} for row in doc.accounts]
	stamps = {key: str(doc.get(key)) for key in ("modified", "creation")}
	standard = {"name": doc.name, "owner": doc.owner, "docstatus": doc.docstatus, "doctype": doc.doctype}
	return {**values, **stamps, **standard}


def field_values(doc):
	return {df.fieldname: doc.get(df.fieldname) for df in doc.meta.fields if df.fieldtype != "Section Break"}


def make_journal_entry(accounts):
	return frappe.get_doc(
		{
			"doctype": "Books Journal Entry",
			"posting_date": nowdate(),
			"accounts": accounts,
		}
	).insert()
