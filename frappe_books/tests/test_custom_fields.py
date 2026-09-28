"""Custom fields materialised through the Books bridge.

Creating or removing a custom field alters the hosted table, and Frappe commits
around DDL. Integration tests only roll back at the end of a class, so this test
lives in its own class to keep that commit from persisting other tests' records.
"""

import frappe
from frappe import client
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import unique_name
from frappe_books.ui_api import get_field_properties
from frappe_books.ui_bridge.database import BooksDatabaseBridge

COLUMN = "custom_books_hostedbridgetestvalue"
FIELD = {
	"label": "Hosted Bridge Test Value",
	"fieldname": "hostedBridgeTestValue",
	"fieldtype": "Data",
	"section": "Default",
	"tab": "Custom",
}
SIZE_FIELD = {
	"label": "Hosted Bridge Test Size",
	"fieldname": "hostedBridgeTestSize",
	"fieldtype": "Select",
	"options": "Small\nLarge",
}
PARTY_FIELD = {
	"label": "Hosted Bridge Test Party",
	"fieldname": "hostedBridgeTestParty",
	"fieldtype": "Link",
	"target": "Party",
}
REFERENCE_FIELD = {
	"label": "Hosted Bridge Test Reference",
	"fieldname": "hostedBridgeTestReference",
	"fieldtype": "DynamicLink",
	"references": "hostedBridgeTestSize",
}
SYSTEM_MANAGER = "books-customizer@example.com"


class IntegrationTestCustomFields(IntegrationTestCase):
	def setUp(self):
		self.bridge = BooksDatabaseBridge()
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 1)
		self.assertFalse(frappe.db.exists("Books Custom Form", "UOM"))
		self.addCleanup(self._cleanup_custom_field_test)

	def test_custom_fields_are_materialized_and_round_trip(self):
		unit_name = unique_name("Bridge Custom Unit")
		self.bridge.insert("CustomForm", {"name": "UOM", "customFields": [FIELD]})
		self.assertTrue(frappe.db.exists("Custom Field", {"dt": "Books Uom", "fieldname": COLUMN}))

		inserted = self.bridge.insert(
			"UOM",
			{
				"name": unit_name,
				FIELD["fieldname"]: "persisted",
			},
		)

		self.assertEqual(inserted[FIELD["fieldname"]], "persisted")
		self.assertEqual(self.bridge.get("UOM", unit_name)[FIELD["fieldname"]], "persisted")

	def test_custom_fields_are_served_under_their_books_names(self):
		self.bridge.insert("CustomForm", {"name": "UOM", "customFields": [FIELD]})

		self.assertEqual(
			get_field_properties()["UOM"][FIELD["fieldname"]],
			{"fieldtype": "Data", "label": FIELD["label"]},
		)

	def test_system_manager_removes_fields_without_switching_user(self):
		_make_system_manager()
		with self.set_user(SYSTEM_MANAGER):
			frappe.local.session.data.csrf_token = "books-token"
			_custom_form("UOM", [FIELD]).insert()
			self.assertEqual(_field_owner(), SYSTEM_MANAGER)

			frappe.delete_doc("Books Custom Form", "UOM")

			self.assertEqual(frappe.local.session.data.csrf_token, "books-token")
		self.assertIsNone(_field_owner())

	def test_bridge_creates_edits_and_deletes_custom_fields(self):
		self.bridge.insert("CustomForm", {"name": "UOM", "customFields": [FIELD, SIZE_FIELD]})
		self.assertEqual(_custom_field(FIELD).label, FIELD["label"])
		self.assertEqual(_custom_field(SIZE_FIELD).options, SIZE_FIELD["options"])

		form = self.bridge.get("CustomForm", "UOM")
		row = _row(form["customFields"], FIELD)
		form["customFields"] = [{**row, "label": "Renamed", "isRequired": 1, "default": "North"}]
		self.bridge.update("CustomForm", form)

		self.assertEqual(
			(_custom_field(FIELD).label, _custom_field(FIELD).reqd, _custom_field(FIELD).default),
			("Renamed", 1, "North"),
		)
		self.assertIsNone(_custom_field(SIZE_FIELD))

		self.bridge.delete("CustomForm", "UOM")
		self.assertIsNone(_custom_field(FIELD))

	def test_rest_creates_edits_and_deletes_custom_fields(self):
		client.insert(_form_values("UOM", [FIELD, SIZE_FIELD]))
		self.assertEqual(_custom_field(SIZE_FIELD).fieldtype, "Select")

		form = client.get("Books Custom Form", "UOM")
		row = _row(form["custom_fields"], SIZE_FIELD)
		form["custom_fields"] = [{**row, "options": "Small\nMedium\nLarge"}]
		client.save(form)

		self.assertEqual(_custom_field(SIZE_FIELD).options, "Small\nMedium\nLarge")
		self.assertIsNone(_custom_field(FIELD))

		client.delete("Books Custom Form", "UOM")
		self.assertIsNone(_custom_field(SIZE_FIELD))

	def test_forms_show_the_definition_their_custom_field_holds(self):
		self.bridge.insert("CustomForm", {"name": "UOM", "customFields": [FIELD]})

		client.set_value("Custom Field", f"Books Uom-{COLUMN}", "label", "Edited In Frappe")

		row = self.bridge.get("CustomForm", "UOM")["customFields"][0]
		self.assertEqual(row["label"], "Edited In Frappe")
		self.assertEqual(get_field_properties()["UOM"][FIELD["fieldname"]]["label"], "Edited In Frappe")

	def test_link_options_round_trip_in_books_names(self):
		fields = [SIZE_FIELD, PARTY_FIELD, REFERENCE_FIELD]
		self.bridge.insert("CustomForm", {"name": "UOM", "customFields": fields})

		self.assertEqual(_custom_field(PARTY_FIELD).options, "Books Party")
		self.assertEqual(_custom_field(REFERENCE_FIELD).options, "custom_books_hostedbridgetestsize")
		rows = self.bridge.get("CustomForm", "UOM")["customFields"]
		self.assertEqual(_row(rows, PARTY_FIELD)["target"], "Party")
		self.assertEqual(_row(rows, REFERENCE_FIELD)["references"], SIZE_FIELD["fieldname"])

	def _cleanup_custom_field_test(self):
		# Custom field DDL commits, so undo what this class committed. `sql_ddl` commits before
		# the drop, not after, so commit the drop too.
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 0)
		for unit in frappe.get_all(
			"Books Uom", filters={"name": ["like", "Bridge Custom Unit%"]}, pluck="name"
		):
			frappe.delete_doc("Books Uom", unit)
		if frappe.db.exists("Books Custom Form", "UOM"):
			frappe.delete_doc("Books Custom Form", "UOM")
		for column in frappe.db.get_table_columns("Books Uom"):
			if column.startswith("custom_books_hostedbridgetest"):
				frappe.db.sql_ddl(f"alter table `tabBooks Uom` drop column `{column}`")
		frappe.db.commit()  # nosemgrep


