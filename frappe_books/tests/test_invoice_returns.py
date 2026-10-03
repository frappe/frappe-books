import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.returns import map_return
from frappe_books.frappe_books.doctype.books_shipment.test_books_shipment import make_batch, seed_stock
from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party


class IntegrationTestInvoiceReturns(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Return Receivable", account_type="Receivable")
		self.income = make_account("Return Income", root_type="Income", account_type="Income Account")
		self.received = make_account("Return Received", root_type="Liability").name
		self.party = make_party(self.receivable.name)

	def test_a_credit_note_returns_only_the_batches_the_invoice_sold(self):
		item = make_item(self.income.name, self.received, track_item=1, has_batch=1).name
		sold, unsold = make_batch(item), make_batch(item)
		frappe.db.set_single_value("Books Defaults", "shipment_location", "Stores")
		seed_stock(item, quantity=2, rate=10, batch=sold)
		invoice = self._submitted_invoice(item, batch=sold)

		credit_note = map_return(invoice.doctype, invoice.name)
		credit_note.items[0].batch = unsold

		self.assertRaisesRegex(frappe.ValidationError, "exceed the quantity of 0", credit_note.insert)

	def test_a_credit_note_returns_only_serial_numbers_sold_and_not_yet_returned(self):
		item = make_item(self.income.name, self.received, track_item=1, has_serial_number=1).name
		invoice = self._submitted_invoice(item, serial_number="S-1\nS-2")
		partial = map_return(invoice.doctype, invoice.name)
		partial.items[0].update({"quantity": -1, "serial_number": "S-1"})
		partial.insert().submit()

		for serial_number, message in (("S-1", "is already returned"), ("S-9", "is not in")):
			with self.subTest(serial_number=serial_number):
				credit_note = map_return(invoice.doctype, invoice.name)
				credit_note.items[0].serial_number = serial_number
				self.assertRaisesRegex(frappe.ValidationError, message, credit_note.insert)

	def test_a_return_saved_with_an_empty_batch_counts_as_returned(self):
		item = make_item(self.income.name, self.received, track_item=1).name
		invoice = self._submitted_invoice(item)
		partial = map_return(invoice.doctype, invoice.name)
		partial.items[0].update({"quantity": -1, "batch": ""})
		partial.insert().submit()

		remaining = map_return(invoice.doctype, invoice.name)

		self.assertEqual([row.quantity for row in remaining.items], [-1])

	def _submitted_invoice(self, item, **row):
		return make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			item,
			self.income.name,
			make_auto_stock_transfer=0,
			items=[{"item": item, "account": self.income.name, "rate": 100, "quantity": 2, **row}],
		).submit()
