import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_shipment.test_books_shipment import make_batch, seed_stock
from frappe_books.frappe_books.doctype.books_stock_movement.test_books_stock_movement import (
	make_movement,
)
from frappe_books.tests.accounting import make_account, make_item
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries


class IntegrationTestStockQuantities(IntegrationTestCase):
	def test_quantities_are_summed_per_item_and_batch_at_a_location(self):
		account = make_account("Stock Expense", root_type="Expense").name
		item = make_item(account, account, track_item=1, has_batch=1).name
		other = make_item(account, account, track_item=1).name
		first, second = make_batch(item), make_batch(item)
		seed_stock(item, quantity=3, rate=10, batch=first)
		seed_stock(item, quantity=2, rate=10, batch=first)
		seed_stock(item, quantity=4, rate=10, batch=second)
		seed_stock(other, quantity=1, rate=10)
		location = frappe.get_doc({"doctype": "Books Location", "name": frappe.generate_hash()}).insert()
		make_movement(
			"MaterialTransfer",
			[
				{
					"item": item,
					"batch": second,
					"from_location": "Stores",
					"to_location": location.name,
					"quantity": 1,
					"rate": 10,
				}
			],
		).submit()

		rows = BooksBespokeQueries().call("getStockQuantities", ["Stores", [item]])

		self.assertEqual({(row.batch, row.quantity) for row in rows}, {(first, 5), (second, 3)})
