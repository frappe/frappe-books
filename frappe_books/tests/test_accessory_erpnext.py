"""Accessory mode's endpoints over ERPNext: previews, Create mappers, linked entries and search."""

import unittest
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import nowdate

from frappe_books.tests.accounting import ensure_user

HAS_ERPNEXT = "erpnext" in frappe.get_installed_apps()
NO_RIGHTS_USER = "accessory-no-rights@example.com"


def leaf(doctype):
	return frappe.db.get_value(doctype, {"is_group": 0}, "name")


def make_customer(name):
	if not frappe.db.exists("Customer", name):
		frappe.get_doc(
			{
				"doctype": "Customer",
				"customer_name": name,
				"customer_group": leaf("Customer Group"),
				"territory": leaf("Territory"),
			}
		).insert()
	return name


def make_item(code, rate):
	"""A stock item whose standard rate ERPNext keeps as its Standard Selling price."""
	if not frappe.db.exists("Item", code):
		frappe.get_doc(
			{
				"doctype": "Item",
				"item_code": code,
				"item_group": leaf("Item Group"),
				"stock_uom": "Nos",
				"standard_rate": rate,
			}
		).insert()
	return code


def invoice_values(customer, item, **row):
	return {
		"doctype": "Sales Invoice",
		"__islocal": 1,
		"customer": customer,
		"items": [{"name": "row-1", "item_code": item, **row}],
	}


def first_row(doc):
	return frappe._dict(doc["items"][0])


@unittest.skipUnless(HAS_ERPNEXT, "needs ERPNext")
class IntegrationTestAccessoryPreview(IntegrationTestCase):
	def setUp(self):
		from frappe_books.accessory.preview import preview

		self.preview = preview
		self.customer = make_customer("Accessory Preview Customer")
		self.pen = make_item("ACC-PREVIEW-PEN", 20)
		self.book = make_item("ACC-PREVIEW-BOOK", 60)

	def test_a_new_invoice_takes_erpnext_defaults_prices_and_totals_without_a_write(self):
		count = frappe.db.count("Sales Invoice")
		doc = self.preview(invoice_values(self.customer, self.pen, qty=3), {"rows": {"row-1": ["item_code"]}})

		self.assertTrue(doc["company"])
		self.assertTrue(doc["naming_series"])
		self.assertEqual(str(doc["posting_date"]), nowdate())
		self.assertEqual(first_row(doc).rate, 20)
		self.assertEqual(doc["net_total"], 60)
		self.assertEqual(frappe.db.count("Sales Invoice"), count)

	def test_a_typed_rate_stays_as_a_discount(self):
		doc = self.preview(invoice_values(self.customer, self.pen, qty=1), {"rows": {"row-1": ["item_code"]}})
		doc["items"][0]["rate"] = 15
		doc = self.preview({**doc, "__islocal": 1}, {"rows": {"row-1": ["rate"]}})
		doc = self.preview({**doc, "__islocal": 1}, {})

		self.assertEqual(first_row(doc).rate, 15)
		self.assertEqual(first_row(doc).discount_amount, 5)

	def test_a_new_item_refreshes_its_row(self):
		doc = self.preview(invoice_values(self.customer, self.pen, qty=2), {"rows": {"row-1": ["item_code"]}})
		doc["items"][0]["item_code"] = self.book
		doc = self.preview({**doc, "__islocal": 1}, {"rows": {"row-1": ["item_code"]}})

		row = first_row(doc)
		self.assertEqual(row.item_name, self.book)
		self.assertEqual((row.qty, row.rate, row.amount), (2, 60, 120))

	def test_a_new_party_takes_its_details(self):
		other = make_customer("Accessory Preview Other")
		doc = self.preview(invoice_values(self.customer, self.pen, qty=1), {"doc": ["customer"]})
		doc["customer"] = other
		doc = self.preview({**doc, "__islocal": 1}, {"doc": ["customer"]})

		self.assertEqual(doc["customer_name"], other)

	def test_a_preview_needs_the_right_to_make_the_document(self):
		ensure_user(NO_RIGHTS_USER)
		with self.set_user(NO_RIGHTS_USER), self.assertRaises(frappe.PermissionError):
			self.preview(invoice_values(self.customer, self.pen), {})


@unittest.skipUnless(HAS_ERPNEXT, "needs ERPNext")
class IntegrationTestAccessoryMappers(IntegrationTestCase):
	def setUp(self):
		from frappe_books.accessory.mappers import make_mapped_doc

		self.make_mapped_doc = make_mapped_doc
		self.customer = make_customer("Accessory Mapper Customer")
		self.item = make_item("ACC-MAPPER-PEN", 20)

	def make_quotation(self):
		quotation = frappe.get_doc(
			{
				"doctype": "Quotation",
				"quotation_to": "Customer",
				"party_name": self.customer,
				"items": [{"item_code": self.item, "qty": 2}],
			}
		)
		quotation.insert()
		quotation.submit()
		return quotation

	def test_a_quotation_is_invoiced_by_erpnext_mapper(self):
		quotation = self.make_quotation()
		invoice = self.make_mapped_doc("Quotation", quotation.name, "make_sales_invoice")

		self.assertEqual(invoice["doctype"], "Sales Invoice")
		self.assertEqual(invoice["customer"], self.customer)
		self.assertEqual(invoice["items"][0]["item_code"], self.item)

	def test_a_customer_invoice_is_a_new_invoice_for_the_customer(self):
		invoice = self.make_mapped_doc("Customer", self.customer, "make_sales_invoice")
		self.assertEqual((invoice["doctype"], invoice["customer"]), ("Sales Invoice", self.customer))

	def test_an_unmapped_action_is_refused(self):
		with self.assertRaisesRegex(frappe.ValidationError, "not available in accessory mode"):
			self.make_mapped_doc("Customer", self.customer, "make_payment")

	def test_a_mapper_needs_the_right_to_read_the_source(self):
		quotation = self.make_quotation()
		ensure_user(NO_RIGHTS_USER)
		with self.set_user(NO_RIGHTS_USER), self.assertRaises(frappe.PermissionError):
			self.make_mapped_doc("Quotation", quotation.name, "make_sales_invoice")


@unittest.skipUnless(HAS_ERPNEXT, "needs ERPNext")
class IntegrationTestAccessoryLinkedEntriesAndSearch(IntegrationTestCase):
	def test_linked_entries_list_the_erpnext_documents_that_link(self):
		from frappe_books.linked_entries import get_linked_entries

		customer = make_customer("Accessory Linked Customer")
		item = make_item("ACC-LINKED-PEN", 20)
		invoice = frappe.get_doc(
			{
				"doctype": "Sales Invoice",
				"customer": customer,
				"due_date": nowdate(),
				"items": [{"item_code": item, "qty": 1}],
			}
		).insert()

		with patch("frappe_books.linked_entries.accessory_company", return_value=invoice.company):
			linked = get_linked_entries("Customer", customer)

		self.assertEqual(linked["Sales Invoice"], [invoice.name])

	def test_search_indexes_the_erpnext_twins_in_accessory_mode(self):
		from frappe_books.search import _get_search_doctypes

		doctypes = _get_search_doctypes(True)
		self.assertIn("Sales Invoice", doctypes)
		self.assertIn("Customer", doctypes)
		self.assertNotIn("Books Sales Invoice", doctypes)
		self.assertIn("Books Sales Invoice", _get_search_doctypes(False))
