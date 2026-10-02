from unittest.mock import patch

import frappe
from frappe import client
from frappe.api.v2 import count, read_doc
from frappe.desk.search import search_link, search_widget
from frappe.permissions import add_user_permission
from frappe.tests import IntegrationTestCase

from frappe_books.linked_entries import get_linked_entries
from frappe_books.tests.accounting import (
	make_account,
	make_invoice,
	make_item,
	make_party,
	make_tax,
	unique_name,
)

RIGHTS = ("read", "write", "create", "delete", "submit", "cancel", "amend")
FULL = {"read", "write", "create", "delete"}
FULL_SUBMIT = FULL | {"submit", "cancel", "amend"}
READ = {"read"}
ROLE_MATRIX = {
	"Books Sales Invoice": (FULL_SUBMIT, FULL_SUBMIT, {"read", "write", "create", "submit"}),
	"Books Sales Quote": (FULL_SUBMIT, FULL_SUBMIT, {"read", "write", "create", "submit", "cancel", "amend"}),
	"Books Journal Entry": (FULL_SUBMIT, FULL_SUBMIT, READ),
	"Books Party": (FULL, FULL, {"read", "write", "create"}),
	"Books Tax": (FULL, FULL, READ),
	"Books Defaults": (FULL, FULL, READ),
	"Print Format": (FULL, FULL, READ),
	"Books Custom Form": (FULL, READ, READ),
	"Books Ledger Entry": (READ, READ, READ),
	"Books Stock Ledger Entry": (READ, READ, READ),
	"Books Loyalty Point Entry": (READ, READ, READ),
}
TEST_USER = "books-user-permissions@example.com"
MANAGER = "books-manager-permissions@example.com"
SYSTEM_MANAGER = "books-system-manager-permissions@example.com"


