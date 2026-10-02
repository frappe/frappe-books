"""Integration coverage for native Desk document actions and returns."""

from decimal import Decimal

import frappe
from frappe.api.v2 import run_doc_method as run_doc_method_v2
from frappe.client import insert
from frappe.model.mapper import make_mapped_doc
from frappe.tests import IntegrationTestCase
from frappe.utils import set_request

from frappe_books.accounting.invoice import get_payments_to_cancel
from frappe_books.accounting.payment import map_invoice_payment
from frappe_books.accounting.returns import map_return
from frappe_books.frappe_books.doctype.books_pos_opening_shift.test_books_pos_opening_shift import (
	start_pos_shift,
)
from frappe_books.frappe_books.doctype.books_purchase_receipt.test_books_purchase_receipt import (
	set_inventory_accounts,
)
from frappe_books.frappe_books.doctype.books_sales_quote.books_sales_quote import make_sales_invoice
from frappe_books.frappe_books.doctype.books_shipment.books_shipment import (
	make_sales_invoice as make_shipment_invoice,
)
from frappe_books.frappe_books.doctype.books_shipment.test_books_shipment import seed_stock
from frappe_books.tests.accounting import (
	ensure_user,
	make_account,
	make_invoice,
	make_item,
	make_number_series,
	make_party,
)

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
		self.assertEqual(invoice.make_auto_payment, 1)
		# Paid by hand below, not by the automatic payment the defaults ask for.
		invoice.make_auto_payment = 0
		invoice.insert()
		self.assertEqual(invoice.quote, quote.name)
		self.assertEqual(invoice.account, self.receivable.name)
		invoice.submit()

		payment = map_invoice_payment(invoice.doctype, invoice.name)
		self.assertEqual(payment.payment_type, "Receive")
		self.assertEqual(Decimal(str(payment.amount)), Decimal("150"))
		self.assertEqual(payment.payment_references[0].reference_name, invoice.name)

	def test_invoice_mapped_from_a_shipment_pays_automatically(self):
		received = make_account("Mapped Received", root_type="Liability")
		set_inventory_accounts(
			make_account("Mapped Stock", account_type="Stock").name, received.name, self.expense.name
		)
		item = make_item(self.income.name, received.name, track_item=1)
		seed_stock(item.name, quantity=1, rate=10)
		row = {"item": item.name, "location": "Stores", "quantity": 1, "rate": 25}
		shipment = frappe.get_doc({"doctype": "Books Shipment", "party": self.party.name, "items": [row]})
		shipment.insert().submit()

		self.assertEqual(make_shipment_invoice(shipment.name).make_auto_payment, 1)

	def test_invoice_mapped_from_a_shipment_shows_the_shipped_qty(self):
		received = make_account("Mapped Received", root_type="Liability")
		set_inventory_accounts(
			make_account("Mapped Stock", account_type="Stock").name, received.name, self.expense.name
		)
		item = make_item(self.income.name, received.name, track_item=1)
		seed_stock(item.name, quantity=2, rate=10)
		row = {"item": item.name, "location": "Stores", "quantity": 2, "rate": 25}
		shipment = frappe.get_doc({"doctype": "Books Shipment", "party": self.party.name, "items": [row]})
		shipment.insert().submit()

		invoice_row = make_shipment_invoice(shipment.name).items[0]

		self.assertEqual((invoice_row.qty, invoice_row.amount), (2, 50))

	def test_frappe_mappers_make_the_documents_actions_open(self):
		quote = self._submitted_quote()

		invoice = make_mapped_doc(MAPPERS.format("books_sales_quote", "make_sales_invoice"), quote.name)
		self.assertEqual((invoice.quote, invoice.party), (quote.name, self.party.name))
		self.assertEqual(invoice.items[0].rate, 75)

		mapped = make_sales_invoice(quote.name)
		mapped.make_auto_payment = 0
		submitted = mapped.insert().submit()
		payment = make_mapped_doc(MAPPERS.format("books_sales_invoice", "make_payment"), submitted.name)
		self.assertEqual((payment.payment_type, payment.amount), ("Receive", 150))
		reference = payment.payment_references[0]
		self.assertEqual(
			(reference.reference_type, reference.reference_name), (submitted.doctype, submitted.name)
		)

	def test_documents_map_only_through_whitelisted_mappers(self):
		quote = self._submitted_quote()
		with self.assertRaises(frappe.PermissionError):
			make_mapped_doc("frappe_books.accounting.returns.map_return", quote.name)

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

	def test_return_keeps_the_item_discounts(self):
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
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

	def test_an_invoice_cancels_the_payments_it_lists_through_its_controller(self):
		invoice = self._paid_invoice()
		payment = frappe.db.get_value("Books Payment For", {"reference_name": invoice.name}, "parent")
		linked_docs = get_payments_to_cancel(invoice.doctype, invoice.name)
		set_request(method="POST", path="/api/v2/method/run_doc_method")

		cancelled = run_invoice_method(invoice, "cancel_with_linked_docs", linked_docs=linked_docs)

		self.assertEqual([doc["name"] for doc in linked_docs], [payment])
		self.assertEqual(cancelled.docstatus, 2)
		self.assertEqual(frappe.db.get_value("Books Payment", payment, "docstatus"), 2)

	def test_an_invoice_copy_older_than_the_saved_one_cancels_nothing(self):
		invoice = self._paid_invoice()
		linked_docs = get_payments_to_cancel(invoice.doctype, invoice.name)
		frappe.db.set_value(invoice.doctype, invoice.name, "terms", "Changed elsewhere")
		set_request(method="POST", path="/api/v2/method/run_doc_method")

		self.assertRaises(
			frappe.TimestampMismatchError,
			run_invoice_method,
			*(invoice, "cancel_with_linked_docs"),
			linked_docs=linked_docs,
		)
		self.assertEqual(frappe.db.get_value("Books Payment", linked_docs[0]["name"], "docstatus"), 1)

	def test_a_return_still_blocks_cancelling_a_paid_invoice(self):
		invoice = self._paid_invoice()
		credit_note = map_return(invoice.doctype, invoice.name)
		credit_note.make_auto_payment = 0
		credit_note.insert().submit()

		payments = get_payments_to_cancel(invoice.doctype, invoice.name)
		set_request(method="POST", path="/api/v2/method/run_doc_method")

		self.assertEqual([doc["doctype"] for doc in payments], ["Books Payment"])
		self.assertRaises(
			frappe.LinkExistsError,
			run_invoice_method,
			*(invoice, "cancel_with_linked_docs"),
			linked_docs=payments,
		)

	def test_linked_documents_are_cancelled_with_the_users_rights(self):
		invoice = self._paid_invoice()
		linked_docs = get_payments_to_cancel(invoice.doctype, invoice.name)
		set_request(method="POST", path="/api/v2/method/run_doc_method")

		with self.set_user(ensure_user("books-cancel-user@example.com", "Books User")):
			self.assertRaises(
				frappe.PermissionError,
				run_invoice_method,
				*(invoice, "cancel_with_linked_docs"),
				linked_docs=linked_docs,
			)

		self.assertEqual(frappe.db.get_value("Books Payment", linked_docs[0]["name"], "docstatus"), 1)

	def test_a_duplicate_of_a_returned_invoice_is_a_new_invoice(self):
		invoice = self._paid_invoice(make_auto_payment=0)
		credit_note = map_return(invoice.doctype, invoice.name)
		credit_note.make_auto_payment = 0
		credit_note.insert().submit()

		# /books copies a document without the fields its DocType marks no_copy.
		duplicate = frappe.copy_doc(invoice.reload(), ignore_no_copy=False).insert()
		set_request(method="POST", path="/api/v2/method/run_doc_method")
		submitted = run_invoice_method(duplicate, "submit")

		self.assertEqual((submitted.is_returned, submitted.status), (0, "Unpaid"))
		self.assertEqual(submitted.outstanding_amount, submitted.grand_total)

	def test_submit_refuses_a_document_changed_since_it_was_read(self):
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, self.item.name, self.income.name
		)
		read = invoice.as_dict(convert_dates_to_str=True)
		invoice.save()
		set_request(method="POST", path="/api/v2/method/run_doc_method")

		self.assertRaises(frappe.TimestampMismatchError, run_doc_method_v2, "submit", read)
		self.assertEqual(run_invoice_method(invoice, "submit").docstatus, 1)

	def test_cancel_refuses_a_document_changed_since_it_was_read(self):
		invoice = self._paid_invoice()
		linked_docs = get_payments_to_cancel(invoice.doctype, invoice.name)
		frappe.db.set_value(invoice.doctype, invoice.name, "terms", "Changed elsewhere")
		set_request(method="POST", path="/api/v2/method/run_doc_method")

		for method, kwargs in (("cancel", {}), ("cancel_with_linked_docs", {"linked_docs": linked_docs})):
			with self.subTest(method=method):
				self.assertRaises(
					frappe.TimestampMismatchError, run_invoice_method, invoice, method, **kwargs
				)
		self.assertEqual(frappe.db.get_value("Books Payment", linked_docs[0]["name"], "docstatus"), 1)

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

	def test_automatic_payment_method_matches_the_account_and_refers_to_the_invoice(self):
		payable = make_account("Auto Payable", root_type="Liability", account_type="Payable")
		bank = make_account("Auto Bank", account_type="Bank")
		frappe.db.set_single_value("Books Defaults", "purchase_payment_account", bank.name)
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		supplier = make_party(payable.name, role="Supplier")
		cases = (
			("Books Sales Invoice", self.party.name, self.receivable.name, self.income.name, "Cash"),
			("Books Purchase Invoice", supplier.name, payable.name, self.expense.name, "Bank"),
		)
		for doctype, party, account, item_account, method in cases:
			with self.subTest(doctype=doctype):
				invoice = make_invoice(
					doctype, party, account, self.item.name, item_account, make_auto_payment=1
				).submit()

				payment = frappe.db.get_value("Books Payment For", {"reference_name": invoice.name}, "parent")
				self.assertEqual(
					frappe.db.get_value("Books Payment", payment, ["payment_method", "reference_id"]),
					(method, invoice.name),
				)

	def test_mapped_payment_needs_a_method_of_the_account_type(self):
		frappe.db.set_single_value(
			"Books Defaults", "sales_payment_account", make_account("Mapped Bank", account_type="Bank").name
		)
		invoice = self._paid_invoice(make_auto_payment=0)
		self.assertEqual(map_invoice_payment(invoice.doctype, invoice.name).payment_method, "Bank")

		frappe.db.set_value("Books Payment Method", "Bank", "type", "Transfer")
		with self.assertRaisesRegex(frappe.ValidationError, "Add a Bank payment method"):
			map_invoice_payment(invoice.doctype, invoice.name)

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
		document = {
			"doctype": "Books Sales Invoice",
			"party": self.party.name,
			"items": [{"item": self.item.name, "quantity": 1}],
			"__islocal": 1,
		}
		set_request(method="POST", path="/api/v2/method/run_doc_method")
		run_doc_method_v2("preview", document)
		self.assertTrue(frappe.response.docs.pop().make_auto_payment)

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


def run_invoice_method(invoice, method, **kwargs):
	"""Run a controller method on the client's copy of `invoice`, as /books does."""
	run_doc_method_v2(method, invoice.as_dict(convert_dates_to_str=True), kwargs)
	return frappe.get_doc(invoice.doctype, invoice.name)
