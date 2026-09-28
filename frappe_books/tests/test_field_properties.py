from frappe.custom.doctype.property_setter.property_setter import make_property_setter
from frappe.tests import IntegrationTestCase

from frappe_books.tests.test_books_page import _make_user
from frappe_books.ui_api import get_field_properties

BOOKS_USER = "books-field-properties@example.com"
DESK_USER = "books-field-properties-outsider@example.com"


class IntegrationTestFieldProperties(IntegrationTestCase):
	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		_make_user(BOOKS_USER, "Books User")
		_make_user(DESK_USER, "Translator")

	def test_properties_use_books_schema_and_field_names(self):
		with self.set_user(BOOKS_USER):
			properties = get_field_properties()

		invoice = properties["SalesInvoice"]
		self.assertEqual(invoice["party"], {"fieldtype": "Link", "options": "Party", "reqd": 1})
		self.assertEqual(invoice["items"]["options"], "SalesInvoiceItem")
		self.assertEqual(invoice["isPOS"], {"fieldtype": "Check", "default": "0"})
		self.assertEqual(properties["PaymentFor"]["referenceName"]["options"], "referenceType")
		self.assertEqual(properties["SalesQuote"]["referenceType"]["default"], "Party")

	def test_number_series_defaults_to_the_series_prefix(self):
		with self.set_user(BOOKS_USER):
			properties = get_field_properties()

		self.assertEqual(properties["SalesInvoice"]["numberSeries"]["default"], "SINV-")
		self.assertEqual(properties["Payment"]["numberSeries"]["default"], "PAY-")

	def test_status_carries_the_doctype_state_colours(self):
		with self.set_user(BOOKS_USER):
			properties = get_field_properties()

		self.assertEqual(properties["SalesInvoice"]["status"]["states"]["Partly Paid"], "Orange")
		self.assertEqual(properties["Lead"]["status"]["states"]["Do not Contact"], "Red")
		self.assertNotIn("states", properties["SalesInvoice"]["party"])

	def test_customize_form_changes_are_served(self):
		make_property_setter("Books Party", "email", "reqd", 1, "Check")

		with self.set_user(BOOKS_USER):
			self.assertEqual(get_field_properties()["Party"]["email"]["reqd"], 1)

	def test_only_readable_schemas_and_their_tables_are_served(self):
		with self.set_user(BOOKS_USER):
			self.assertIn("SalesInvoiceItem", get_field_properties())
		with self.set_user(DESK_USER):
			# Every user may read Frappe's Country.
			self.assertEqual(list(get_field_properties()), ["Country"])
