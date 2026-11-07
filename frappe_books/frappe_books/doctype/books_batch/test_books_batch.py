# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_shipment.test_books_shipment import seed_stock
from frappe_books.patches import set_batch_items
from frappe_books.tests.accounting import make_account, make_item, unique_name


class IntegrationTestBooksBatch(IntegrationTestCase):
	def setUp(self):
		self.item = _batch_item()

	def test_batch_needs_an_item(self):
		self.assertRaises(frappe.MandatoryError, make_batch)

	def test_batch_item_cannot_change(self):
		batch = make_batch(item=self.item)

		batch.item = _batch_item()

		self.assertRaises(frappe.CannotChangeConstantError, batch.save)

	def test_batch_cannot_expire_before_it_is_made(self):
		self.assertRaisesRegex(
			frappe.ValidationError,
			"cannot be before Manufacture Date",
			make_batch,
			item=self.item,
			manufacture_date="2026-12-01",
			expiry_date="2026-10-01",
		)

	def test_patch_gives_a_batch_without_an_item_the_item_its_stock_moved(self):
		used = make_batch(item=self.item).name
		unused = make_batch(item=self.item).name
		seed_stock(self.item, quantity=2, rate=10, batch=used)
		frappe.db.set_value("Books Batch", {"name": ["in", [used, unused]]}, "item", None)

		set_batch_items.execute()

		self.assertEqual(frappe.db.get_value("Books Batch", used, "item"), self.item)
		self.assertIsNone(frappe.db.get_value("Books Batch", unused, "item"))


def make_batch(**values):
	return frappe.get_doc({"doctype": "Books Batch", "name": unique_name("BATCH"), **values}).insert()


def _batch_item():
	return make_item(
		make_account("Income", root_type="Income").name,
		make_account("Received", root_type="Liability").name,
		track_item=1,
		has_batch=1,
	).name
