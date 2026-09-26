import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party, make_tax

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
}
TEST_USER = "books-user-permissions@example.com"


class IntegrationTestPermissions(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		if not frappe.db.exists("User", TEST_USER):
			frappe.get_doc(
				{
					"doctype": "User",
					"email": TEST_USER,
					"first_name": "Books User",
					"send_welcome_email": 0,
					"roles": [{"role": "Books User"}],
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
