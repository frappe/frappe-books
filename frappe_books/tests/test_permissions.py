from unittest.mock import patch

import frappe
from frappe import client
from frappe.api.v2 import count, read_doc
from frappe.desk.query_report import get_report_doc
from frappe.desk.search import search_link
from frappe.permissions import add_user_permission
from frappe.tests import IntegrationTestCase

from frappe_books.linked_entries import get_linked_entries
from frappe_books.reports.dashboard import (
	get_cashflow,
	get_invoice_summary,
	get_profit_and_loss,
	get_top_expenses,
)
from frappe_books.reports.financial_statements import get_account_balances
from frappe_books.search import BooksSearch, build_search_index, search
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
NONE = set()
CREATE = {"read", "write", "create"}
SUBMIT = CREATE | {"submit"}
ROLES = ("System Manager", "Books Manager", "Books Sales User", "Books Purchase User", "Books Stock User")
# Rights of each role, in ROLES order
ROLE_MATRIX = {
	"Books Sales Invoice": (FULL_SUBMIT, FULL_SUBMIT, SUBMIT, NONE, READ),
	"Books Purchase Invoice": (FULL_SUBMIT, FULL_SUBMIT, NONE, SUBMIT, READ),
	"Books Sales Quote": (FULL_SUBMIT, FULL_SUBMIT, SUBMIT | {"cancel", "amend"}, NONE, NONE),
	"Books Payment": (FULL_SUBMIT, FULL_SUBMIT, SUBMIT, READ, NONE),
	"Books Stock Movement": (FULL_SUBMIT, FULL_SUBMIT, NONE, NONE, SUBMIT),
	"Books Journal Entry": (FULL_SUBMIT, FULL_SUBMIT, NONE, NONE, NONE),
	"Books Party": (FULL, FULL, CREATE, CREATE, READ),
	"Books Item": (FULL, FULL, READ, CREATE, CREATE),
	"Books Tax": (FULL, FULL, READ, READ, READ),
	"Books Defaults": (FULL, FULL, READ, READ, READ),
	"Print Format": (FULL, FULL, READ, READ, READ),
	"Books Custom Form": (FULL, READ, READ, READ, READ),
	"Books Ledger Entry": (READ, READ, NONE, NONE, NONE),
	"Books Stock Ledger Entry": (READ, READ, READ, READ, READ),
	"Books Loyalty Point Entry": (READ, READ, READ, NONE, NONE),
}
FINANCIAL_REPORTS = (
	"Books General Ledger",
	"Books Profit and Loss",
	"Books Balance Sheet",
	"Books Trial Balance",
	"Books GSTR-1",
	"Books GSTR-2",
)
STOCK_REPORTS = ("Books Stock Ledger", "Books Stock Balance")
SALES_USER = "books-sales-permissions@example.com"
STOCK_USER = "books-stock-permissions@example.com"
MANAGER = "books-manager-permissions@example.com"
SYSTEM_MANAGER = "books-system-manager-permissions@example.com"