class IntegrationTestPermissions(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		for email, role in (
			(TEST_USER, "Books User"),
			(MANAGER, "Books Manager"),
			(SYSTEM_MANAGER, "System Manager"),
		):
			if not frappe.db.exists("User", email):
				frappe.get_doc(
					{
						"doctype": "User",
						"email": email,
						"first_name": role,
						"send_welcome_email": 0,
						"roles": [{"role": role}],
					}
				).insert(ignore_permissions=True)

	def test_role_matrix(self):
		roles = ("System Manager", "Books Manager", "Books User")
		for doctype, expected in ROLE_MATRIX.items():
			for role, rights in zip(roles, expected, strict=True):
				with self.subTest(doctype=doctype, role=role):
					self.assertEqual(_role_rights(doctype, role), rights)

	def test_books_user_submits_but_cannot_cancel_invoice(self):
		invoice = self._make_invoice_as_books_user()
		with self.set_user(TEST_USER):
			invoice.submit()
			self.assertEqual(invoice.docstatus, 1)
			self.assertRaises(frappe.PermissionError, invoice.cancel)

	def test_books_user_cannot_write_config(self):
		account = make_account("Permission Tax", account_type="Tax")
		with self.set_user(TEST_USER):
			self.assertRaises(frappe.PermissionError, make_tax, account.name)

	def test_books_manager_writes_print_formats_books_user_prints(self):
		with self.set_user(MANAGER):
			print_format = frappe.get_doc(
				{
					"doctype": "Print Format",
					"name": unique_name("Manager Format"),
					"doc_type": "Books Sales Invoice",
					"custom_format": 1,
					"html": "<div>{{ doc.name }}</div>",
				}
			).insert()
		with self.set_user(TEST_USER):
			self.assertTrue(frappe.has_permission("Print Format", "print"))
			print_format.html = "<p>{{ doc.name }}</p>"
			self.assertRaises(frappe.PermissionError, print_format.save)

	def test_only_managers_import(self):
		importable = frappe.get_all(
			"DocType", filters={"module": "Frappe Books", "allow_import": 1}, pluck="name"
		)
		for doctype in importable:
			with self.subTest(doctype=doctype):
				importers = {perm.role for perm in frappe.get_meta(doctype).permissions if perm.get("import")}
				self.assertEqual(importers, {"Books Manager", "System Manager"})

		for user, doctype, allowed in (
			(TEST_USER, "Books Sales Invoice", False),
			(MANAGER, "Books Sales Invoice", True),
			(SYSTEM_MANAGER, "Books Sales Invoice", True),
			(MANAGER, "Books Ledger Entry", False),
		):
			with self.subTest(user=user, doctype=doctype), self.set_user(user):
				self.assertEqual(frappe.has_permission(doctype, "import"), allowed)

	def test_only_books_manager_starts_data_imports(self):
		with self.set_user(MANAGER):
			own = _new_data_import().insert()
			self.assertTrue(own.has_permission("write"))
		with self.set_user(TEST_USER):
			self.assertRaises(frappe.PermissionError, _new_data_import().insert)

	def test_books_manager_reads_only_its_own_data_imports(self):
		other = _new_data_import().insert()
		with self.set_user(MANAGER):
			self.assertFalse(frappe.has_permission("Data Import", "read", other))

	def test_ledger_writes_follow_docperms(self):
		with self.set_user(MANAGER):
			for doctype in ("Books Ledger Entry", "Books Stock Ledger Entry", "Books Loyalty Point Entry"):
				with self.subTest(doctype=doctype):
					self.assertRaises(frappe.PermissionError, client.insert, {"doctype": doctype})

	def test_documents_hide_fields_above_the_users_permlevel(self):
		party = make_party(make_account("Permlevel Receivable", account_type="Receivable").name)
		party.db_set("email", "hidden@example.com")
		email = frappe.get_meta("Books Party").get_field("email")
		with patch.object(email, "permlevel", 1), self.set_user(TEST_USER):
			self.assertIsNone(read_doc("Books Party", party.name).get("email"))

	def test_counts_skip_documents_the_user_cannot_read(self):
		readable, hidden = _seed_shipment(), _seed_shipment()
		add_user_permission("Books Shipment", readable, TEST_USER)
		filters = [["name", "in", [readable, hidden]]]
		with self.set_user(TEST_USER), patch.dict(frappe.form_dict, {"filters": filters}):
			self.assertEqual(count("Books Shipment"), 1)

	def test_search_skips_documents_the_user_cannot_read(self):
		readable, hidden = _seed_shipment(), _seed_shipment()
		add_user_permission("Books Shipment", readable, TEST_USER)
		with self.set_user(TEST_USER):
			self.assertEqual(_search_shipments(hidden), [])
			self.assertEqual(_search_shipments(readable), [readable])

	def test_link_search_skips_documents_the_user_cannot_read(self):
		readable, hidden = _seed_shipment(), _seed_shipment()
		add_user_permission("Books Shipment", readable, TEST_USER)
		with self.set_user(TEST_USER):
			found = [row["value"] for row in search_link("Books Shipment", "", page_length=50)]
		self.assertIn(readable, found)
		self.assertNotIn(hidden, found)

	def test_linked_entries_need_the_document_and_hide_unreadable_links(self):
		original = _seed_shipment()
		readable_return = _seed_shipment(return_against=original)
		_seed_shipment(return_against=original)
		for name in (original, readable_return):
			add_user_permission("Books Shipment", name, TEST_USER)
		hidden = _seed_shipment()
		with self.set_user(TEST_USER):
			self.assertEqual(
				get_linked_entries("Books Shipment", original), {"Books Shipment": [readable_return]}
			)
			self.assertRaises(frappe.PermissionError, get_linked_entries, "Books Shipment", hidden)

	def _make_invoice_as_books_user(self):
		receivable = make_account("Permission Receivable", account_type="Receivable")
		income = make_account("Permission Income", root_type="Income", account_type="Income Account")
		expense = make_account("Permission Expense", root_type="Expense", account_type="Expense Account")
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		with self.set_user(TEST_USER):
			return make_invoice("Books Sales Invoice", party.name, receivable.name, item.name, income.name)


def _role_rights(doctype, role):
	rows = [row for row in frappe.get_meta(doctype).permissions if row.role == role and not row.permlevel]
	return {right for right in RIGHTS for row in rows if row.get(right)}


def _new_data_import():
	return frappe.get_doc(
		{"doctype": "Data Import", "reference_doctype": "Books Party", "import_type": "Insert New Records"}
	)


def _search_shipments(name):
	found = search_widget("Books Shipment", name, page_length=5, filter_fields=["name"], as_dict=True)
	return [row.name for row in found]


def _seed_shipment(return_against=None):
	doc = frappe.get_doc(
		{
			"doctype": "Books Shipment",
			"name": frappe.generate_hash(),
			"docstatus": 1,
			"return_against": return_against,
			"items": [{"item": "Keyboard", "quantity": 1}],
		}
	)
	doc.db_insert()
	doc.items[0].db_insert()
	return doc.name
