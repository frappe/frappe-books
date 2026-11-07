# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_shipment.test_books_shipment import seed_stock
from frappe_books.tests.accounting import make_account, make_item, unique_name


class IntegrationTestBooksSerialNumber(IntegrationTestCase):
	def setUp(self):
		self.item = make_serial_item()
		self.serial_number = unique_name("SER")
		seed_stock(self.item, quantity=1, rate=10, serial_number=self.serial_number)

	def test_save_keeps_the_status_stock_postings_set(self):
		serial = frappe.get_doc("Books Serial Number", self.serial_number)
		serial.status = "Delivered"
		serial.save()

		self.assertEqual(frappe.db.get_value("Books Serial Number", serial.name, "status"), "Active")

	def test_new_serial_number_is_inactive_until_stock_arrives(self):
		serial = frappe.get_doc(
			{
				"doctype": "Books Serial Number",
				"name": unique_name("SER"),
				"item": self.item,
				"status": "Delivered",
			}
		).insert()

		self.assertEqual(serial.status, "Inactive")

	def test_item_cannot_change(self):
		serial = frappe.get_doc("Books Serial Number", self.serial_number)
		serial.item = make_serial_item()

		self.assertRaises(frappe.CannotChangeConstantError, serial.save)


def make_serial_item():
	return make_item(
		make_account("Income", root_type="Income").name,
		make_account("Received", root_type="Liability").name,
		track_item=1,
		has_serial_number=1,
	).name
