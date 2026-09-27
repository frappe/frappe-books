"""A failed dependent save fails its parent save, so the request rolls back both."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_batch_series.books_batch_series import BooksBatchSeries
from frappe_books.frappe_books.doctype.books_lead.books_lead import BooksLead
from frappe_books.tests.accounting import make_account, make_item, unique_name


class IntegrationTestDocumentSave(IntegrationTestCase):
	def setUp(self):
		super().setUp()
		self.income = make_account("Series Income", root_type="Income")
		self.expense = make_account("Series Expense", root_type="Expense")

	def test_item_creates_both_series_and_does_not_reset_existing_counters(self):
		serial = unique_name("Serial")
		batch = unique_name("Batch")
		item = make_item(
			self.income.name,
			self.expense.name,
			has_serial_number=1,
			serial_number_series=serial,
			has_batch=1,
			batch_series=batch,
		)
		for doctype, name in (("Books Serial Number Series", serial), ("Books Batch Series", batch)):
			series = frappe.get_doc(doctype, name)
			self.assertEqual((series.start, series.pad_zeros, series.current), (1001, 4, 1000))
			series.current = 1020
			series.save()
		item.save()
		self.assertEqual(frappe.db.get_value("Books Serial Number Series", serial, "current"), 1020)
		self.assertEqual(frappe.db.get_value("Books Batch Series", batch, "current"), 1020)

	def test_disabled_tracking_does_not_create_series(self):
		serial = unique_name("Unused Serial")
		batch = unique_name("Unused Batch")
		make_item(self.income.name, self.expense.name, serial_number_series=serial, batch_series=batch)
		self.assertFalse(frappe.db.exists("Books Serial Number Series", serial))
		self.assertFalse(frappe.db.exists("Books Batch Series", batch))

	def test_failed_series_creation_fails_the_item_insert(self):
		with patch.object(BooksBatchSeries, "validate", self.reject_save, create=True):
			with self.assertRaises(frappe.ValidationError):
				make_item(
					self.income.name,
					self.expense.name,
					has_serial_number=1,
					serial_number_series=unique_name("Rejected Serial"),
					has_batch=1,
					batch_series=unique_name("Rejected Batch"),
				)

	def test_failed_series_creation_fails_the_item_update(self):
		item = make_item(self.income.name, self.expense.name, has_batch=1, batch_series=unique_name("Batch"))
		item.batch_series = unique_name("Rejected Update Batch")
		with patch.object(BooksBatchSeries, "validate", self.reject_save, create=True):
			with self.assertRaises(frappe.ValidationError):
				item.save()

	def test_party_converts_the_linked_lead_even_when_the_names_differ(self):
		lead = frappe.get_doc({"doctype": "Books Lead", "name": unique_name("Source Lead")}).insert()
		party = frappe.get_doc(
			{
				"doctype": "Books Party",
				"name": unique_name("Customer"),
				"role": "Customer",
				"from_lead": lead.name,
			}
		).insert()
		self.assertNotEqual(lead.name, party.name)
		self.assertEqual(lead.reload().status, "Converted")

	def test_rejected_lead_conversion_fails_the_party_insert(self):
		lead = frappe.get_doc({"doctype": "Books Lead", "name": unique_name("Source Lead")}).insert()
		with patch.object(BooksLead, "validate", self.reject_save, create=True):
			with self.assertRaises(frappe.ValidationError):
				frappe.get_doc(
					{
						"doctype": "Books Party",
						"name": unique_name("Rejected Party"),
						"role": "Customer",
						"from_lead": lead.name,
					}
				).insert()

	@staticmethod
	def reject_save(*args, **kwargs):
		frappe.throw("Dependent save rejected")
