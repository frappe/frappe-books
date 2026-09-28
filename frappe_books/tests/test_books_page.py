import json
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.permissions import has_app_permission
from frappe_books.tests.accounting import make_account
from frappe_books.www import books

BOOKS_USER = "books-page-user@example.com"
DESK_USER = "books-page-outsider@example.com"
SHARED_USER = "books-page-shared@example.com"


class IntegrationTestBooksPage(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_make_user(BOOKS_USER, "Books User")
		_make_user(DESK_USER, "Translator")
		_make_user(SHARED_USER, "Translator")

	def test_page_sets_a_session_csrf_token(self):
		with self.set_user(BOOKS_USER), patch("frappe.sessions.get", return_value={}):
			context = books.get_context(frappe._dict())
			self.assertTrue(context.csrf_token)
			self.assertEqual(context.csrf_token, frappe.local.session.data.csrf_token)

	def test_page_boot_maps_books_schemas_to_doctypes(self):
		with self.set_user(BOOKS_USER), patch("frappe.sessions.get", return_value={}):
			doctypes = json.loads(books.get_context(frappe._dict()).books_boot)["doctypes"]
		self.assertEqual(doctypes["SalesInvoice"], "Books Sales Invoice")

	def test_users_without_a_books_role_are_refused(self):
		with self.set_user(DESK_USER):
			self.assertRaises(frappe.PermissionError, books.get_context, frappe._dict())

	def test_apps_screen_needs_a_books_role(self):
		for user, allowed in ((BOOKS_USER, True), (DESK_USER, False)):
			with self.subTest(user=user), self.set_user(user):
				self.assertEqual(has_app_permission(), allowed)

	def test_a_user_who_can_read_a_books_document_opens_books(self):
		frappe.share.add("Books Account", make_account("Shared Account").name, SHARED_USER)
		with self.set_user(SHARED_USER):
			self.assertTrue(has_app_permission())


def _make_user(email, role):
	if frappe.db.exists("User", email):
		return
	frappe.get_doc(
		{
			"doctype": "User",
			"email": email,
			"first_name": email.split("@")[0],
			"send_welcome_email": 0,
			"roles": [{"role": role}],
		}
	).insert(ignore_permissions=True)
