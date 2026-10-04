from unittest.mock import patch

import frappe
from frappe.desk.search import search_widget
from frappe.search.sqlite_search import index_docs_in_queue
from frappe.tests import IntegrationTestCase

from frappe_books.search import BooksSearch, build_search_index, search
from frappe_books.tests.accounting import (
	ensure_user,
	make_account,
	make_invoice,
	make_item,
	make_party,
)

USER = "books-search-user@example.com"
INVOICE = "Books Sales Invoice"


class IntegrationTestSearchPalette(IntegrationTestCase):
	"""The /books search palette's index and the search it answers."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		build_search_index()

	def setUp(self):
		self.receivable = make_account("Search Receivable", account_type="Receivable").name

	def test_a_document_is_found_by_its_rows_and_its_doctype(self):
		item, invoice = self._make_invoice()
		BooksSearch().index_documents_by_name(INVOICE, [invoice.name])
		party = invoice.party.split()[-1]

		self.assertEqual(self._found(item.split()[-1], [INVOICE]), [invoice.name])
		self.assertEqual(self._found(f"{party} invoice", [INVOICE, "Books Party"]), [invoice.name])

	def test_a_saved_document_is_indexed_from_the_queue(self):
		BooksSearch().sql("DELETE FROM search_index_queue", commit=True)
		item, invoice = self._make_invoice()
		index_docs_in_queue()

		self.assertEqual(self._found(item.split()[-1], [INVOICE]), [invoice.name])

	def test_results_are_readable_rows_with_cancelled_ones_last(self):
		item, cancelled = self._make_invoice()
		cancelled.cancel()
		submitted = self._make_invoice(item, cancelled.party)[1]
		BooksSearch().index_documents_by_name(INVOICE, [cancelled.name, submitted.name])
		word = cancelled.party.split()[-1]

		with self.set_user(ensure_user(USER, "Books Sales User")):
			rows = search(word, [INVOICE])
		self.assertEqual(
			[(row["name"], row["party"], row["docstatus"]) for row in rows],
			[(submitted.name, submitted.party, 1), (cancelled.name, cancelled.party, 2)],
		)
		with self.set_user(ensure_user("books-search-guest@example.com")):
			self.assertEqual(search(word, [INVOICE]), [])

	def test_accounts_are_found_by_their_names_in_the_users_language(self):
		account = make_account(f"Search Cash {frappe.generate_hash(length=6)}").name
		translated = f"Suchkasse {frappe.generate_hash(length=6)}"
		frappe.get_doc(
			{
				"doctype": "Translation",
				"language": "de",
				"source_text": account,
				"translated_text": translated,
			}
		).insert()

		with self.set_user(ensure_user(USER, "Books Sales User")), patch.object(frappe.local, "lang", "de"):
			found = search_widget("Books Account", translated.lower(), page_length=5, as_dict=True)

		self.assertEqual([row.name for row in found], [account])

	def _found(self, text, doctypes):
		with self.set_user(ensure_user(USER, "Books Sales User")):
			return [row["name"] for row in search(text, doctypes)]

	def _make_invoice(self, item=None, party=None):
		income = make_account("Search Income", root_type="Income", account_type="Income Account")
		expense = make_account("Search Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		item = item or make_item(income.name, expense.name).name
		party = party or make_party(self.receivable).name
		invoice = make_invoice(INVOICE, party, self.receivable, item, income.name)
		invoice.submit()
		return item, invoice
