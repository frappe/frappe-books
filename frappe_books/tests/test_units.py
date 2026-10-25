import frappe
from frappe.client import insert
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_stock_entry.test_books_stock_entry import (
	movement_values,
)
from frappe_books.tests.accounting import (
	make_account,
	make_customer,
	make_invoice,
	make_item,
	make_supplier,
	set_inventory_accounts,
	unique_name,
)


class IntegrationTestUnits(IntegrationTestCase):
	def setUp(self):
		self.income = make_account("Unit Sales", root_type="Income", account_type="Income Account")
		self.expense = make_account("Unit Expense", root_type="Expense", account_type="Expense Account")
		self.box = make_uom("Box")
		self.received = make_account("Unit Received", root_type="Liability").name
		self.item = make_item(
			self.income.name,
			self.received,
			is_stock_item=1,
			uoms=[{"uom": self.box, "conversion_factor": 12}],
		)

	def test_invoice_row_converts_with_the_item_factor(self):
		receivable = make_account("Unit Receivable", account_type="Receivable")
		invoice = make_invoice(
			"Books Sales Invoice",
			make_customer(receivable.name).name,
			receivable.name,
			self.item.name,
			self.income.name,
		)
		invoice.items[0].update(
			{
				"uom": self.box,
				"conversion_factor": 5,
				"qty": 2,
				"stock_qty": 7,
				"discount_percentage": 0,
				"discount_amount": 0,
			}
		)
		invoice.save()

		# The rate of 100 is per box.
		row = invoice.items[0]
		self.assertEqual((row.conversion_factor, row.stock_qty, row.amount), (12, 24, 200))

	def test_invoice_row_keeps_its_qty_in_its_unit(self):
		receivable = make_account("Unit Receivable", account_type="Receivable")
		invoice = make_invoice(
			"Books Sales Invoice",
			make_customer(receivable.name).name,
			receivable.name,
			self.item.name,
			self.income.name,
		)
		invoice.items[0].update({"uom": self.box, "qty": 2, "stock_qty": 1})
		invoice.save()

		stored = frappe.db.get_value("Books Sales Invoice Item", invoice.items[0].name, ["qty", "stock_qty"])
		self.assertEqual(stored, (2, 24))

	def test_stock_row_converts_with_the_item_factor(self):
		movement = self._receipt({"uom": self.box, "qty": 3, "transfer_qty": 3}).insert()

		row = movement.items[0]
		self.assertEqual((row.conversion_factor, row.transfer_qty, row.amount), (12, 36, 360))

	def test_row_in_the_stock_unit_transfers_its_quantity(self):
		movement = self._receipt({"uom": "Unit", "qty": 4, "transfer_qty": 1}).insert()

		row = movement.items[0]
		self.assertEqual((row.conversion_factor, row.qty, row.transfer_qty), (1, 4, 4))

	def test_api_rows_take_the_item_unit_and_derive_the_missing_quantity(self):
		piece = make_uom("Piece")
		conversions = [{"uom": self.box, "conversion_factor": 12}]
		item = make_item(self.income.name, self.received, is_stock_item=1, stock_uom=piece, uoms=conversions)
		for values, expected in (
			({"transfer_qty": 3}, (piece, 3, 3)),
			({"qty": 4}, (piece, 4, 4)),
			({"uom": self.box, "transfer_qty": 24}, (self.box, 2, 24)),
		):
			with self.subTest(values=values):
				row = {"item_code": item.name, "t_warehouse": "Stores", "basic_rate": 10, **values}
				movement = insert(movement_values("Material Receipt", [row]))
				row = movement["items"][0]
				self.assertEqual(
					(row["stock_uom"], row["uom"], row["qty"], row["transfer_qty"]),
					(piece, *expected),
				)

	def test_receipt_row_is_priced_per_its_unit_and_values_stock_per_stock_unit(self):
		set_inventory_accounts(
			make_account("Unit Stock", account_type="Stock").name, self.received, self.expense.name
		)
		payable = make_account("Unit Payable", root_type="Liability", account_type="Payable").name
		row = {"item_code": self.item.name, "warehouse": "Stores", "uom": self.box, "qty": 2, "rate": 120}
		receipt = frappe.get_doc(
			{"doctype": "Books Purchase Receipt", "supplier": make_supplier(payable).name, "items": [row]}
		).insert()
		receipt.submit()

		# A box holds 12 units.
		saved = receipt.items[0]
		self.assertEqual((saved.stock_qty, saved.amount, saved.stock_uom_rate), (24, 240, 10))
		entry = frappe.get_last_doc("Books Stock Ledger Entry", filters={"voucher_no": receipt.name})
		self.assertEqual((entry.actual_qty, entry.incoming_rate, entry.stock_value_difference), (24, 10, 240))

	def test_api_invoice_rows_take_the_item_unit(self):
		receivable = make_account("Unit Receivable", account_type="Receivable")
		piece = make_uom("Piece")
		item = make_item(self.income.name, self.expense.name, stock_uom=piece)
		invoice = insert(
			{
				"doctype": "Books Sales Invoice",
				"customer": make_customer(receivable.name).name,
				"items": [{"item_code": item.name, "qty": 2, "price_list_rate": 10}],
			}
		)
		row = invoice["items"][0]
		self.assertEqual((row["uom"], row["stock_uom"], row["qty"], row["amount"]), (piece, piece, 2, 20))

	def test_invoice_rows_are_priced_per_their_unit(self):
		customer = make_customer(make_account("Unit Receivable", account_type="Receivable").name).name
		payable = make_account("Unit Payable", root_type="Liability", account_type="Payable").name
		supplier = make_supplier(payable).name
		row = {"item_code": self.item.name, "uom": self.box, "qty": 2, "price_list_rate": 120}
		for doctype, values in (
			("Books Sales Invoice", {"customer": customer}),
			("Books Quotation", {"party_name": customer}),
			("Books Purchase Invoice", {"supplier": supplier, "credit_to": payable}),
		):
			with self.subTest(doctype=doctype):
				invoice = insert({"doctype": doctype, "items": [row], **values})
				saved = invoice["items"][0]
				self.assertEqual(
					(saved["price_list_rate"], saved["stock_uom_rate"], saved["stock_qty"], saved["amount"]),
					(120, 10, 24, 240),
				)

	def test_invoice_row_rate_of_the_stock_unit_is_rounded(self):
		party = make_customer(make_account("Unit Receivable", account_type="Receivable").name).name
		row = {"item_code": self.item.name, "uom": self.box, "qty": 1, "price_list_rate": 40}
		invoice = insert({"doctype": "Books Sales Invoice", "customer": party, "items": [row]})

		saved = frappe.get_doc("Books Sales Invoice", invoice["name"]).items[0]
		self.assertEqual((saved.price_list_rate, saved.stock_uom_rate), (40, 3.33))

	def test_a_manual_rate_per_box_is_kept(self):
		party = make_customer(make_account("Unit Receivable", account_type="Receivable").name).name
		row = {"item_code": self.item.name, "uom": self.box, "qty": 2, "is_manual_rate": 1}
		values = {"doctype": "Books Sales Invoice", "customer": party}
		previewed = frappe.get_doc({**values, "items": [{**row, "price_list_rate": 100}]})
		previewed.preview()
		saved = insert({**values, "items": [{**row, "price_list_rate": 100}]})["items"][0]
		for result in (previewed.items[0].as_dict(), saved):
			self.assertEqual(
				(result["price_list_rate"], result["stock_uom_rate"], result["amount"]), (100, 8.33, 200)
			)

	def test_row_unit_must_be_a_unit_of_the_item(self):
		crate = make_uom("Crate")
		movement = self._receipt({"uom": crate, "conversion_factor": 6})

		# The text the /books row form shows at the field.
		message = f"^Transfer Unit {crate} is not applicable for Item {self.item.name}$"
		self.assertRaisesRegex(frappe.ValidationError, message, movement.insert)

	def test_whole_number_units_take_whole_quantities(self):
		piece = make_uom("Piece", must_be_whole_number=1)
		box = make_uom("Whole Box", must_be_whole_number=1)
		item = make_item(
			self.income.name,
			self.received,
			is_stock_item=1,
			stock_uom=piece,
			uoms=[{"uom": box, "conversion_factor": 12}],
		)
		for values, label in (
			({"uom": piece, "qty": 1.5}, "Qty as per Stock UOM"),
			({"uom": box, "qty": 0.5}, "Qty"),
		):
			with self.subTest(label=label):
				movement = self._receipt({"item_code": item.name, **values})
				self.assertRaisesRegex(
					frappe.ValidationError, f"^{label} of .* whole number", movement.insert
				)
		movement = self._receipt({"item_code": item.name, "uom": box, "qty": 2}).insert()
		self.assertEqual(movement.items[0].transfer_qty, 24)

	def test_invoice_rows_in_whole_number_units_take_whole_quantities(self):
		receivable = make_account("Unit Receivable", account_type="Receivable")
		piece = make_uom("Piece", must_be_whole_number=1)
		item = make_item(self.income.name, self.expense.name, stock_uom=piece)
		invoice = frappe.get_doc(
			{
				"doctype": "Books Sales Invoice",
				"customer": make_customer(receivable.name).name,
				"debit_to": receivable.name,
				"items": [{"item_code": item.name, "uom": piece, "qty": 2.5, "price_list_rate": 10}],
			}
		)
		self.assertRaisesRegex(
			frappe.ValidationError, "^Qty as per Stock UOM of .* whole number", invoice.insert
		)

	def test_other_units_take_fractional_quantities(self):
		movement = self._receipt({"uom": self.box, "qty": 0.5}).insert()
		self.assertEqual(movement.items[0].transfer_qty, 6)

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
					uoms=conversions,
				)

	def _receipt(self, values):
		row = {"item_code": self.item.name, "t_warehouse": "Stores", "basic_rate": 10, **values}
		return frappe.get_doc(movement_values("Material Receipt", [row]))


def make_uom(label, must_be_whole_number=0):
	return (
		frappe.get_doc(
			{
				"doctype": "Books UOM",
				"uom_name": unique_name(label),
				"must_be_whole_number": must_be_whole_number,
			}
		)
		.insert()
		.name
	)
