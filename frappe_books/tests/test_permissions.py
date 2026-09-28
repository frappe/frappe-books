from unittest.mock import patch

import frappe
from frappe.permissions import add_user_permission
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party, make_tax
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries
from frappe_books.ui_bridge.database import BooksDatabaseBridge
from frappe_books.ui_bridge.linked_entries import linked_entries

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
	"Books Print Template": (FULL, READ, READ),
	"Books Custom Form": (FULL, READ, READ),
	"Books Ledger Entry": (READ, READ, READ),
	"Books Stock Ledger Entry": (READ, READ, READ),
	"Books Loyalty Point Entry": (READ, READ, READ),
}
TEST_USER = "books-user-permissions@example.com"
MANAGER = "books-manager-permissions@example.com"


class IntegrationTestPermissions(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		for email, role in ((TEST_USER, "Books User"), (MANAGER, "Books Manager")):
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

	def test_books_user_cannot_write_print_template(self):
		template = frappe.get_last_doc("Books Print Template")
		with self.set_user(TEST_USER):
			template.template = "<div>{{ doc.name }}</div>"
			self.assertRaises(frappe.PermissionError, template.save)

	def test_roles_import_the_doctypes_they_create(self):
		for user, doctype, allowed in (
			(TEST_USER, "Books Sales Invoice", True),
			(TEST_USER, "Books Tax", False),
			(MANAGER, "Books Tax", True),
			(MANAGER, "Books Ledger Entry", False),
		):
			with self.subTest(user=user, doctype=doctype), self.set_user(user):
				self.assertEqual(frappe.has_permission(doctype, "import"), allowed)

	def test_bridge_ledger_writes_follow_docperms(self):
		with self.set_user(MANAGER):
			for schema in ("AccountingLedgerEntry", "StockLedgerEntry", "LoyaltyPointEntry"):
				with self.subTest(schema=schema):
					self.assertRaises(frappe.PermissionError, BooksDatabaseBridge().insert, schema, {})

	def test_bridge_hides_fields_above_the_users_permlevel(self):
		party = make_party(make_account("Permlevel Receivable", account_type="Receivable").name)
		party.db_set("email", "hidden@example.com")
		email = frappe.get_meta("Books Party").get_field("email")
		with patch.object(email, "permlevel", 1), self.set_user(TEST_USER):
			self.assertIsNone(BooksDatabaseBridge().get("Party", party.name).get("email"))

	def test_bridge_count_skips_documents_the_user_cannot_read(self):
		readable, hidden = _seed_shipment(), _seed_shipment()
		add_user_permission("Books Shipment", readable, TEST_USER)
		with self.set_user(TEST_USER):
			count = BooksDatabaseBridge().call("count", ["Shipment", {"name": ["in", [readable, hidden]]}])
		self.assertEqual(count, 1)

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
			found = BooksDatabaseBridge().call("searchLink", ["Shipment", "", {}, ["name"], 50])
		self.assertIn(readable, [row["name"] for row in found])
		self.assertNotIn(hidden, [row["name"] for row in found])

	def test_linked_entries_need_the_document_and_hide_unreadable_links(self):
		original = _seed_shipment()
		readable_return = _seed_shipment(return_against=original)
		_seed_shipment(return_against=original)
		for name in (original, readable_return):
			add_user_permission("Books Shipment", name, TEST_USER)
		hidden = _seed_shipment()
		with self.set_user(TEST_USER):
			self.assertEqual(linked_entries("Shipment", original), {"Shipment": [readable_return]})
			self.assertRaises(frappe.PermissionError, linked_entries, "Shipment", hidden)

	def test_pos_amounts_require_invoice_read(self):
		def has_permission(doctype, ptype="read", throw=False, **kwargs):
			if doctype == "Books Sales Invoice":
				raise frappe.PermissionError
			return True

		with patch("frappe.has_permission", has_permission), self.assertRaises(frappe.PermissionError):
			BooksBespokeQueries().call("getPOSTransactedAmount", ["2031-01-01", "2031-01-02"])

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


def _search_shipments(name):
	found = BooksDatabaseBridge().call("search", [name, ["Shipment"], 5])
	return [row["name"] for row in found["Shipment"]]


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
