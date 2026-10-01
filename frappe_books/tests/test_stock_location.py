import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.inventory.availability import get_stock_location
from frappe_books.tests.accounting import unique_name


class IntegrationTestStockLocation(IntegrationTestCase):
	def setUp(self):
		self.shelf = make_location("POS Shelf")
		self.counter = make_location("Counter")
		frappe.db.set_single_value(
			"Books Defaults", {"shipment_location": "Stores", "purchase_receipt_location": self.counter}
		)
		frappe.db.set_single_value("Books Pos Settings", {"pos_profile": "", "inventory": self.shelf})

	def test_pos_sales_use_the_pos_inventory(self):
		self.assertEqual(stock_location("SalesInvoice", True), self.shelf)

	def test_pos_profile_inventory_comes_first(self):
		profile = frappe.get_doc(
			{"doctype": "Books Pos Profile", "name": unique_name("POS Profile"), "inventory": self.counter}
		).insert()
		frappe.db.set_single_value("Books Pos Settings", "pos_profile", profile.name)

		self.assertEqual(stock_location("SalesInvoice", True), self.counter)

	def test_other_invoices_use_the_default_transfer_location(self):
		frappe.db.set_single_value("Books Pos Settings", "inventory", None)

		self.assertEqual(
			[
				stock_location("SalesInvoice", False),
				stock_location("SalesInvoice", True),
				stock_location("PurchaseInvoice", False),
			],
			["Stores", "Stores", self.counter],
		)

	def test_quotes_use_the_sales_invoice_location(self):
		self.assertEqual(get_stock_location("Books Sales Quote"), stock_location("SalesInvoice", False))


def stock_location(source_schema, is_pos):
	return get_stock_location(f"Books {source_schema[:-7]} Invoice", is_pos)


def make_location(label):
	return frappe.get_doc({"doctype": "Books Location", "name": unique_name(label)}).insert().name
