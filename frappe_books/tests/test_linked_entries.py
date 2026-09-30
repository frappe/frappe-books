"""Regression coverage for document IDs returned to the linked entries panel."""

import re
from unittest.mock import patch

import frappe
from frappe.core.doctype.permission_type.permission_type import get_doctype_ptype_map
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party
from frappe_books.ui_bridge import linked_entries as linked_entries_module
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries
from frappe_books.ui_bridge.database import BooksDatabaseBridge
from frappe_books.ui_bridge.linked_entries import linked_entries

QUOTED_TABLE = re.compile(r'[`"](tab[^`"]+)[`"]')


class IntegrationTestLinkedEntries(IntegrationTestCase):
	def setUp(self):
		self.bridge = BooksDatabaseBridge()

	def test_numeric_record_names_are_strings_in_list_responses(self):
		for schema in ("AccountingLedgerEntry", "StockLedgerEntry", "ItemEnquiry"):
			with self.subTest(schema=schema), patch("frappe.get_list", return_value=[{"name": 193}]):
				rows = self.bridge.get_all(schema, {"fields": ["name"]})
				self.assertEqual(rows, [{"name": "193"}])

	def test_numeric_record_names_are_strings_in_document_responses(self):
		for schema, doctype in (
			("AccountingLedgerEntry", "Books Ledger Entry"),
			("StockLedgerEntry", "Books Stock Ledger Entry"),
			("ItemEnquiry", "Books Item Enquiry"),
		):
			with self.subTest(schema=schema):
				doc = frappe.get_doc({"doctype": doctype, "name": 193})
				self.assertEqual(self.bridge._to_source_document(schema, doc, ["name"]), {"name": "193"})

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
		links = self.bridge.get_all(
			"AccountingLedgerEntry", {"fields": ["name", "created"], "filters": {"account": account.name}}
		)
		self.assertEqual([row["name"] for row in links], [str(entry.name)])
		details = self.bridge.get_all(
			"AccountingLedgerEntry",
			{
				"fields": ["name", "date", "account", "debit", "credit"],
				"filters": {"name": ["in", [row["name"] for row in links]]},
			},
		)
		self.assertEqual(details[0]["name"], str(entry.name))
		self.assertEqual(details[0]["debit"], 12.5)
		self.assertEqual(self.bridge.get("AccountingLedgerEntry", str(entry.name))["name"], str(entry.name))

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
		self.assertNotIn("Payment", linked_entries("SalesInvoice", invoice.name))

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

		entries = BooksBespokeQueries().call("getLinkedEntries", ["SalesInvoice", invoice.name])
		self.assertEqual(entries["Payment"], [payment.name])
		self.assertIn("AccountingLedgerEntry", entries)

		payment.cancel()
		self.assertNotIn("Payment", linked_entries("SalesInvoice", invoice.name))

	def test_linked_entries_list_the_newest_within_the_limit(self):
		account = make_account("Linked limit")
		older, newer = (_ledger_entry(account.name, creation) for creation in ("2026-01-01", "2026-01-02"))

		with patch.object(linked_entries_module, "LINKED_ENTRIES_LIMIT", 1):
			self.assertEqual(linked_entries("Account", account.name), {"AccountingLedgerEntry": [newer]})
		self.assertEqual(linked_entries("Account", account.name), {"AccountingLedgerEntry": [newer, older]})

	def test_linked_entries_read_only_books_tables(self):
		account = make_account("Linked tables")
		_ledger_entry(account.name, "2026-01-01")
		linked_entries("Account", account.name)

		# Any process on the bench can wipe Frappe's site cache mid-test, so pin the one it refills here.
		with (
			patch("frappe.permissions.get_doctype_ptype_map", return_value=get_doctype_ptype_map()),
			patch.object(frappe.db, "sql", wraps=frappe.db.sql) as sql,
		):
			linked_entries("Account", account.name)

		tables = {table for call in sql.call_args_list for table in QUOTED_TABLE.findall(str(call.args[0]))}
		self.assertTrue(tables)
		self.assertEqual({table for table in tables if not table.startswith("tabBooks ")}, set())


def _ledger_entry(account, creation):
	entry = frappe.get_doc(
		{"doctype": "Books Ledger Entry", "account": account, "posting_date": creation, "debit": 1}
	).insert()
	entry.db_set("creation", creation, update_modified=False)
	return str(entry.name)
