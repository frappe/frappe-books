# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_supplier.books_supplier import make_purchase_invoice
from frappe_books.tests.accounting import (
	make_account,
	make_invoice,
	make_item,
	make_supplier,
	set_company_value,
	unique_name,
)


class IntegrationTestBooksSupplier(IntegrationTestCase):
	def test_default_account_must_be_payable(self):
		receivable = make_account("Supplier Receivable", account_type="Receivable")
		with self.assertRaisesRegex(frappe.ValidationError, "must be of type Payable,"):
			make_supplier(receivable.name)

	def test_supplier_defaults_to_creditors(self):
		if not frappe.db.exists("Books Account", "Creditors"):
			make_account("Creditors", root_type="Liability", account_type="Payable", account_name="Creditors")
		supplier = frappe.get_doc(
			{"doctype": "Books Supplier", "supplier_name": unique_name("Supplier")}
		).insert()

		self.assertEqual(supplier.default_account, "Creditors")

	def test_supplier_outstanding_follows_its_purchase_invoices(self):
		payable = make_account("Supplier Payable", root_type="Liability", account_type="Payable")
		income = make_account("Supplier Income", root_type="Income")
		expense = make_account("Supplier Expense", root_type="Expense")
		set_company_value("default_discount_account", expense.name)
		supplier = make_supplier(payable.name)
		item = make_item(income.name, expense.name)
		invoice = make_invoice("Books Purchase Invoice", supplier.name, payable.name, item.name, expense.name)
		invoice.submit()

		self.assertEqual(supplier.db_get("outstanding_amount"), 180)
		party_entries = frappe.get_all(
			"Books Ledger Entry",
			filters={"voucher_no": invoice.name, "party": ["is", "set"]},
			pluck="party_type",
		)
		self.assertEqual(party_entries, ["Books Supplier"])
		invoice.cancel()
		self.assertEqual(supplier.db_get("outstanding_amount"), 0)

	def test_supplier_maps_to_a_purchase_invoice(self):
		payable = make_account("Mapped Payable", root_type="Liability", account_type="Payable")
		supplier = make_supplier(payable.name)

		invoice = make_purchase_invoice(supplier.name)

		self.assertEqual((invoice.supplier, invoice.account), (supplier.name, payable.name))
