# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.series import next_name


class IntegrationTestBooksNumberSeries(IntegrationTestCase):
	def test_next_name_increments_with_padding(self):
		prefix = f"TEST-{frappe.generate_hash(length=6)}-"
		series = frappe.get_doc(
			{
				"doctype": "Books Number Series",
				"name": prefix,
				"start": 7,
				"pad_zeros": 3,
				"reference_type": "SalesInvoice",
			}
		).insert()

		self.assertEqual(series.next(), f"{prefix}007")
		self.assertEqual(series.next(), f"{prefix}008")

	def test_taken_number_stays_locked_until_the_request_commits(self):
		# JV- is seeded before tests, so the second connection can see it.
		with self.primary_connection():
			next_name("JV-")

		with self.secondary_connection():
			self.assertRaises(
				frappe.QueryTimeoutError,
				frappe.db.get_value,
				"Books Number Series",
				"JV-",
				"current",
				for_update=True,
				wait=False,
			)

	def test_rejects_unsafe_prefix(self):
		series = frappe.get_doc(
			{
				"doctype": "Books Number Series",
				"name": "BAD/",
				"start": 1,
				"pad_zeros": 2,
				"reference_type": "SalesInvoice",
			}
		)
		self.assertRaises(frappe.ValidationError, series.insert)
