import frappe
from frappe.client import insert
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_stock_movement.test_books_stock_movement import (
	movement_values,
)
from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party, unique_name


class IntegrationTestUnits(IntegrationTestCase):
	def setUp(self):
		self.income = make_account("Unit Sales", root_type="Income", account_type="Income Account")
		self.expense = make_account("Unit Expense", root_type="Expense", account_type="Expense Account")
		self.box = make_uom("Box")
		self.received = make_account("Unit Received", root_type="Liability").name
		self.item = make_item(
			self.income.name,
			self.received,
			track_item=1,
			uom_conversions=[{"uom": self.box, "conversion_factor": 12}],
		)

	def test_invoice_row_converts_with_the_item_factor(self):
		receivable = make_account("Unit Receivable", account_type="Receivable")
		invoice = make_invoice(
			"Books Sales Invoice",
			make_party(receivable.name).name,
			receivable.name,
			self.item.name,
			self.income.name,
		)
		invoice.items[0].update(
			{"transfer_unit": self.box, "unit_conversion_factor": 5, "transfer_quantity": 2, "quantity": 7}
		)
		invoice.save()

		row = invoice.items[0]
		self.assertEqual((row.unit_conversion_factor, row.quantity, row.amount), (12, 24, 2400))

	def test_invoice_row_stores_its_qty_in_the_transfer_unit(self):
		receivable = make_account("Unit Receivable", account_type="Receivable")
		invoice = make_invoice(
			"Books Sales Invoice",
			make_party(receivable.name).name,
			receivable.name,
			self.item.name,
			self.income.name,
		)
		invoice.items[0].update({"transfer_unit": self.box, "transfer_quantity": 2, "qty": 1})
		invoice.save()

		stored = frappe.db.get_value("Books Sales Invoice Item", invoice.items[0].name, ["qty", "quantity"])
		self.assertEqual(stored, (2, 24))

	def test_stock_row_converts_with_the_item_factor(self):
		movement = self._receipt({"transfer_unit": self.box, "transfer_quantity": 3, "quantity": 3}).insert()

		row = movement.items[0]
		self.assertEqual((row.unit_conversion_factor, row.quantity, row.amount), (12, 36, 360))

	def test_row_in_the_stock_unit_transfers_its_quantity(self):
		movement = self._receipt({"transfer_unit": "Unit", "transfer_quantity": 1, "quantity": 4}).insert()

		row = movement.items[0]
		self.assertEqual((row.unit_conversion_factor, row.transfer_quantity, row.quantity), (1, 4, 4))

	def test_api_rows_take_the_item_unit_and_derive_the_missing_quantity(self):
		piece = make_uom("Piece")
		conversions = [{"uom": self.box, "conversion_factor": 12}]
		item = make_item(
			self.income.name, self.received, track_item=1, unit=piece, uom_conversions=conversions
		)
		for values, expected in (
			({"quantity": 3}, (piece, 3, 3)),
			({"transfer_quantity": 4}, (piece, 4, 4)),
			({"transfer_unit": self.box, "quantity": 24}, (self.box, 2, 24)),
		):
			with self.subTest(values=values):
				row = {"item": item.name, "to_location": "Stores", "rate": 10, **values}
				movement = insert(movement_values("MaterialReceipt", [row]))
				row = movement["items"][0]
				self.assertEqual(
					(row["unit"], row["transfer_unit"], row["transfer_quantity"], row["quantity"]),
					(piece, *expected),
				)

	def test_api_invoice_rows_take_the_item_unit(self):
		receivable = make_account("Unit Receivable", account_type="Receivable")
		piece = make_uom("Piece")
		item = make_item(self.income.name, self.expense.name, unit=piece)
		invoice = insert(
			{
				"doctype": "Books Sales Invoice",
				"party": make_party(receivable.name).name,
				"date": frappe.utils.now_datetime(),
				"items": [{"item": item.name, "quantity": 2, "rate": 10}],
			}
		)
		row = invoice["items"][0]
		self.assertEqual((row["transfer_unit"], row["transfer_quantity"], row["amount"]), (piece, 2, 20))

	def test_invoice_rows_show_their_rate_per_transfer_unit(self):
		party = make_party(make_account("Unit Receivable", account_type="Receivable").name, role="Both").name
		payable = make_account("Unit Payable", root_type="Liability", account_type="Payable").name
		row = {"item": self.item.name, "transfer_unit": self.box, "transfer_quantity": 2, "rate": 10}
		for doctype, values in (
			("Books Sales Invoice", {}),
			("Books Sales Quote", {}),
			("Books Purchase Invoice", {"account": payable}),
		):
			with self.subTest(doctype=doctype):
				invoice = insert(
					{
						"doctype": doctype,
						"party": party,
						"date": frappe.utils.now_datetime(),
						"items": [row],
						**values,
					}
				)
				saved = invoice["items"][0]
				self.assertEqual((saved["rate"], saved["transfer_rate"], saved["amount"]), (10, 120, 240))

	def test_invoice_row_rate_per_transfer_unit_is_rounded(self):
		party = make_party(make_account("Unit Receivable", account_type="Receivable").name).name
		row = {"item": self.item.name, "transfer_unit": self.box, "transfer_quantity": 1, "rate": 10 / 3}
		invoice = insert(
			{
				"doctype": "Books Sales Invoice",
				"party": party,
				"date": frappe.utils.now_datetime(),
				"items": [row],
			}
		)
		# The saved rate keeps 9 decimals, so 3.333333333 x 12 must still read 40.
		saved = frappe.get_doc("Books Sales Invoice", invoice["name"]).items[0]
		self.assertEqual(saved.transfer_rate, 40)

	def test_a_manual_rate_sent_per_transfer_unit_sets_the_rate(self):
		party = make_party(make_account("Unit Receivable", account_type="Receivable").name).name
		row = {"item": self.item.name, "transfer_unit": self.box, "transfer_quantity": 2, "is_manual_rate": 1}
		values = {"doctype": "Books Sales Invoice", "party": party, "date": frappe.utils.now_datetime()}
		# /books leaves the rate out when the user types the rate per box.
		previewed = frappe.get_doc({**values, "items": [{**row, "transfer_rate": 100}]})
		previewed.preview()
		saved = insert({**values, "items": [{**row, "transfer_rate": 100}]})["items"][0]
		for result in (previewed.items[0].as_dict(), saved):
			self.assertEqual(
				(round(result["rate"], 9), result["transfer_rate"], result["amount"]), (8.333333333, 100, 200)
			)

		# A sent rate wins over a rate per box sent with it.
		saved = insert({**values, "items": [{**row, "rate": 10, "transfer_rate": 999}]})["items"][0]
		self.assertEqual((saved["rate"], saved["transfer_rate"]), (10, 120))

	def test_row_unit_must_be_a_unit_of_the_item(self):
		crate = make_uom("Crate")
		movement = self._receipt({"transfer_unit": crate, "unit_conversion_factor": 6})

		# The text the /books row form shows at the field.
		message = f"^Transfer Unit {crate} is not applicable for Item {self.item.name}$"
		self.assertRaisesRegex(frappe.ValidationError, message, movement.insert)

	def test_whole_number_units_take_whole_quantities(self):
		piece = make_uom("Piece", is_whole=1)
		box = make_uom("Whole Box", is_whole=1)
		item = make_item(
			self.income.name,
			self.received,
			track_item=1,
			unit=piece,
			uom_conversions=[{"uom": box, "conversion_factor": 12}],
		)
		for values, label in (
			({"transfer_unit": piece, "quantity": 1.5}, "Quantity"),
			({"transfer_unit": box, "transfer_quantity": 0.5}, r"Qty\. in Transfer Unit"),
		):
			with self.subTest(label=label):
				movement = self._receipt({"item": item.name, **values})
				self.assertRaisesRegex(
					frappe.ValidationError, f"^{label} of .* whole number", movement.insert
				)
		movement = self._receipt({"item": item.name, "transfer_unit": box, "transfer_quantity": 2}).insert()
		self.assertEqual(movement.items[0].quantity, 24)

	def test_invoice_rows_in_whole_number_units_take_whole_quantities(self):
		receivable = make_account("Unit Receivable", account_type="Receivable")
		piece = make_uom("Piece", is_whole=1)
		item = make_item(self.income.name, self.expense.name, unit=piece)
		invoice = frappe.get_doc(
			{
				"doctype": "Books Sales Invoice",
				"party": make_party(receivable.name).name,
				"account": receivable.name,
				"date": frappe.utils.now_datetime(),
				"items": [{"item": item.name, "transfer_unit": piece, "quantity": 2.5, "rate": 10}],
			}
		)
		self.assertRaisesRegex(frappe.ValidationError, "^Quantity of .* whole number", invoice.insert)

	def test_other_units_take_fractional_quantities(self):
		movement = self._receipt({"transfer_unit": self.box, "transfer_quantity": 0.5}).insert()
		self.assertEqual(movement.items[0].quantity, 6)

	def test_item_conversions_need_one_positive_factor_per_unit(self):
		for conversions, message in (
			(
				[{"uom": self.box, "conversion_factor": 12}, {"uom": self.box, "conversion_factor": 6}],
				"only one",
			),
			([{"uom": self.box, "conversion_factor": 0}], "greater than zero"),
		):
			with self.subTest(message=message):
				self.assertRaisesRegex(
					frappe.ValidationError,
					message,
					make_item,
					self.income.name,
					self.expense.name,
					uom_conversions=conversions,
				)

	def _receipt(self, values):
		row = {"item": self.item.name, "to_location": "Stores", "rate": 10, **values}
		return frappe.get_doc(movement_values("MaterialReceipt", [row]))


def make_uom(label, is_whole=0):
	return (
		frappe.get_doc({"doctype": "Books Uom", "name": unique_name(label), "is_whole": is_whole})
		.insert()
		.name
	)
