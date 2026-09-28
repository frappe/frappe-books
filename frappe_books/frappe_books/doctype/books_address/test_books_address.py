# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import ensure_user, unique_name
from frappe_books.ui_bridge.database import BooksDatabaseBridge
from frappe_books.ui_bridge.field_properties import get_schema_field_properties

# On IntegrationTestCase, the doctype test records and all
# link-field test record dependencies are recursively loaded
# Use these module variables to add/remove to/from that list
EXTRA_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]
IGNORE_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]


class IntegrationTestBooksAddress(IntegrationTestCase):
	def test_address_display_and_indian_place_of_supply(self):
		address = _address(country="India").insert()
		self.assertEqual(address.pos, "Maharashtra")
		self.assertEqual(address.address_display, "42 Market Road, Mumbai, Maharashtra, India, 400001")

	def test_country_must_be_a_frappe_country(self):
		self.assertRaises(frappe.LinkValidationError, _address(country="Narnia").insert)

	def test_books_user_picks_the_country_from_frappe_countries(self):
		self.assertEqual(get_schema_field_properties("Address")["country"]["options"], "Country")
		with self.set_user(ensure_user("books-address-user@example.com", "Books User")):
			found = BooksDatabaseBridge().call("searchLink", ["Country", "indi", {}, ["name"], 5])
		self.assertIn({"name": "India"}, found)


def _address(country):
	return frappe.get_doc(
		{
			"doctype": "Books Address",
			"name": unique_name("Office"),
			"address_line1": "42 Market Road",
			"city": "Mumbai",
			"state": "Maharashtra",
			"country": country,
			"postal_code": "400001",
		}
	)
