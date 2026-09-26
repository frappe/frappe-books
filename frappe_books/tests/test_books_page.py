from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.permissions import has_app_permission
from frappe_books.www import books

BOOKS_USER = "books-page-user@example.com"
DESK_USER = "books-page-outsider@example.com"


class IntegrationTestBooksPage(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_make_user(BOOKS_USER, "Books User")
		_make_user(DESK_USER, "Translator")

	def test_page_sets_a_session_csrf_token(self):
		with self.set_user(BOOKS_USER), patch("frappe.sessions.get", return_value={}):
			context = books.get_context(frappe._dict())
			self.assertTrue(context.csrf_token)
			self.assertEqual(context.csrf_token, frappe.local.session.data.csrf_token)

	def test_users_without_a_books_role_are_refused(self):
		with self.set_user(DESK_USER):
			self.assertRaises(frappe.PermissionError, books.get_context, frappe._dict())

	def test_apps_screen_needs_a_books_role(self):
		for user, allowed in ((BOOKS_USER, True), (DESK_USER, False)):
			with self.subTest(user=user), self.set_user(user):
				self.assertEqual(has_app_permission(), allowed)


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
