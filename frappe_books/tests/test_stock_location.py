import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.inventory.availability import get_stock_location
from frappe_books.inventory.transaction import fill_default_location
from frappe_books.tests.accounting import (
	make_account,
	make_item,
	make_warehouse,
	set_company_value,
	unique_name,
)


class IntegrationTestStockLocation(IntegrationTestCase):
	def setUp(self):
		self.shelf = make_location("POS Shelf")
		self.counter = make_location("Counter")
		frappe.db.set_single_value(
			"Books Defaults", {"delivery_note_location": "Stores", "purchase_receipt_location": self.counter}
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

	def test_stock_rows_take_the_item_warehouse_before_the_company_one(self):
		income = make_account("Location Sales", root_type="Income").name
		received = make_account("Location Received", root_type="Liability").name
		shelved = make_item(income, received, is_stock_item=1)
		shelved.item_defaults[0].default_warehouse = self.shelf
		shelved.save()
		other = make_item(income, received, is_stock_item=1).name
		set_company_value("default_warehouse", "Stores")
		rows = [
			frappe._dict(item=shelved.name),
			frappe._dict(item=other),
			frappe._dict(item=other, to_location=self.counter),
		]

		fill_default_location(rows, "to_location")

		self.assertEqual([row.to_location for row in rows], [self.shelf, "Stores", self.counter])

	def test_quotes_use_the_sales_invoice_location(self):
		self.assertEqual(get_stock_location("Books Quotation"), stock_location("SalesInvoice", False))


def stock_location(source_schema, is_pos):
	return get_stock_location(f"Books {source_schema[:-7]} Invoice", is_pos)


def make_location(label):
	return make_warehouse(label).name
