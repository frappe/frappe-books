import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, now_datetime

from frappe_books.frappe_books.doctype.books_purchase_receipt.test_books_purchase_receipt import (
	make_receipt,
	stock_value_change,
)
from frappe_books.frappe_books.doctype.books_shipment.test_books_shipment import account_balance, seed_stock
from frappe_books.frappe_books.doctype.books_stock_movement.test_books_stock_movement import (
	movement_values,
)
from frappe_books.tests.accounting import (
	ledger_entries,
	make_account,
	make_item,
	make_party,
	set_inventory_accounts,
	unique_name,
)


class IntegrationTestStockPosting(IntegrationTestCase):
	def test_backdated_receipt_restates_a_transfer_its_shipment_and_the_return(self):
		cogs = make_account("COGS", root_type="Expense", account_type="Cost of Goods Sold")
		received = make_account("Received", root_type="Liability")
		set_inventory_accounts(make_account("Stock", account_type="Stock").name, received.name, cogs.name)
		item = make_item(make_account("Income", root_type="Income").name, received.name, track_item=1).name
		shop = frappe.get_doc({"doctype": "Books Location", "name": unique_name("Shop")}).insert().name
		now = now_datetime()
		seed_stock(item, quantity=5, rate=10, date=add_to_date(now, hours=-4))
		transfer = _move_to(item, shop, 3, add_to_date(now, hours=-3))
		shipment = _ship(item, shop, 3, add_to_date(now, hours=-2))
		returned = _ship(item, shop, -3, add_to_date(now, hours=-1), return_against=shipment)
		self.assertEqual([account_balance(shipment, cogs.name), stock_value_change(returned)], [30, 30])

		receipt = make_receipt(item, quantity=3, rate=20, date=add_to_date(now, hours=-5))

		# The transfer now moves the receipt's stock at 20, which the shop ships and takes back.
		self.assertEqual(ledger_entries(transfer.doctype, transfer.name), [])
		self.assertEqual(account_balance(shipment, cogs.name), 60)
		self.assertEqual([stock_value_change(returned), account_balance(returned, cogs.name)], [60, -60])

		receipt.cancel()

		self.assertEqual(ledger_entries(transfer.doctype, transfer.name), [])
		self.assertEqual(account_balance(shipment, cogs.name), 30)
		self.assertEqual([stock_value_change(returned), account_balance(returned, cogs.name)], [30, -30])


def _move_to(item, location, quantity, date):
	row = {"item": item, "from_location": "Stores", "to_location": location, "quantity": quantity, "rate": 1}
	movement = frappe.get_doc({**movement_values("MaterialTransfer", [row]), "date": date}).insert()
	movement.submit()
	return movement


def _ship(item, location, quantity, date, return_against=None):
	party = return_against.party if return_against else None
	party = party or make_party(make_account("Receivable", account_type="Receivable").name).name
	shipment = frappe.get_doc(
		{
			"doctype": "Books Shipment",
			"party": party,
			"date": date,
			"return_against": return_against and return_against.name,
			"items": [{"item": item, "location": location, "quantity": quantity, "rate": 25}],
		}
	).insert()
	shipment.submit()
	return shipment
