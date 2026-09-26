"""Custom fields materialised through the Books bridge.

Creating or removing a custom field alters the hosted table, and Frappe commits
around DDL. Integration tests only roll back at the end of a class, so this test
lives in its own class to keep that commit from persisting other tests' records.
"""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.customization import sync_all_custom_forms
from frappe_books.tests.accounting import unique_name
from frappe_books.ui_bridge.database import BooksDatabaseBridge

COLUMN = "custom_books_hostedbridgetestvalue"
FIELD = {
	"label": "Hosted Bridge Test Value",
	"fieldname": "hostedBridgeTestValue",
	"fieldtype": "Data",
	"section": "Default",
	"tab": "Custom",
}
SYSTEM_MANAGER = "books-customizer@example.com"


class IntegrationTestCustomFields(IntegrationTestCase):
	def setUp(self):
		self.bridge = BooksDatabaseBridge()
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 1)
		self.assertFalse(frappe.db.exists("Books Custom Form", "Color"))
		self.addCleanup(self._cleanup_custom_field_test)

	def test_custom_fields_are_materialized_and_round_trip(self):
		color_name = unique_name("Bridge Custom Color")
		self.bridge.insert("CustomForm", {"name": "Color", "customFields": [FIELD]})
		self.assertTrue(frappe.db.exists("Custom Field", {"dt": "Books Color", "fieldname": COLUMN}))

		inserted = self.bridge.insert(
			"Color",
			{
				"name": color_name,
				"hexvalue": "#123456",
				FIELD["fieldname"]: "persisted",
			},
		)

		self.assertEqual(inserted[FIELD["fieldname"]], "persisted")
		self.assertEqual(self.bridge.get("Color", color_name)[FIELD["fieldname"]], "persisted")

	def test_system_manager_removes_fields_without_switching_user(self):
		_make_system_manager()
		with self.set_user(SYSTEM_MANAGER):
			frappe.local.session.data.csrf_token = "books-token"
			_custom_form("Color", [FIELD]).insert()
			self.assertEqual(_field_owner(), SYSTEM_MANAGER)

			frappe.delete_doc("Books Custom Form", "Color")

			self.assertEqual(frappe.local.session.data.csrf_token, "books-token")
		self.assertIsNone(_field_owner())

	def test_migrate_creates_fields_owned_by_the_form_owner(self):
		_make_system_manager()
		with self.set_user(SYSTEM_MANAGER):
			_custom_form("Color", [FIELD]).insert()
		frappe.db.delete("Custom Field", {"dt": "Books Color", "fieldname": COLUMN})

		with patch.dict(frappe.flags, {"in_migrate": True}):
			sync_all_custom_forms()

		self.assertEqual(_field_owner(), SYSTEM_MANAGER)

	def _cleanup_custom_field_test(self):
		for color in frappe.get_all(
			"Books Color", filters={"name": ["like", "Bridge Custom Color%"]}, pluck="name"
		):
			frappe.delete_doc("Books Color", color)
		if frappe.db.exists("Books Custom Form", "Color"):
			frappe.delete_doc("Books Custom Form", "Color")
		if frappe.db.has_column("Books Color", COLUMN):
			frappe.db.sql_ddl(f"alter table `tabBooks Color` drop column `{COLUMN}`")


class IntegrationTestCustomFormValidation(IntegrationTestCase):
	def test_customization_must_be_enabled(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 0)
		self.assertRaisesRegex(
			frappe.ValidationError, "Enable form customization", _custom_form("Color", [FIELD]).insert
		)

	def test_ledger_and_single_schemas_cannot_be_customized(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 1)
		for schema in ("AccountingLedgerEntry", "LoyaltyPointEntry", "SystemSettings", "CustomForm"):
			with self.subTest(schema=schema):
				self.assertRaisesRegex(
					frappe.ValidationError, "cannot be customized", _custom_form(schema, [FIELD]).insert
				)


def _custom_form(schema, fields):
	return frappe.get_doc({"doctype": "Books Custom Form", "name": schema, "custom_fields": fields})


def _field_owner():
	return frappe.db.get_value("Custom Field", {"dt": "Books Color", "fieldname": COLUMN}, "owner")


def _make_system_manager():
	if frappe.db.exists("User", SYSTEM_MANAGER):
		return
	frappe.get_doc(
		{
			"doctype": "User",
			"email": SYSTEM_MANAGER,
			"first_name": "Books Customizer",
			"send_welcome_email": 0,
			"roles": [{"role": "System Manager"}],
		}
	).insert(ignore_permissions=True)
