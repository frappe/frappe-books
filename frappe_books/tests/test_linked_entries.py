"""Regression coverage for the documents the linked entries panel lists."""

import re
from unittest.mock import patch

import frappe
from frappe.core.doctype.permission_type.permission_type import get_doctype_ptype_map
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books import linked_entries as linked_entries_module
from frappe_books.linked_entries import get_linked_entries
from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party

QUOTED_TABLE = re.compile(r'[`"](tab[^`"]+)[`"]')


class IntegrationTestLinkedEntries(IntegrationTestCase):
	def test_linked_ledger_names_can_be_used_to_fetch_display_details(self):
		account = make_account("Linked entry IDs")
		entry = frappe.get_doc(
			{
				"doctype": "Books Ledger Entry",
				"account": account.name,
				"posting_date": "2026-09-06",
				"debit": 12.5,
			}
		).insert()

		names = get_linked_entries(account.doctype, account.name)["Books Ledger Entry"]
		# The panel then lists them by name, as getFrappeRows does.
		details = frappe.get_list(
			"Books Ledger Entry",
			filters={"name": ["in", names]},
			fields=["name", "posting_date", "account", "debit", "credit"],
		)

		self.assertEqual(names, [str(entry.name)])
		self.assertEqual([str(row.name) for row in details], [str(entry.name)])
		self.assertEqual(details[0].debit, 12.5)

	def test_linked_entries_include_links_made_after_the_first_lookup(self):
		receivable = make_account("Linked Receivable", account_type="Receivable")
		cash = make_account("Linked Cash", account_type="Cash")
		income = make_account("Linked Income", root_type="Income", account_type="Income Account")
		expense = make_account("Linked Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		invoice = make_invoice("Books Sales Invoice", party.name, receivable.name, item.name, income.name)
		invoice.submit()
		self.assertNotIn("Books Payment", get_linked_entries(invoice.doctype, invoice.name))

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

		entries = get_linked_entries(invoice.doctype, invoice.name)
		self.assertEqual(entries["Books Payment"], [payment.name])
		self.assertIn("Books Ledger Entry", entries)

		payment.cancel()
		self.assertNotIn("Books Payment", get_linked_entries(invoice.doctype, invoice.name))

	def test_linked_entries_list_the_newest_within_the_limit(self):
		account = make_account("Linked limit")
		older, newer = (_ledger_entry(account.name, creation) for creation in ("2026-01-01", "2026-01-02"))

		with patch.object(linked_entries_module, "LINKED_ENTRIES_LIMIT", 1):
			self.assertEqual(
				get_linked_entries(account.doctype, account.name), {"Books Ledger Entry": [newer]}
			)
		self.assertEqual(
			get_linked_entries(account.doctype, account.name), {"Books Ledger Entry": [newer, older]}
		)

	def test_linked_entries_read_only_books_tables(self):
		account = make_account("Linked tables")
		_ledger_entry(account.name, "2026-01-01")
		get_linked_entries(account.doctype, account.name)

		# Any process on the bench can wipe Frappe's site cache mid-test, so pin the one it refills here.
		with (
			patch("frappe.permissions.get_doctype_ptype_map", return_value=get_doctype_ptype_map()),
			patch.object(frappe.db, "sql", wraps=frappe.db.sql) as sql,
		):
			get_linked_entries(account.doctype, account.name)

		tables = {table for call in sql.call_args_list for table in QUOTED_TABLE.findall(str(call.args[0]))}
		self.assertTrue(tables)
		# Besides Books tables, only the DocType list of the Books module.
		self.assertEqual({table for table in tables if not table.startswith("tabBooks ")}, {"tabDocType"})


def _ledger_entry(account, creation):
	entry = frappe.get_doc(
		{"doctype": "Books Ledger Entry", "account": account, "posting_date": creation, "debit": 1}
	).insert()
	entry.db_set("creation", creation, update_modified=False)
	return str(entry.name)
