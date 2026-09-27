# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_serial_number_series.test_books_serial_number_series import (
	make_series_item,
)
from frappe_books.series import new_item_names


class IntegrationTestBooksBatchSeries(IntegrationTestCase):
	def test_batch_names_follow_the_item_series(self):
		prefix = f"B{frappe.generate_hash(length=6)}-"
		item = make_series_item(has_batch=1, batch_series=f" {prefix} ")

		self.assertEqual(new_item_names("Books Batch", item, 1), [f"{prefix}1001"])
		self.assertEqual(new_item_names("Books Batch", item, 1), [f"{prefix}1002"])
		self.assertEqual(frappe.db.get_value("Books Batch Series", prefix, "current"), 1002)

	def test_item_without_a_series_gets_no_batch_name(self):
		item = make_series_item(has_batch=1)

		self.assertEqual(new_item_names("Books Batch", item, 1), [])

	def test_series_prefix_cannot_hold_url_characters(self):
		series = frappe.get_doc({"doctype": "Books Batch Series", "name": "BAD/"})

		self.assertRaises(frappe.ValidationError, series.insert)
