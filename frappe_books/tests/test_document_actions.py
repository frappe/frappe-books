"""Integration coverage for native Desk document actions and returns."""

from decimal import Decimal

import frappe
from frappe.client import insert
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.payment import map_invoice_payment
from frappe_books.accounting.returns import map_return
from frappe_books.frappe_books.doctype.books_pos_opening_shift.test_books_pos_opening_shift import (
	start_pos_shift,
)
from frappe_books.frappe_books.doctype.books_purchase_receipt.test_books_purchase_receipt import (
	set_inventory_accounts,
)
from frappe_books.frappe_books.doctype.books_sales_quote.books_sales_quote import make_sales_invoice
from frappe_books.tests.accounting import (
	ensure_user,
	make_account,
	make_invoice,
	make_item,
	make_number_series,
	make_party,
)
from frappe_books.ui_api import get_duplicate, get_submitted_linked_docs, lifecycle_action
from frappe_books.ui_bridge.database import BooksDatabaseBridge

MAPPERS = "frappe_books.frappe_books.doctype.{0}.{0}.{1}"


class IntegrationTestDocumentActions(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Action Receivable", account_type="Receivable")
		self.income = make_account("Action Income", root_type="Income", account_type="Income Account")
		self.expense = make_account("Action Expense", root_type="Expense", account_type="Expense Account")
		self.cash = make_account("Action Cash", account_type="Cash")
		self.party = make_party(self.receivable.name)
		self.item = make_item(self.income.name, self.expense.name)
		frappe.db.set_single_value("Books Defaults", "sales_payment_account", self.cash.name)

	def test_quote_to_invoice_and_invoice_to_payment(self):
		quote = self._submitted_quote()
		invoice = make_sales_invoice(quote.name)
		self.assertEqual((invoice.grand_total, invoice.outstanding_amount), (150, 150))
		invoice.insert()
		self.assertEqual(invoice.quote, quote.name)
		self.assertEqual(invoice.account, self.receivable.name)
		invoice.submit()

		payment = map_invoice_payment(invoice.doctype, invoice.name)
		self.assertEqual(payment.payment_type, "Receive")
		self.assertEqual(Decimal(str(payment.amount)), Decimal("150"))
		self.assertEqual(payment.payment_references[0].reference_name, invoice.name)

	def test_bridge_returns_mapped_documents_in_interface_fields(self):
		quote = self._submitted_quote()
		bridge = BooksDatabaseBridge()

		invoice = bridge.call(
			"getMapped", [MAPPERS.format("books_sales_quote", "make_sales_invoice"), quote.name]
		)
		self.assertEqual((invoice["quote"], invoice["party"]), (quote.name, self.party.name))
		self.assertEqual(invoice["items"][0]["rate"], 75)

		submitted = make_sales_invoice(quote.name).insert().submit()
		payment = bridge.call(
			"getMapped", [MAPPERS.format("books_sales_invoice", "make_payment"), submitted.name]
		)
		self.assertEqual((payment["paymentType"], payment["amount"]), ("Receive", 150))
		self.assertEqual(payment["for"][0]["referenceName"], submitted.name)
		self.assertEqual(payment["for"][0]["referenceType"], "SalesInvoice")

	def test_bridge_maps_only_through_whitelisted_mappers(self):
		quote = self._submitted_quote()
		with self.assertRaises(frappe.PermissionError):
			BooksDatabaseBridge().get_mapped("frappe_books.accounting.returns.map_return", quote.name)

	def test_return_limits_quantity_and_updates_original_status(self):
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
		)
		invoice.items[0].item_discount_percent = 0
		invoice.save()
		invoice.submit()

		credit_note = map_return(invoice.doctype, invoice.name).insert()
		self.assertEqual(Decimal(str(credit_note.items[0].quantity)), Decimal("-2"))
		credit_note.submit()
		self.assertEqual(invoice.db_get("is_fully_returned"), 1)
		self.assertEqual(Decimal(str(credit_note.db_get("outstanding_amount"))), Decimal("-200"))

		with self.assertRaises(frappe.ValidationError):
			map_return(invoice.doctype, invoice.name)

		refund = map_invoice_payment(credit_note.doctype, credit_note.name)
		self.assertEqual(refund.payment_type, "Pay")
		refund.insert().submit()
		self.assertEqual(credit_note.db_get("outstanding_amount"), 0)
		refund.cancel()

		credit_note.cancel()
		self.assertEqual(invoice.db_get("is_returned"), 0)
		self.assertEqual(invoice.db_get("is_fully_returned"), 0)

	def test_partial_and_full_return_flags_for_sales_and_purchases(self):
		payable = make_account("Return Payable", root_type="Liability", account_type="Payable")
		supplier = make_party(payable.name, role="Supplier")
		for doctype, party, account, item_account in (
			("Books Sales Invoice", self.party.name, self.receivable.name, self.income.name),
			("Books Purchase Invoice", supplier.name, payable.name, self.expense.name),
		):
			with self.subTest(doctype=doctype):
				invoice = make_invoice(doctype, party, account, self.item.name, item_account)
				invoice.items[0].item_discount_percent = 0
				invoice.save().submit()
				partial = map_return(doctype, invoice.name)
				partial.items[0].quantity = -1
				partial.insert().submit()
				self.assertEqual(invoice.db_get("is_returned"), 1)
				self.assertEqual(invoice.db_get("is_fully_returned"), 0)

				remaining = map_return(doctype, invoice.name)
				remaining.items[0].quantity = -1
				remaining.insert().submit()
				self.assertEqual(invoice.db_get("is_fully_returned"), 1)
				remaining.cancel()
				self.assertEqual(invoice.db_get("is_returned"), 1)
				self.assertEqual(invoice.db_get("is_fully_returned"), 0)
				partial.cancel()
				self.assertEqual(invoice.db_get("is_returned"), 0)
				self.assertEqual(invoice.db_get("is_fully_returned"), 0)

	def test_return_offers_only_what_is_not_yet_returned(self):
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
		)
		invoice.items[0].update({"item_discount_percent": 0, "serial_number": "S-1\nS-2"})
		other_item = make_item(self.income.name, self.expense.name)
		invoice.append("items", {"item": other_item.name, "rate": 10, "quantity": 1})
		invoice.save().submit()
		partial = map_return(invoice.doctype, invoice.name)
		partial.items[0].update({"quantity": -1, "serial_number": "S-1"})
		partial.remove(partial.items[1])
		partial.insert().submit()

		remaining = map_return(invoice.doctype, invoice.name)

		self.assertEqual([row.quantity for row in remaining.items], [-1, -1])
		self.assertEqual(remaining.items[0].serial_number, "S-2")

	def test_return_keeps_the_invoice_discounts(self):
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			discount_percent=5,
		)
		invoice.submit()

		credit_note = map_return(invoice.doctype, invoice.name)
		self.assertEqual(credit_note.grand_total, -invoice.grand_total)
		credit_note.insert()
		self.assertEqual(credit_note.grand_total, -invoice.grand_total)
		self.assertEqual(credit_note.return_against, invoice.name)
		self.assertFalse(credit_note.is_returned)

	def test_deleting_an_invoice_deletes_its_cancelled_payment_and_receipt(self):
		payable = make_account("Delete Payable", root_type="Liability", account_type="Payable")
		stock = make_account("Delete Stock", account_type="Stock")
		received = make_account("Delete Received", root_type="Liability")
		set_inventory_accounts(stock.name, received.name, self.expense.name)
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		frappe.db.set_single_value(
			"Books Defaults",
			{"purchase_receipt_location": "Stores", "purchase_payment_account": self.cash.name},
		)
		item = make_item(self.income.name, received.name, track_item=1)
		supplier = make_party(payable.name, role="Supplier")
		invoice = make_invoice(
			"Books Purchase Invoice",
			supplier.name,
			payable.name,
			item.name,
			received.name,
			make_auto_stock_transfer=1,
			make_auto_payment=1,
		).submit()
		receipt = invoice.reload().back_reference
		payment = frappe.get_doc(
			"Books Payment",
			frappe.db.get_value("Books Payment For", {"reference_name": invoice.name}, "parent"),
		)
		payment.cancel()
		invoice.reload().cancel()

		frappe.delete_doc(invoice.doctype, invoice.name)

		for doctype, name in (
			(invoice.doctype, invoice.name),
			("Books Purchase Receipt", receipt),
			(payment.doctype, payment.name),
		):
			self.assertFalse(frappe.db.exists(doctype, name), doctype)

	def test_cancelling_a_paid_invoice_cancels_the_payments_it_lists(self):
		invoice = self._paid_invoice()
		payment = frappe.db.get_value("Books Payment For", {"reference_name": invoice.name}, "parent")
		linked_docs = get_submitted_linked_docs("SalesInvoice", invoice.name)
		cancelled = lifecycle_action("cancel", "SalesInvoice", invoice.name, _modified(invoice), linked_docs)

		self.assertEqual([(doc["schemaName"], doc["name"]) for doc in linked_docs], [("Payment", payment)])
		self.assertTrue(cancelled["cancelled"])
		self.assertEqual(frappe.db.get_value("Books Payment", payment, "docstatus"), 2)

	def test_linked_documents_are_cancelled_with_the_users_rights(self):
		invoice = self._paid_invoice()
		linked_docs = get_submitted_linked_docs("SalesInvoice", invoice.name)
		args = ("cancel", "SalesInvoice", invoice.name, _modified(invoice), linked_docs)

		with self.set_user(ensure_user("books-cancel-user@example.com", "Books User")):
			self.assertRaises(frappe.PermissionError, lifecycle_action, *args)

		self.assertEqual(frappe.db.get_value("Books Payment", linked_docs[0]["name"], "docstatus"), 1)

	def test_a_duplicate_of_a_returned_invoice_is_a_new_invoice(self):
		invoice = self._paid_invoice(make_auto_payment=0)
		credit_note = map_return(invoice.doctype, invoice.name)
		credit_note.make_auto_payment = 0
		credit_note.insert().submit()

		values = get_duplicate("SalesInvoice", invoice.name)
		duplicate = BooksDatabaseBridge().insert("SalesInvoice", values)
		submitted = lifecycle_action("submit", "SalesInvoice", duplicate["name"], duplicate["modified"])

		self.assertEqual((submitted["isReturned"], submitted["status"]), (0, "Unpaid"))
		self.assertEqual(submitted["outstandingAmount"], submitted["grandTotal"])

	def test_submit_refuses_a_document_changed_since_it_was_read(self):
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, self.item.name, self.income.name
		)
		read = _modified(invoice)
		invoice.save()

		self.assertRaises(
			frappe.TimestampMismatchError, lifecycle_action, "submit", "SalesInvoice", invoice.name, read
		)
		submitted = lifecycle_action("submit", "SalesInvoice", invoice.name, _modified(invoice))
		self.assertTrue(submitted["submitted"])

	def test_cancel_refuses_a_document_changed_since_it_was_read(self):
		invoice = self._paid_invoice()
		read = _modified(invoice)
		linked_docs = get_submitted_linked_docs("SalesInvoice", invoice.name)
		frappe.db.set_value(invoice.doctype, invoice.name, "terms", "Changed elsewhere")

		for docs in ([], linked_docs):
			with self.subTest(linked_docs=docs):
				self.assertRaises(
					frappe.TimestampMismatchError,
					lifecycle_action,
					*("cancel", "SalesInvoice", invoice.name, read, docs),
				)
		self.assertEqual(frappe.db.get_value("Books Payment", linked_docs[0]["name"], "docstatus"), 1)

	def test_duplicates_need_read_and_create_rights(self):
		invoice = self._paid_invoice()
		with self.set_user(ensure_user("books-no-role@example.com")):
			self.assertRaises(frappe.PermissionError, get_duplicate, "SalesInvoice", invoice.name)

	def test_submit_makes_the_automatic_payment(self):
		start_pos_shift()
		frappe.db.set_single_value("Books Pos Settings", "pos_profile", None)
		for is_pos, payments in ((0, 1), (1, 0)):
			with self.subTest(is_pos=is_pos):
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					self.item.name,
					self.income.name,
					make_auto_payment=1,
					is_pos=is_pos,
				)
				invoice.items[0].item_discount_percent = 0
				invoice.save().submit()

				references = frappe.get_all(
					"Books Payment For", filters={"reference_name": invoice.name}, pluck="parent"
				)
				self.assertEqual(len(references), payments)
				self.assertEqual(invoice.db_get("outstanding_amount"), 0 if payments else 200)
				self.assertEqual(invoice.outstanding_amount, invoice.db_get("outstanding_amount"))

	def test_automatic_payment_uses_the_defaults_series(self):
		series = make_number_series("Payment")
		frappe.db.set_single_value("Books Defaults", "payment_number_series", series)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			make_auto_payment=1,
		)
		invoice.items[0].item_discount_percent = 0
		invoice.save().submit()

		payment = frappe.db.get_value("Books Payment For", {"reference_name": invoice.name}, "parent")
		self.assertTrue(payment.startswith(series), payment)

	def test_new_invoices_follow_up_as_the_defaults_allow(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_inventory", 1)
		frappe.db.set_single_value("Books Defaults", "shipment_location", "Stores")
		invoice = insert(self._invoice_values())
		self.assertEqual((invoice.make_auto_payment, invoice.make_auto_stock_transfer), (1, 1))

		frappe.db.set_single_value(
			"Books Defaults", {"sales_payment_account": None, "shipment_location": None}
		)
		invoice = insert(self._invoice_values())
		self.assertEqual((invoice.make_auto_payment, invoice.make_auto_stock_transfer), (0, 0))

	def test_new_invoices_keep_the_follow_ups_the_caller_chose(self):
		invoice = insert(self._invoice_values(make_auto_payment=0))
		self.assertEqual(invoice.make_auto_payment, 0)

	def test_preview_shows_the_follow_up_defaults(self):
		values = {"party": self.party.name, "items": [{"item": self.item.name, "quantity": 1}]}
		preview = BooksDatabaseBridge().preview("SalesInvoice", values)
		self.assertTrue(preview["makeAutoPayment"])

	def _paid_invoice(self, make_auto_payment=1):
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			make_auto_payment=make_auto_payment,
		)
		return invoice.submit()

	def _invoice_values(self, **values):
		return {
			"doctype": "Books Sales Invoice",
			"party": self.party.name,
			"date": frappe.utils.now_datetime(),
			"items": [{"item": self.item.name, "rate": 75, "quantity": 2}],
			**values,
		}

	def _submitted_quote(self):
		return (
			frappe.get_doc(
				{
					"doctype": "Books Sales Quote",
					"reference_type": "Books Party",
					"party": self.party.name,
					"date": frappe.utils.now_datetime(),
					"items": [{"item": self.item.name, "rate": 75, "quantity": 2}],
				}
			)
			.insert()
			.submit()
		)


def _modified(doc):
	"""Return the stored `modified` value, as the interface reads it."""
	return str(frappe.db.get_value(doc.doctype, doc.name, "modified"))
