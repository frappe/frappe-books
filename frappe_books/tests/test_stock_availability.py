import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, now_datetime

from frappe_books.frappe_books.doctype.books_shipment.test_books_shipment import make_batch, seed_stock
from frappe_books.frappe_books.doctype.books_stock_movement.test_books_stock_movement import (
	movement_values,
)
from frappe_books.inventory.availability import get_sale_shortfalls, get_stock_location, get_stock_quantities
from frappe_books.tests.accounting import ensure_user, make_account, make_item, make_party, unique_name

NO_ROLE_USER = "books-availability-no-role@example.com"


class IntegrationTestStockAvailability(IntegrationTestCase):
	def setUp(self):
		self.income = make_account("Income", root_type="Income").name
		received = make_account("Received", root_type="Liability")
		self.make_item = lambda **values: make_item(self.income, received.name, **values).name
		frappe.db.set_single_value("Books Defaults", "shipment_location", "Stores")

	def test_sales_lack_what_tracked_items_and_batches_miss_where_they_ship_from(self):
		pen, ink = self.make_item(track_item=1), self.make_item(track_item=1, has_batch=1)
		service = make_item(self.income, make_account("Expense", root_type="Expense").name).name
		batch = make_batch(ink)
		seed_stock(pen, quantity=5, rate=10)
		seed_stock(ink, quantity=2, rate=10, batch=batch)
		rows = [
			{"item": pen, "quantity": 3},
			{"item": pen, "quantity": 3},
			{"item": ink, "batch": batch, "quantity": 2},
			{"item": service, "quantity": 9},
		]

		shortfalls = get_sale_shortfalls(rows, str(now_datetime()))

		self.assertEqual(shortfalls, [{"item": pen, "batch": None, "quantity": 1}])

	def test_stock_that_arrives_after_the_sale_does_not_count(self):
		pen = self.make_item(track_item=1)
		seed_stock(pen, quantity=5, rate=10, date=add_days(now_datetime(), 2))

		shortfalls = get_sale_shortfalls([{"item": pen, "quantity": 1}], str(now_datetime()))

		self.assertEqual(shortfalls, [{"item": pen, "batch": None, "quantity": 1}])

	def test_without_a_date_all_stock_counts(self):
		pen = self.make_item(track_item=1)
		seed_stock(pen, quantity=5, rate=10, date=add_days(now_datetime(), 2))

		self.assertEqual(get_sale_shortfalls([{"item": pen, "quantity": 5}]), [])
		self.assertEqual(
			get_sale_shortfalls([{"item": pen, "quantity": 6}]), [{"item": pen, "batch": None, "quantity": 1}]
		)

	def test_pos_sales_ship_from_the_pos_inventory(self):
		location = frappe.get_doc({"doctype": "Books Location", "name": unique_name("Counter")}).insert()
		frappe.db.set_single_value("Books Pos Settings", {"inventory": location.name, "pos_profile": None})

		self.assertEqual(get_stock_location("Books Sales Invoice", is_pos=True), location.name)
		self.assertEqual(get_stock_location("Books Sales Invoice"), "Stores")

	def test_stock_is_given_per_item_and_batch_at_a_location(self):
		ink = self.make_item(track_item=1, has_batch=1)
		batch = make_batch(ink)
		seed_stock(ink, quantity=4, rate=10, batch=batch)

		stock = get_stock_quantities("Stores", [ink])

		self.assertEqual([(row.item, row.batch, row.quantity) for row in stock], [(ink, batch, 4)])

	def test_locations_are_given_for_invoices_to_their_readers(self):
		self.assertRaises(frappe.ValidationError, get_stock_location, "Books Payment")
		with self.set_user(ensure_user(NO_ROLE_USER)), self.assertRaises(frappe.PermissionError):
			get_stock_location("Books Sales Invoice")

	def test_a_sale_row_takes_no_more_of_its_batch_than_is_in_stock(self):
		ink = self.make_item(track_item=1, has_batch=1)
		batch = make_batch(ink)
		seed_stock(ink, quantity=2, rate=10, batch=batch)

		with self.assertRaises(frappe.ValidationError) as raised:
			self._sale(ink, batch, quantity=3).insert()
		# The text /books shows at the row's batch or quantity.
		self.assertEqual(
			str(raised.exception), f"Batch {batch} only has 2 quantity available but 3 is required"
		)
		self._sale(ink, batch, quantity=2).insert()

	def test_a_quote_row_takes_no_more_of_its_batch_than_is_in_stock(self):
		ink = self.make_item(track_item=1, has_batch=1)
		batch = make_batch(ink)
		seed_stock(ink, quantity=2, rate=10, batch=batch)

		quote = self._sale(ink, batch, quantity=3, doctype="Books Sales Quote")
		self.assertRaisesRegex(frappe.ValidationError, "only has 2 quantity available but 3 is", quote.insert)
		self._sale(ink, batch, quantity=2, doctype="Books Sales Quote").insert()

	def test_a_saved_sale_row_is_checked_again_only_when_edited(self):
		ink = self.make_item(track_item=1, has_batch=1)
		batch = make_batch(ink)
		seed_stock(ink, quantity=3, rate=10, batch=batch)
		sale = self._sale(ink, batch, quantity=3).insert()
		issue = frappe.get_doc(
			movement_values(
				"MaterialIssue",
				[{"item": ink, "batch": batch, "from_location": "Stores", "quantity": 2, "rate": 10}],
			)
		).insert()
		issue.submit()

		sale.terms = "Kept as it was entered"
		sale.save()
		sale.items[0].quantity = 2
		self.assertRaisesRegex(frappe.ValidationError, "only has 1 quantity available but 2 is", sale.save)

	def _sale(self, item, batch, quantity, **values):
		receivable = make_account("Receivable", account_type="Receivable").name
		return frappe.get_doc(
			{
				"doctype": "Books Sales Invoice",
				"party": make_party(receivable).name,
				"date": now_datetime(),
				"items": [{"item": item, "batch": batch, "quantity": quantity, "rate": 10}],
				**values,
			}
		)
