from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_delivery_note.test_books_delivery_note import (
	make_batch,
	seed_stock,
)
from frappe_books.frappe_books.doctype.books_stock_entry.test_books_stock_entry import (
	make_movement,
)
from frappe_books.inventory.availability import get_stock_quantities
from frappe_books.tests.accounting import make_account, make_item, make_warehouse


class IntegrationTestStockQuantities(IntegrationTestCase):
	def test_quantities_are_summed_per_item_and_batch_at_a_location(self):
		income = make_account("Stock Income", root_type="Income").name
		received = make_account("Stock Received", root_type="Liability").name
		item = make_item(income, received, is_stock_item=1, has_batch_no=1).name
		other = make_item(income, received, is_stock_item=1).name
		first, second = make_batch(item), make_batch(item)
		seed_stock(item, quantity=3, rate=10, batch=first)
		seed_stock(item, quantity=2, rate=10, batch=first)
		seed_stock(item, quantity=4, rate=10, batch=second)
		seed_stock(other, quantity=1, rate=10)
		location = make_warehouse("Shelf")
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

		rows = get_stock_quantities("Stores", [item])

		self.assertEqual({(row.batch, row.quantity) for row in rows}, {(first, 5), (second, 3)})
