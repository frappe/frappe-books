"""Custom fields that Books Custom Forms keep in Frappe Custom Fields.

Creating or removing a custom field alters the hosted table, and Frappe commits
around DDL. Integration tests only roll back at the end of a class, so this test
lives in its own class to keep that commit from persisting other tests' records.
"""

from unittest.mock import patch

import frappe
from frappe import client
from frappe.api.v1 import update_doc
from frappe.tests import IntegrationTestCase

from frappe_books.customization import camel_case
from frappe_books.meta import get_books_meta
from frappe_books.tests.accounting import ensure_user, unique_name

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
	"target": "Books Party",
}
REFERENCE_FIELD = {
	"label": "Hosted Bridge Test Reference",
	"fieldname": "hostedBridgeTestReference",
	"fieldtype": "DynamicLink",
	"references": "custom_books_hostedbridgetestsize",
}
SYSTEM_MANAGER = "books-customizer@example.com"


class IntegrationTestCustomFields(IntegrationTestCase):
	def setUp(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 1)
		self.assertFalse(frappe.db.exists("Books Custom Form", "Books Uom"))
		self.addCleanup(self._cleanup_custom_field_test)

	def test_custom_fields_are_materialized_and_round_trip(self):
		unit_name = unique_name("Bridge Custom Unit")
		_custom_form("Books Uom", [FIELD]).insert()
		self.assertTrue(frappe.db.exists("Custom Field", {"dt": "Books Uom", "fieldname": COLUMN}))

		frappe.get_doc({"doctype": "Books Uom", "name": unit_name, COLUMN: "persisted"}).insert()

		self.assertEqual(frappe.db.get_value("Books Uom", unit_name, COLUMN), "persisted")

	def test_books_meta_places_custom_fields_as_their_form_says(self):
		_custom_form("Books Uom", [FIELD]).insert()

		books_meta = get_books_meta(["Books Uom"])

		placement = {"section": "Default", "tab": "Custom", "books_fieldname": FIELD["fieldname"]}
		self.assertEqual(books_meta["placements"], {"Books Uom": {COLUMN: placement}})
		(unit,) = books_meta["metas"]
		self.assertIn(COLUMN, [field["fieldname"] for field in unit["fields"]])
		with self.set_user(ensure_user("books-meta-outsider@example.com", "Translator")):
			self.assertEqual(get_books_meta(["Books Uom"])["placements"], {})

	def test_system_manager_removes_fields_without_switching_user(self):
		_make_system_manager()
		with self.set_user(SYSTEM_MANAGER):
			frappe.local.session.data.csrf_token = "books-token"
			_custom_form("Books Uom", [FIELD]).insert()
			self.assertEqual(_field_owner(), SYSTEM_MANAGER)

			frappe.delete_doc("Books Custom Form", "Books Uom")

			self.assertEqual(frappe.local.session.data.csrf_token, "books-token")
		self.assertIsNone(_field_owner())

	def test_rest_creates_edits_and_deletes_custom_fields(self):
		client.insert(_form_values("Books Uom", [FIELD, SIZE_FIELD]))
		self.assertEqual(_custom_field(SIZE_FIELD).fieldtype, "Select")

		form = client.get("Books Custom Form", "Books Uom")
		row = _row(form["custom_fields"], FIELD)
		form["custom_fields"] = [{**row, "label": "Renamed", "is_required": 1, "default": "North"}]
		client.save(form)

		self.assertEqual(
			(_custom_field(FIELD).label, _custom_field(FIELD).reqd, _custom_field(FIELD).default),
			("Renamed", 1, "North"),
		)
		self.assertIsNone(_custom_field(SIZE_FIELD))

		client.delete("Books Custom Form", "Books Uom")
		self.assertIsNone(_custom_field(FIELD))

	def test_forms_show_the_definition_their_custom_field_holds(self):
		_custom_form("Books Uom", [FIELD]).insert()

		client.set_value("Custom Field", f"Books Uom-{COLUMN}", "label", "Edited In Frappe")

		row = client.get("Books Custom Form", "Books Uom")["custom_fields"][0]
		self.assertEqual(row["label"], "Edited In Frappe")

	def test_link_options_round_trip_in_frappe_names(self):
		fields = [SIZE_FIELD, PARTY_FIELD, REFERENCE_FIELD]
		_custom_form("Books Uom", fields).insert()

		self.assertEqual(_custom_field(PARTY_FIELD).options, "Books Party")
		self.assertEqual(_custom_field(REFERENCE_FIELD).options, "custom_books_hostedbridgetestsize")
		rows = client.get("Books Custom Form", "Books Uom")["custom_fields"]
		self.assertEqual(_row(rows, PARTY_FIELD)["target"], "Books Party")
		self.assertEqual(_row(rows, REFERENCE_FIELD)["references"], "custom_books_hostedbridgetestsize")

	def test_a_loaded_form_saves_unchanged(self):
		fields = [{**FIELD, "is_required": 1, "default": "North"}, SIZE_FIELD, PARTY_FIELD, REFERENCE_FIELD]
		_custom_form("Books Uom", fields).insert()
		definitions = _definitions(fields)

		frappe.get_doc("Books Custom Form", "Books Uom").save()
		_rest_put("Books Uom", {})

		self.assertEqual(_definitions(fields), definitions)

	def test_rest_put_of_stored_row_columns_changes_only_them(self):
		_custom_form("Books Uom", [FIELD, SIZE_FIELD]).insert()
		definitions = _definitions([FIELD, SIZE_FIELD])
		rows = frappe.get_all(
			"Books Custom Field",
			filters={"parent": "Books Uom"},
			fields=["name", "parent", "parenttype", "parentfield", "fieldname", "section", "tab"],
			order_by="idx",
		)
		rows[0].tab = "Details"

		_rest_put("Books Uom", {"custom_fields": rows})

		self.assertEqual(_definitions([FIELD, SIZE_FIELD]), definitions)
		self.assertEqual(frappe.db.get_value("Books Custom Field", rows[0].name, "tab"), "Details")

	def _cleanup_custom_field_test(self):
		# Custom field DDL commits, so undo what this class committed. `sql_ddl` commits before
		# the drop, not after, so commit the drop too.
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 0)
		for unit in frappe.get_all(
			"Books Uom", filters={"name": ["like", "Bridge Custom Unit%"]}, pluck="name"
		):
			frappe.delete_doc("Books Uom", unit)
		if frappe.db.exists("Books Custom Form", "Books Uom"):
			frappe.delete_doc("Books Custom Form", "Books Uom")
		for column in frappe.db.get_table_columns("Books Uom"):
			if column.startswith("custom_books_hostedbridgetest"):
				frappe.db.sql_ddl(f"alter table `tabBooks Uom` drop column `{column}`")
		frappe.db.commit()  # nosemgrep


