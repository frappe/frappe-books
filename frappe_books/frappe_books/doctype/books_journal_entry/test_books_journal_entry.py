# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import flt, nowdate

from frappe_books.accounting.money import as_decimal
from frappe_books.tests.accounting import ledger_entries, make_account

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


def make_journal_entry(accounts):
	return frappe.get_doc(
		{
			"doctype": "Books Journal Entry",
			"posting_date": nowdate(),
			"accounts": accounts,
		}
	).insert()
