from unittest.mock import patch

import frappe
from frappe.client import get_list
from frappe.desk.search import search_widget
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import (
	ensure_user,
	make_account,
	make_invoice,
	make_item,
	make_party,
)

USER = "books-search-user@example.com"
INVOICE = "Books Sales Invoice"
INVOICE_ITEM = "Books Sales Invoice Item"


class IntegrationTestSearchPalette(IntegrationTestCase):
	"""The queries the /books search palette sends for a Books User."""

	def setUp(self):
		self.receivable = make_account("Search Receivable", account_type="Receivable").name

	def test_documents_match_keyword_letters_in_order_within_the_limit(self):
		prefix = frappe.generate_hash(length=6)
		for index in range(3):
			make_party(self.receivable, name=f"Qz{prefix} Marigold {index}")

		found = self._search("Books Party", f"qz{prefix}mrgld", ["name", "email"])

		self.assertEqual(len(found), 2)
		self.assertTrue(all(row.name.startswith(f"Qz{prefix}") for row in found))
		self.assertEqual(self._search("Books Party", f"zq{prefix}", ["name"]), [])

	def test_documents_match_the_doctype_search_fields(self):
		email = f"{frappe.generate_hash(length=8)}@example.com"
		party = make_party(self.receivable, email=email).name

		found = self._search("Books Party", email, ["name", "email", "role", "phone"])

		self.assertEqual([(row.name, row.email) for row in found], [(party, email)])

	def test_table_rows_are_listed_with_their_parent(self):
		item, invoice = self._make_invoice()
		pattern = f"%{'%'.join(item)}%"

		with self.set_user(ensure_user(USER, "Books User")):
			found = get_list(
				INVOICE_ITEM,
				fields=["name", "item", "tax", "parent", "parenttype"],
				filters=[["parenttype", "=", INVOICE]],
				or_filters=[["item", "like", pattern], ["tax", "like", pattern]],
				order_by="idx",
				limit_page_length=5,
				parent=INVOICE,
			)

		self.assertEqual(
			[(row.item, row.parent, row.parenttype) for row in found], [(item, invoice.name, INVOICE)]
		)
		self.assertEqual(self._search(INVOICE, invoice.name, ["name", "docstatus"])[0].docstatus, 1)

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

		with self.set_user(ensure_user(USER, "Books User")), patch.object(frappe.local, "lang", "de"):
			found = search_widget("Books Account", translated.lower(), page_length=5, as_dict=True)

		self.assertEqual([row.name for row in found], [account])

	def _search(self, doctype, word, fields):
		with self.set_user(ensure_user(USER, "Books User")):
			return search_widget(doctype, "%".join(word), page_length=2, filter_fields=fields, as_dict=True)

	def _make_invoice(self):
		income = make_account("Search Income", root_type="Income", account_type="Income Account")
		expense = make_account("Search Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		item = make_item(income.name, expense.name).name
		party = make_party(self.receivable).name
		invoice = make_invoice(INVOICE, party, self.receivable, item, income.name)
		invoice.submit()
		return item, invoice
