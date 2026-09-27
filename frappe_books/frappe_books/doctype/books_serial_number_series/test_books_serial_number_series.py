# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.series import new_item_names
from frappe_books.tests.accounting import ensure_user, make_account, make_item
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries

BOOKS_USER = "books-series-user@example.com"
NO_ROLE_USER = "books-series-no-role@example.com"


class IntegrationTestBooksSerialNumberSeries(IntegrationTestCase):
	def setUp(self):
		self.prefix = f"SN{frappe.generate_hash(length=6)}-"
		self.item = make_series_item(has_serial_number=1, serial_number_series=self.prefix)

	def test_names_continue_across_requests(self):
		first = new_item_names("Books Serial Number", self.item, 2)
		second = new_item_names("Books Serial Number", self.item, 3)

		self.assertEqual(first + second, [f"{self.prefix}{number}" for number in range(1001, 1006)])
		self.assertEqual(frappe.db.get_value("Books Serial Number Series", self.prefix, "current"), 1005)

	def test_names_skip_hand_made_serial_numbers(self):
		taken = f"{self.prefix}1002"
		frappe.get_doc({"doctype": "Books Serial Number", "name": taken, "item": self.item}).insert()

		names = new_item_names("Books Serial Number", self.item, 2)

		self.assertEqual(names, [f"{self.prefix}1001", f"{self.prefix}1003"])

	def test_item_without_serial_numbers_gets_no_names(self):
		frappe.db.set_value("Books Item", self.item, "has_serial_number", 0)

		self.assertEqual(new_item_names("Books Serial Number", self.item, 1), [])

	def test_books_user_reserves_names_through_the_bridge(self):
		with self.set_user(ensure_user(BOOKS_USER, "Books User")):
			names = BooksBespokeQueries().call("getNewSeriesNames", ["SerialNumber", self.item, 1])

		self.assertEqual(names, [f"{self.prefix}1001"])

	def test_names_require_permission_to_create_serial_numbers(self):
		with self.set_user(ensure_user(NO_ROLE_USER)):
			self.assertRaises(
				frappe.PermissionError,
				BooksBespokeQueries().call,
				"getNewSeriesNames",
				["SerialNumber", self.item, 1],
			)


def make_series_item(**values):
	income = make_account("Series Income", root_type="Income")
	received = make_account("Series Received", root_type="Liability")
	return make_item(income.name, received.name, track_item=1, **values).name
