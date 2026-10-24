# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.contacts.doctype.address.address import get_address_display
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.money import company_currency
from frappe_books.accounting.party import party_account
from frappe_books.company import default_company
from frappe_books.frappe_books.doctype.books_customer.books_customer import make_sales_invoice
from frappe_books.frappe_books.doctype.books_lead import books_lead
from frappe_books.tests.accounting import (
	make_account,
	make_address,
	make_customer,
	make_invoice,
	make_item,
	set_company_value,
	unique_name,
)

# On IntegrationTestCase, the doctype test records and all
# link-field test record dependencies are recursively loaded
# Use these module variables to add/remove to/from that list
EXTRA_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]
IGNORE_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]


def registered_customer(gstin):
	return frappe.get_doc(
		{
			"doctype": "Books Customer",
			"customer_name": unique_name("GST Customer"),
			"gst_category": "Registered Regular",
			"gstin": gstin,
		}
	).insert()


class IntegrationTestBooksCustomer(IntegrationTestCase):
	def test_registered_customer_requires_valid_gstin(self):
		with self.assertRaises(frappe.ValidationError):
			registered_customer("invalid")

		self.assertEqual(registered_customer("27AAAAA0000A1Z5").gstin, "27AAAAA0000A1Z5")

	def test_registered_customer_stores_normalized_gstin(self):
		customer = registered_customer(" 27aaaaa0000a1z5 ")
		self.assertEqual(customer.gstin, "27AAAAA0000A1Z5")
		self.assertEqual(customer.db_get("gstin"), "27AAAAA0000A1Z5")

	def test_unregistered_customer_clears_gstin(self):
		customer = make_customer(None, gst_category="Unregistered", gstin="27AAAAA0000A1Z5")
		self.assertFalse(customer.gstin)

	def test_default_account_must_be_receivable(self):
		payable = make_account("Customer Payable", root_type="Liability", account_type="Payable")
		with self.assertRaisesRegex(frappe.ValidationError, "must be of type Receivable,"):
			make_customer(payable.name)

	def test_customer_defaults_to_debtors_and_company_currency(self):
		if not frappe.db.exists("Books Account", "Debtors"):
			make_account("Debtors", account_type="Receivable", account_name="Debtors")
		customer = frappe.get_doc(
			{"doctype": "Books Customer", "customer_name": unique_name("Customer")}
		).insert()

		self.assertEqual(
			(customer.accounts[0].account, customer.default_currency), ("Debtors", company_currency())
		)

	def test_primary_address_prints_as_the_address_template_renders_it(self):
		address = make_address(address_line1="7 Hill Road", city="Pune")
		customer = make_customer(None, customer_primary_address=address.name)
		self.assertEqual(customer.primary_address, get_address_display(address.name))
		self.assertIn("7 Hill Road", customer.primary_address)

		customer.customer_primary_address = None
		customer.save()
		self.assertIsNone(customer.primary_address)

	def test_customer_account_belongs_to_the_one_company(self):
		receivable = make_account("Company Receivable", account_type="Receivable")
		customer = make_customer(receivable.name)
		self.assertEqual(customer.accounts[0].company, default_company())
		self.assertEqual(party_account("Books Customer", customer.name), receivable.name)

		customer.append("accounts", {"account": receivable.name})
		self.assertRaisesRegex(frappe.ValidationError, "only be 1 Account per Company", customer.save)

	def test_stale_customer_save_cannot_reset_outstanding(self):
		receivable = make_account("Stale Receivable", account_type="Receivable")
		income = make_account("Stale Income", root_type="Income")
		expense = make_account("Stale Expense", root_type="Expense")
		set_company_value("default_discount_account", expense.name)
		customer = make_customer(receivable.name)
		item = make_item(income.name, expense.name)
		make_invoice("Books Sales Invoice", customer.name, receivable.name, item.name, income.name).submit()

		customer.email = "stale@example.com"
		with self.assertRaises(frappe.TimestampMismatchError):
			customer.save()

	def test_lead_maps_to_a_customer_and_a_quotation(self):
		lead = frappe.get_doc(
			{
				"doctype": "Books Lead",
				"name": unique_name("Lead"),
				"email": "lead@example.com",
				"mobile": "9876543210",
			}
		).insert()

		customer = books_lead.make_customer(lead.name)
		quotation = books_lead.make_quotation(lead.name)

		self.assertEqual(
			(customer.doctype, customer.name, customer.email, customer.phone, customer.lead_name),
			("Books Customer", lead.name, lead.email, lead.mobile, lead.name),
		)
		self.assertEqual((quotation.party_name, quotation.quotation_to), (lead.name, "Books Lead"))
		customer.insert()
		self.assertEqual(lead.reload().status, "Converted")

	def test_customer_maps_to_an_invoice_with_its_defaults(self):
		receivable = make_account("Mapped Receivable", account_type="Receivable")
		cash = make_account("Mapped Cash", account_type="Cash")
		frappe.db.set_single_value("Books Defaults", "sales_payment_account", cash.name)
		customer = make_customer(receivable.name)

		invoice = make_sales_invoice(customer.name)

		self.assertEqual((invoice.customer, invoice.account), (customer.name, receivable.name))
		self.assertEqual(invoice.make_auto_payment, 1)
