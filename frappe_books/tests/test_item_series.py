import frappe
from frappe.model.naming import NamingSeries
from frappe.tests import IntegrationTestCase

from frappe_books.series import new_item_names
from frappe_books.tests.accounting import ensure_user, make_account, make_item
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries

BOOKS_USER = "books-series-user@example.com"
NO_ROLE_USER = "books-series-no-role@example.com"


class IntegrationTestItemSeries(IntegrationTestCase):
	def setUp(self):
		self.prefix = f"SN{frappe.generate_hash(length=6)}-"
		self.item = make_series_item(has_serial_number=1, serial_number_series=self.prefix)

	def test_names_count_in_frappe_series_from_1001(self):
		first = new_item_names("Books Serial Number", self.item, 2)
		second = new_item_names("Books Serial Number", self.item, 3)

		self.assertEqual(first + second, [f"{self.prefix}{number}" for number in range(1001, 1006)])
		self.assertEqual(NamingSeries(f"{self.prefix}.####").get_current_value(), 1005)

	def test_names_continue_from_the_series_counter(self):
		NamingSeries(f"{self.prefix}.####").update_counter(1019)

		self.assertEqual(new_item_names("Books Serial Number", self.item, 1), [f"{self.prefix}1020"])

	def test_names_skip_hand_made_serial_numbers(self):
		taken = f"{self.prefix}1002"
		frappe.get_doc({"doctype": "Books Serial Number", "name": taken, "item": self.item}).insert()

		names = new_item_names("Books Serial Number", self.item, 2)

		self.assertEqual(names, [f"{self.prefix}1001", f"{self.prefix}1003"])

	def test_batch_names_follow_the_item_series(self):
		prefix = f"B{frappe.generate_hash(length=6)}-"
		item = make_series_item(has_batch=1, batch_series=f" {prefix} ")

		self.assertEqual(new_item_names("Books Batch", item, 1), [f"{prefix}1001"])
		self.assertEqual(new_item_names("Books Batch", item, 1), [f"{prefix}1002"])

	def test_item_without_a_series_gets_no_names(self):
		frappe.db.set_value("Books Item", self.item, "has_serial_number", 0)

		self.assertEqual(new_item_names("Books Serial Number", self.item, 1), [])
		self.assertEqual(new_item_names("Books Batch", make_series_item(has_batch=1), 1), [])

	def test_series_prefix_cannot_hold_url_characters(self):
		self.assertRaisesRegex(
			frappe.ValidationError,
			"Batch Series cannot contain the following characters: /, \\?, &, =, %",
			make_series_item,
			has_batch=1,
			batch_series="BAD/",
		)

	def test_series_prefix_must_suit_frappe_naming(self):
		self.assertRaises(
			frappe.ValidationError, make_series_item, has_serial_number=1, serial_number_series="BAD@"
		)

	def test_books_user_takes_names_through_the_bridge(self):
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
