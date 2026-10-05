from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.boot import extend_bootinfo
from frappe_books.meta import get_books_meta
from frappe_books.permissions import has_app_permission
from frappe_books.regional import INDIAN_STATES
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

	def test_boot_sends_the_indian_states(self):
		bootinfo = frappe._dict()
		extend_bootinfo(bootinfo)
		self.assertEqual(bootinfo.books["indian_states"], INDIAN_STATES)

	def test_books_meta_holds_each_doctype_and_its_tables_once(self):
		with self.set_user(BOOKS_USER):
			metas = get_books_meta(["Books Sales Invoice", "Books Purchase Invoice"])["metas"]

		names = [meta["name"] for meta in metas]
		self.assertEqual(len(names), len(set(names)))
		for doctype in ("Books Sales Invoice", "Books Sales Invoice Item", "Books Tax Summary"):
			self.assertIn(doctype, names)
		invoice = next(meta for meta in metas if meta["name"] == "Books Sales Invoice")
		self.assertIn("party", [field["fieldname"] for field in invoice["fields"]])

	def test_boot_country_code_comes_from_the_system_settings_country(self):
		bootinfo = frappe._dict()
		with self.change_settings("System Settings", country="Switzerland"):
			extend_bootinfo(bootinfo)
		self.assertEqual(bootinfo.books["country_code"], "ch")

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
