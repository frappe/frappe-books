# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.money import company_currency
from frappe_books.frappe_books.doctype.books_lead.books_lead import make_customer, make_sales_quote
from frappe_books.frappe_books.doctype.books_party.books_party import make_sales_invoice
from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party, unique_name

# On IntegrationTestCase, the doctype test records and all
# link-field test record dependencies are recursively loaded
# Use these module variables to add/remove to/from that list
EXTRA_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]
IGNORE_TEST_RECORD_DEPENDENCIES = []  # eg. ["User"]


class IntegrationTestBooksParty(IntegrationTestCase):
	def test_registered_party_requires_valid_gstin(self):
		with self.assertRaises(frappe.ValidationError):
			frappe.get_doc(
				{
					"doctype": "Books Party",
					"name": unique_name("GST Party"),
					"role": "Customer",
					"gst_type": "Registered Regular",
					"gstin": "invalid",
				}
			).insert()

		party = frappe.get_doc(
			{
				"doctype": "Books Party",
				"name": unique_name("GST Party"),
				"role": "Customer",
				"gst_type": "Registered Regular",
				"gstin": "27AAAAA0000A1Z5",
			}
		).insert()
		self.assertEqual(party.gstin, "27AAAAA0000A1Z5")

	def test_registered_party_stores_normalized_gstin(self):
		party = frappe.get_doc(
			{
				"doctype": "Books Party",
				"name": unique_name("GST Party"),
				"role": "Customer",
				"gst_type": "Registered Regular",
				"gstin": " 27aaaaa0000a1z5 ",
			}
		).insert()
		self.assertEqual(party.gstin, "27AAAAA0000A1Z5")
		self.assertEqual(party.db_get("gstin"), "27AAAAA0000A1Z5")

	def test_unregistered_party_clears_gstin(self):
		party = frappe.get_doc(
			{
				"doctype": "Books Party",
				"name": unique_name("GST Party"),
				"role": "Customer",
				"gst_type": "Unregistered",
				"gstin": "27AAAAA0000A1Z5",
			}
		).insert()
		self.assertFalse(party.gstin)

	def test_default_account_follows_the_role(self):
		receivable = make_account("Role Receivable", account_type="Receivable")
		payable = make_account("Role Payable", root_type="Liability", account_type="Payable")
		for account, role, message in (
			(payable, "Customer", "must be of type Receivable,"),
			(receivable, "Supplier", "must be of type Payable,"),
		):
			with self.subTest(role=role), self.assertRaisesRegex(frappe.ValidationError, message):
				make_party(account.name, role=role)

		self.assertEqual(make_party(payable.name, role="Both").default_account, payable.name)

	def test_party_defaults_to_the_role_ledger_and_company_currency(self):
		if not frappe.db.exists("Books Account", "Debtors"):
			make_account("Debtors", account_type="Receivable", account_name="Debtors")
		party = frappe.get_doc(
			{"doctype": "Books Party", "name": unique_name("Default Party"), "role": "Customer"}
		).insert()

		self.assertEqual((party.default_account, party.currency), ("Debtors", company_currency()))

	def test_stale_party_save_cannot_reset_outstanding(self):
		receivable = make_account("Stale Receivable", account_type="Receivable")
		income = make_account("Stale Income", root_type="Income")
		expense = make_account("Stale Expense", root_type="Expense")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		make_invoice("Books Sales Invoice", party.name, receivable.name, item.name, income.name).submit()

		party.email = "stale@example.com"
		with self.assertRaises(frappe.TimestampMismatchError):
			party.save()

	def test_outstanding_nets_sales_against_purchases(self):
		account = make_account("Both Account", account_type="Receivable")
		payable = make_account("Both Payable", root_type="Liability", account_type="Payable")
		income = make_account("Both Income", root_type="Income")
		expense = make_account("Both Expense", root_type="Expense")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		party = make_party(account.name, role="Both")
		item = make_item(income.name, expense.name)
		make_invoice("Books Sales Invoice", party.name, account.name, item.name, income.name).submit()
		purchase = make_invoice("Books Purchase Invoice", party.name, payable.name, item.name, expense.name)
		purchase.items[0].quantity = 1
		purchase.save().submit()

		self.assertEqual(party.db_get("outstanding_amount"), 180 - 90)

	def test_lead_maps_to_a_customer_and_a_quote(self):
		lead = frappe.get_doc(
			{
				"doctype": "Books Lead",
				"name": unique_name("Lead"),
				"email": "lead@example.com",
				"mobile": "9876543210",
			}
		).insert()

		customer = make_customer(lead.name)
		quote = make_sales_quote(lead.name)

		self.assertEqual(
			(customer.name, customer.role, customer.email, customer.phone, customer.from_lead),
			(lead.name, "Customer", lead.email, lead.mobile, lead.name),
		)
		self.assertEqual((quote.party, quote.reference_type), (lead.name, "Books Lead"))
		customer.insert()
		self.assertEqual(lead.reload().status, "Converted")

	def test_party_maps_to_an_invoice_with_its_defaults(self):
		receivable = make_account("Mapped Receivable", account_type="Receivable")
		cash = make_account("Mapped Cash", account_type="Cash")
		frappe.db.set_single_value("Books Defaults", "sales_payment_account", cash.name)
		party = make_party(receivable.name)

		invoice = make_sales_invoice(party.name)

		self.assertEqual((invoice.party, invoice.account), (party.name, receivable.name))
		self.assertEqual(invoice.make_auto_payment, 1)