class IntegrationTestPermissions(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		for email, role in (
			(SALES_USER, "Books Sales User"),
			(STOCK_USER, "Books Stock User"),
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
		for doctype, expected in ROLE_MATRIX.items():
			for role, rights in zip(ROLES, expected, strict=True):
				with self.subTest(doctype=doctype, role=role):
					self.assertEqual(_role_rights(doctype, role), rights)

	def test_sales_user_submits_but_cannot_cancel_invoice(self):
		invoice = self._make_invoice_as(SALES_USER)
		with self.set_user(SALES_USER):
			invoice.submit()
			self.assertEqual(invoice.docstatus, 1)
			self.assertRaises(frappe.PermissionError, invoice.cancel)

	def test_with_pos_on_only_managers_go_past_its_discount_limit_on_any_invoice(self):
		_set_pos_discount_limit(pos_enabled=1)
		self.assertRaisesRegex(
			frappe.ValidationError,
			"does not allow editing the discount",
			self._make_invoice_as,
			SALES_USER,
			discount=10,
		)
		self.assertEqual(self._make_invoice_as(MANAGER, discount=10).items[0].item_discount_percent, 10)

	def test_with_pos_off_sales_users_discount_any_invoice(self):
		_set_pos_discount_limit(pos_enabled=0)
		self.assertEqual(self._make_invoice_as(SALES_USER, discount=10).items[0].item_discount_percent, 10)

	def test_only_managers_open_financial_reports(self):
		for report in FINANCIAL_REPORTS:
			with self.subTest(report=report):
				for user in (SALES_USER, STOCK_USER):
					with self.set_user(user):
						self.assertRaises(frappe.PermissionError, get_report_doc, report)
				for user in (MANAGER, SYSTEM_MANAGER):
					with self.set_user(user):
						get_report_doc(report)

	def test_stock_users_open_stock_reports_sales_users_do_not(self):
		for report in STOCK_REPORTS:
			with self.subTest(report=report):
				with self.set_user(STOCK_USER):
					get_report_doc(report)
				with self.set_user(SALES_USER):
					self.assertRaises(frappe.PermissionError, get_report_doc, report)

	def test_sales_user_gets_invoice_totals_but_no_ledger_totals(self):
		with self.set_user(SALES_USER):
			get_invoice_summary("Books Sales Invoice", "This Month")
			for method in (get_cashflow, get_profit_and_loss, get_top_expenses):
				with self.subTest(method=method.__name__):
					self.assertRaises(frappe.PermissionError, method, "This Month")
			self.assertRaises(frappe.PermissionError, get_account_balances)

	def test_sales_user_cannot_write_config(self):
		account = make_account("Permission Tax", account_type="Tax")
		with self.set_user(SALES_USER):
			self.assertRaises(frappe.PermissionError, make_tax, account.name)

	def test_books_manager_writes_print_formats_sales_user_prints(self):
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
		with self.set_user(SALES_USER):
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
			(SALES_USER, "Books Sales Invoice", False),
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
		with self.set_user(SALES_USER):
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
		with patch.object(email, "permlevel", 1), self.set_user(SALES_USER):
			self.assertIsNone(read_doc("Books Party", party.name).get("email"))

	def test_counts_skip_documents_the_user_cannot_read(self):
		readable, hidden = _seed_shipment(), _seed_shipment()
		add_user_permission("Books Shipment", readable, SALES_USER)
		filters = [["name", "in", [readable, hidden]]]
		with self.set_user(SALES_USER), patch.dict(frappe.form_dict, {"filters": filters}):
			self.assertEqual(count("Books Shipment"), 1)

	def test_search_skips_documents_the_user_cannot_read(self):
		readable, hidden = _seed_shipment(), _seed_shipment()
		add_user_permission("Books Shipment", readable, SALES_USER)
		build_search_index()
		BooksSearch().index_documents_by_name("Books Shipment", [readable, hidden])
		with self.set_user(SALES_USER):
			self.assertEqual(_search_shipments(hidden), [])
			self.assertEqual(_search_shipments(readable), [readable])

	def test_link_search_skips_documents_the_user_cannot_read(self):
		readable, hidden = _seed_shipment(), _seed_shipment()
		add_user_permission("Books Shipment", readable, SALES_USER)
		with self.set_user(SALES_USER):
			found = [row["value"] for row in search_link("Books Shipment", "", page_length=50)]
		self.assertIn(readable, found)
		self.assertNotIn(hidden, found)

	def test_linked_entries_need_the_document_and_hide_unreadable_links(self):
		original = _seed_shipment()
		readable_return = _seed_shipment(return_against=original)
		_seed_shipment(return_against=original)
		for name in (original, readable_return):
			add_user_permission("Books Shipment", name, SALES_USER)
		hidden = _seed_shipment()
		with self.set_user(SALES_USER):
			self.assertEqual(
				get_linked_entries("Books Shipment", original), {"Books Shipment": [readable_return]}
			)
			self.assertRaises(frappe.PermissionError, get_linked_entries, "Books Shipment", hidden)

	def _make_invoice_as(self, user, discount=0):
		receivable = make_account("Permission Receivable", account_type="Receivable")
		income = make_account("Permission Income", root_type="Income", account_type="Income Account")
		expense = make_account("Permission Expense", root_type="Expense", account_type="Expense Account")
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		row = {
			"item": item.name,
			"account": income.name,
			"rate": 100,
			"quantity": 2,
			"item_discount_percent": discount,
		}
		with self.set_user(user):
			return make_invoice(
				"Books Sales Invoice", party.name, receivable.name, item.name, income.name, items=[row]
			)


def _set_pos_discount_limit(pos_enabled):
	frappe.db.set_single_value("Books Accounting Settings", "enable_discounting", 1)
	frappe.db.set_single_value("Books Inventory Settings", "enable_point_of_sale", pos_enabled)
	frappe.db.set_single_value("Books Pos Settings", {"pos_profile": None, "can_edit_discount": 0})


def _role_rights(doctype, role):
	rows = [row for row in frappe.get_meta(doctype).permissions if row.role == role and not row.permlevel]
	return {right for right in RIGHTS for row in rows if row.get(right)}


def _new_data_import():
	return frappe.get_doc(
		{"doctype": "Data Import", "reference_doctype": "Books Party", "import_type": "Insert New Records"}
	)


def _search_shipments(name):
	return [row["name"] for row in search(name, ["Books Shipment"])]


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