class IntegrationTestCustomFormValidation(IntegrationTestCase):
	def test_customization_must_be_enabled(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 0)
		self.assertRaisesRegex(
			frappe.ValidationError, "Enable form customization", _custom_form("Books Uom", [FIELD]).insert
		)

	def test_ledgers_singles_and_unknown_doctypes_cannot_be_customized(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 1)
		for doctype in (
			"Books Ledger Entry",
			"Books Loyalty Point Entry",
			"Books System Settings",
			"Books Custom Field",
			"UOM",
		):
			with self.subTest(doctype=doctype):
				self.assertRaisesRegex(
					frappe.ValidationError, "cannot be customized", _custom_form(doctype, [FIELD]).insert
				)

	def test_invalid_custom_fields_are_rejected(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_form_customization", 1)
		cases = {
			"needs a default": [{**FIELD, "is_required": 1}],
			"already used for Custom Field 1": [FIELD, {**FIELD, "label": "Duplicate"}],
			"already exists for Books Uom": [{**FIELD, "fieldname": "is_whole"}],
			"at least two options": [{**FIELD, "fieldtype": "Select", "options": "Only\n "}],
			"needs a Target": [{**PARTY_FIELD, "target": None}],
			"needs a References": [{**REFERENCE_FIELD, "references": None}],
		}
		for message, fields in cases.items():
			with self.subTest(message=message):
				self.assertRaisesRegex(
					frappe.ValidationError, message, _custom_form("Books Uom", fields).insert
				)


class IntegrationTestCustomFieldnames(IntegrationTestCase):
	def test_a_new_row_is_named_after_its_label_as_lodash_camel_case_names_it(self):
		# Expected names are lodash's camelCase of each label.
		for label, fieldname in (
			("Delivery Date", "deliveryDate"),
			("GST No.", "gstNo"),
			("HTTPServer Port", "httpServerPort"),
			("crème brûlée", "cremeBrulee"),
			("Customer's PO", "customersPo"),
			("2nd Contact", "2ndContact"),
			("Straße Nr", "strasseNr"),
			("ÆON flux", "aeOnFlux"),
			("Имя Клиента", "имяКлиента"),
			("ग्राहक नाम", "ग्राहकनाम"),
			("Size (cm)", "sizeCm"),
		):
			with self.subTest(label=label):
				self.assertEqual(camel_case(label), fieldname)

	def test_preview_names_new_rows_and_keeps_named_ones(self):
		form = _new_custom_form([{**FIELD, "fieldname": None}, {**SIZE_FIELD, "label": "Renamed Size"}])
		form.preview()
		self.assertEqual(
			[row.fieldname for row in form.custom_fields], ["hostedBridgeTestValue", "hostedBridgeTestSize"]
		)

	def test_preview_needs_the_right_to_customize(self):
		form = _new_custom_form([{**FIELD, "fieldname": None}])
		with self.set_user(ensure_user("books-custom-form-user@example.com", "Books User")):
			self.assertRaises(frappe.PermissionError, form.preview)


def _new_custom_form(fields):
	"""An unsaved form, as /books sends one to preview."""
	return frappe.get_doc({**_form_values("Books Uom", fields), "__islocal": 1})


def _custom_form(doctype, fields):
	return frappe.get_doc(_form_values(doctype, fields))


def _form_values(doctype, fields):
	# `get_doc` adds a doctype to each row dict, so give it copies.
	rows = [dict(field) for field in fields]
	return {"doctype": "Books Custom Form", "name": doctype, "custom_fields": rows}


def _custom_field(field):
	filters = {"dt": "Books Uom", "fieldname": f"custom_books_{field['fieldname'].lower()}"}
	name = frappe.db.exists("Custom Field", filters)
	return name and frappe.get_doc("Custom Field", name)


def _definitions(fields):
	values = ["label", "fieldtype", "options", "reqd", "default"]
	return [frappe.db.get_value("Custom Field", _custom_field(field).name, values) for field in fields]


def _rest_put(name, values):
	with patch.dict(frappe.local.form_dict, {"data": frappe.as_json(values)}):
		update_doc("Books Custom Form", name)


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
