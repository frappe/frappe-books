"""Custom fields materialised through the Books bridge.

Creating or removing a custom field alters the hosted table, and Frappe commits
around DDL. Integration tests only roll back at the end of a class, so this test
lives in its own class to keep that commit from persisting other tests' records.
"""

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import unique_name
from frappe_books.ui_bridge.database import BooksDatabaseBridge


class IntegrationTestCustomFields(IntegrationTestCase):
	def setUp(self):
		self.bridge = BooksDatabaseBridge()
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 1)

	def test_custom_fields_are_materialized_and_round_trip(self):
		fieldname = "hostedBridgeTestValue"
		color_name = unique_name("Bridge Custom Color")

		self.assertFalse(frappe.db.exists("Books Custom Form", "Color"))
		self.addCleanup(self._cleanup_custom_field_test, color_name)
		self.bridge.insert(
			"CustomForm",
			{
				"name": "Color",
				"customFields": [
					{
						"label": "Hosted Bridge Test Value",
						"fieldname": fieldname,
						"fieldtype": "Data",
						"section": "Default",
						"tab": "Custom",
					}
				],
			},
		)
		self.assertTrue(
			frappe.db.exists(
				"Custom Field",
				{
					"dt": "Books Color",
					"fieldname": "custom_books_hostedbridgetestvalue",
				},
			)
		)

		inserted = self.bridge.insert(
			"Color",
			{
				"name": color_name,
				"hexvalue": "#123456",
				fieldname: "persisted",
			},
		)

		self.assertEqual(inserted[fieldname], "persisted")
		self.assertEqual(self.bridge.get("Color", color_name)[fieldname], "persisted")

	def _cleanup_custom_field_test(self, color_name):
		if frappe.db.exists("Books Color", color_name):
			self.bridge.delete("Color", color_name)
		if frappe.db.exists("Books Custom Form", "Color"):
			self.bridge.delete("CustomForm", "Color")
		if frappe.db.has_column("Books Color", "custom_books_hostedbridgetestvalue"):
			frappe.db.sql_ddl("alter table `tabBooks Color` drop column `custom_books_hostedbridgetestvalue`")
