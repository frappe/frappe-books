# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.setup import DEFAULT_PRINT_TEMPLATES, bootstrap, update_standard_print_templates

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