class IntegrationTestCustomFormValidation(IntegrationTestCase):
	def test_customization_must_be_enabled(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 0)
		self.assertRaisesRegex(
			frappe.ValidationError, "Enable form customization", _custom_form("UOM", [FIELD]).insert
		)

	def test_ledger_and_single_schemas_cannot_be_customized(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 1)
		for schema in ("AccountingLedgerEntry", "LoyaltyPointEntry", "SystemSettings", "CustomForm"):
			with self.subTest(schema=schema):
				self.assertRaisesRegex(
					frappe.ValidationError, "cannot be customized", _custom_form(schema, [FIELD]).insert
				)

	def test_invalid_custom_fields_are_rejected(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 1)
		cases = {
			"needs a default": [{**FIELD, "is_required": 1}],
			"must be unique": [FIELD, {**FIELD, "label": "Duplicate"}],
			"at least two options": [{**FIELD, "fieldtype": "Select", "options": "Only\n "}],
		}
		for message, fields in cases.items():
			with self.subTest(message=message):
				self.assertRaisesRegex(frappe.ValidationError, message, _custom_form("UOM", fields).insert)


def _custom_form(schema, fields):
	return frappe.get_doc(_form_values(schema, fields))


def _form_values(schema, fields):
	# `get_doc` adds a doctype to each row dict, so give it copies.
	rows = [dict(field) for field in fields]
	return {"doctype": "Books Custom Form", "name": schema, "custom_fields": rows}


def _custom_field(field):
	filters = {"dt": "Books Uom", "fieldname": f"custom_books_{field['fieldname'].lower()}"}
	name = frappe.db.exists("Custom Field", filters)
	return name and frappe.get_doc("Custom Field", name)


def _row(rows, field):
	return next(row for row in rows if row["fieldname"] == field["fieldname"])


def _field_owner():
	return frappe.db.get_value("Custom Field", {"dt": "Books Uom", "fieldname": COLUMN}, "owner")


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
