import frappe
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
		self.item = make_item(
			self.income.name,
			self.expense.name,
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

	def test_stock_row_converts_with_the_item_factor(self):
		movement = self._receipt({"transfer_unit": self.box, "transfer_quantity": 3, "quantity": 3}).insert()

		row = movement.items[0]
		self.assertEqual((row.unit_conversion_factor, row.quantity, row.amount), (12, 36, 360))

	def test_row_in_the_stock_unit_transfers_its_quantity(self):
		movement = self._receipt({"transfer_unit": "Unit", "transfer_quantity": 1, "quantity": 4}).insert()

		row = movement.items[0]
		self.assertEqual((row.unit_conversion_factor, row.transfer_quantity, row.quantity), (1, 4, 4))

	def test_row_unit_must_be_a_unit_of_the_item(self):
		movement = self._receipt({"transfer_unit": make_uom("Crate"), "unit_conversion_factor": 6})

		self.assertRaisesRegex(frappe.ValidationError, "not applicable", movement.insert)

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


def make_uom(label):
	return frappe.get_doc({"doctype": "Books Uom", "name": unique_name(label)}).insert().name
