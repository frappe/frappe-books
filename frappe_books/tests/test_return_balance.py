"""Regression coverage for the return quantities supplied to the Books interface."""

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import unique_name
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries
from frappe_books.ui_bridge.mapping import target_doctype


class IntegrationTestReturnBalance(IntegrationTestCase):
	def setUp(self):
		self.queries = BooksBespokeQueries()

	def test_first_return_ignores_drafts_and_cancelled_returns(self):
		original = self._document("Shipment", [{"item": "Keyboard", "quantity": 2}])
		for docstatus in (0, 2):
			self._document("Shipment", original.items, original.name, docstatus)

		self.assertIsNone(self._balance("Shipment", original))

	def test_submitted_returns_reduce_each_item_independently(self):
		for schema in ("Shipment", "PurchaseReceipt", "SalesInvoice", "PurchaseInvoice"):
			with self.subTest(schema=schema):
				original = self._document(
					schema,
					[
						{"item": "Keyboard", "quantity": 1},
						{"item": "Keyboard", "quantity": 1},
						{"item": "Notebook", "quantity": 12},
					],
				)
				# The bridge supports positive stock returns and negative invoice returns.
				sign = -1 if schema.endswith("Invoice") else 1
				self._document(
					schema,
					[
						{"item": "Keyboard", "quantity": sign},
						{"item": "Notebook", "quantity": sign * 3},
					],
					original.name,
				)
				self._document(schema, [{"item": "Notebook", "quantity": sign * 4}], original.name)
				self._document(schema, original.items, original.name, docstatus=0)
				self._document(schema, original.items, original.name, docstatus=2)
				self._document(schema, original.items, "Another original")

				balances = self._balance(schema, original)
				self.assertEqual(balances["Keyboard"]["quantity"], -1)
				self.assertEqual(balances["Notebook"]["quantity"], -5)

	def test_full_and_excess_returns_have_no_remaining_quantity(self):
		original = self._document("Shipment", [{"item": "Keyboard", "quantity": 2}])
		for _ in range(4):
			self._document("Shipment", original.items, original.name)
			self.assertEqual(self._balance("Shipment", original)["Keyboard"]["quantity"], 0)

	def test_fractional_returns_do_not_leave_rounding_residue(self):
		original = self._document("Shipment", [{"item": "Fabric", "quantity": 0.3}])
		for quantity in (0.1, 0.2):
			self._document("Shipment", [{"item": "Fabric", "quantity": quantity}], original.name)

		self.assertEqual(self._balance("Shipment", original)["Fabric"]["quantity"], 0)

	def test_batches_and_serial_numbers_only_include_unreturned_stock(self):
		original = self._document(
			"PurchaseReceipt",
			[
				{"item": "Keyboard", "batch": "A", "quantity": 2, "serial_number": "K1\nK2"},
				{"item": "Keyboard", "batch": "B", "quantity": 2, "serial_number": "K3\nK4"},
				{"item": "Notebook", "batch": "C", "quantity": 3},
				{"item": "Mouse", "quantity": 2, "serial_number": "M1\nM2"},
			],
		)
		self._document(
			"PurchaseReceipt",
			[
				{"item": "Keyboard", "batch": "A", "quantity": 1, "serial_number": "K1"},
				{"item": "Notebook", "batch": "C", "quantity": 3},
				{"item": "Mouse", "quantity": 1, "serial_number": "M2"},
			],
			original.name,
		)

		balances = self._balance("PurchaseReceipt", original)
		self.assertEqual(balances["Keyboard"]["quantity"], -3)
		self.assertEqual(balances["Keyboard"]["serialNumbers"], ["K2", "K3", "K4"])
		self.assertEqual(
			balances["Keyboard"]["batches"],
			{
				"A": {"quantity": -1, "serialNumbers": ["K2"]},
				"B": {"quantity": -2, "serialNumbers": ["K3", "K4"]},
			},
		)
		self.assertEqual(balances["Notebook"]["batches"], {"C": {"quantity": 0, "serialNumbers": []}})
		self.assertEqual(balances["Mouse"]["serialNumbers"], ["M1"])

	def test_comma_separated_serial_numbers_are_split(self):
		original = self._document(
			"Shipment", [{"item": "Mouse", "quantity": 3, "serial_number": "M1, M2,M3"}]
		)
		self._document("Shipment", [{"item": "Mouse", "quantity": 1, "serial_number": "M2"}], original.name)

		self.assertEqual(self._balance("Shipment", original)["Mouse"]["serialNumbers"], ["M1", "M3"])

	def _balance(self, schema, original):
		return self.queries.call("getReturnBalanceItemsQty", [schema, original.name])

	def _document(self, schema, rows, return_against=None, docstatus=1):
		# Seed stored query inputs without running unrelated stock or accounting workflows.
		doc = frappe.get_doc(
			{
				"doctype": target_doctype(schema),
				"name": unique_name("Return balance"),
				"docstatus": docstatus,
				"return_against": return_against,
				"items": [
					{key: row.get(key) for key in ("item", "quantity", "batch", "serial_number")}
					for row in rows
				],
			}
		)
		doc.db_insert()
		for row in doc.items:
			row.db_insert()
		return doc
