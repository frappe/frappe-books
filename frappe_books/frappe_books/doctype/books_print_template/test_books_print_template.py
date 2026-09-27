# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.setup import DEFAULT_PRINT_TEMPLATES, bootstrap, update_standard_print_templates
from frappe_books.tests.accounting import unique_name

# On IntegrationTestCase, the doctype test records and all
# link-field test record dependencies are recursively loaded
# Use these module variables to add/remove to/from that list
EXTRA_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]
IGNORE_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]


class IntegrationTestBooksPrintTemplate(IntegrationTestCase):
	def test_default_templates_use_books_print_layouts(self):
		bootstrap()

		for name in DEFAULT_PRINT_TEMPLATES:
			template = frappe.get_doc("Books Print Template", name)
			self.assertFalse(template.is_custom)
			self.assertIn("<main", template.template)
			self.assertNotEqual(
				template.template,
				'<div class="books-print-template">{{ doc.name }}</div>',
			)

		invoice_template = frappe.get_doc("Books Print Template", "Business - Sales Invoice")
		self.assertIn('v-for="row in doc.items"', invoice_template.template)

	def test_default_templates_repair_legacy_placeholders(self):
		name = "Business - Sales Invoice"
		legacy_template = '<div class="books-print-template">{{ doc.name }}</div>'
		frappe.db.set_value("Books Print Template", name, "template", legacy_template)

		update_standard_print_templates()

		template = frappe.get_doc("Books Print Template", name)
		self.assertNotEqual(template.template, legacy_template)
		self.assertIn("Grand Total", template.template)

	def test_standard_templates_keep_their_shipped_content(self):
		name = "Business - Sales Invoice"
		for fieldname, value in (("template", "<main>{{ doc.name }}</main>"), ("type", "Payment")):
			with self.subTest(fieldname=fieldname):
				template = frappe.get_doc("Books Print Template", name)
				template.set(fieldname, value)
				self.assertRaisesRegex(frappe.ValidationError, "cannot be edited", template.save)

		template = frappe.get_doc("Books Print Template", name)
		template.width = 20
		template.save()
		self.assertRaisesRegex(
			frappe.ValidationError, "cannot be renamed", frappe.rename_doc, template.doctype, name, "Renamed"
		)
		self.assertRaisesRegex(frappe.ValidationError, "cannot be deleted", template.delete)

	def test_custom_templates_need_a_printable_type(self):
		template = frappe.get_doc(
			{
				"doctype": "Books Print Template",
				"name": unique_name("Custom Template"),
				"type": "Account",
				"template": "<main>{{ doc.name }}</main>",
				"is_custom": 0,
			}
		)
		self.assertRaisesRegex(frappe.ValidationError, "cannot be made for Account", template.insert)

		template.type = "SalesInvoice"
		template.insert()
		self.assertTrue(template.is_custom)
