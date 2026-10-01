"""Frappe print formats for Books documents."""

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import money_in_words, now_datetime
from frappe.utils.pdf import read_options_from_html
from frappe.utils.print_utils import get_print

from frappe_books.accounting.money import company_currency
from frappe_books.frappe_books.doctype.books_defaults.books_defaults import (
	PRINT_FORMAT_FIELDS,
	set_print_formats,
)
from frappe_books.printing import (
	books_format,
	default_print_format,
	get_print_hints,
	get_print_settings,
	get_print_totals,
	preview_print_format,
	set_default_print_format,
)
from frappe_books.tests.accounting import (
	ensure_user,
	make_account,
	make_invoice,
	make_item,
	make_party,
	make_tax,
	unique_name,
)
from frappe_books.tests.test_units import make_uom

MANAGER = "books-print-manager@example.com"
USER = "books-print-user@example.com"


class IntegrationTestPrinting(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Print Receivable", account_type="Receivable")
		self.income = make_account("Print Sales", root_type="Income", account_type="Income Account")
		self.expense = make_account("Print Expense", root_type="Expense", account_type="Expense Account")
		self.cash = make_account("Print Cash", account_type="Cash")
		frappe.db.set_single_value(
			"Books Accounting Settings", {"discount_account": self.expense.name, "enable_partial_payment": 1}
		)
		self.party = make_party(self.receivable.name)
		self.tax_account = make_account("Print Tax", root_type="Liability", account_type="Tax")
		self.item = make_item(self.income.name, self.expense.name, make_tax(self.tax_account.name).name)

	def test_built_in_formats_render_invoice_and_payment(self):
		invoice = self.make_invoice()
		payment = self.make_payment({invoice: 99})
		grand_total = books_format(invoice.grand_total, "Currency", invoice.currency)

		for doc, print_format, expected in (
			(invoice, "Business - Sales Invoice", grand_total),
			(invoice, "Business-POS - Sales Invoice", "Thank you! Please visit again."),
			(payment, "Business - Payment", "Amount Paid"),
		):
			with self.subTest(print_format=print_format):
				html = get_print(doc.doctype, doc.name, print_format=print_format)

				self.assertIn(doc.name, html)
				self.assertIn(self.party.name, html)
				self.assertIn(expected, html)
				# Jinja prints an undefined name back as its tag.
				self.assertNotIn("{{", html)

	def test_built_in_formats_set_their_borderless_pdf_page(self):
		invoice = self.make_invoice()

		for print_format, width, height in (
			("Business - Sales Invoice", "21cm", "29.7cm"),
			("Business-POS - Sales Invoice", "8cm", "22cm"),
		):
			with self.subTest(print_format=print_format):
				html = get_print(invoice.doctype, invoice.name, print_format=print_format)
				_html, options = read_options_from_html(html)

				self.assertEqual(options["page-width"], width)
				self.assertEqual(options["page-height"], height)
				self.assertEqual(options["margin-left"], "0")
				self.assertEqual(options["margin-top"], "0")

	def test_invoice_formats_print_the_rate_per_unit_of_the_quantity(self):
		box = make_uom("Box")
		item = make_item(
			self.income.name, self.expense.name, uom_conversions=[{"uom": box, "conversion_factor": 50}]
		)
		party = make_party(self.receivable.name, role="Both").name
		payable = make_account("Print Payable", root_type="Liability", account_type="Payable").name
		row = {"item": item.name, "transfer_unit": box, "transfer_quantity": 6, "rate": 62}
		for doctype, print_format, values in (
			("Books Sales Invoice", "Business - Sales Invoice", {}),
			("Books Sales Invoice", "Business-POS - Sales Invoice", {}),
			("Books Sales Quote", "Business - Quote", {}),
			("Books Purchase Invoice", "Business - Purchase Invoice", {"account": payable}),
		):
			with self.subTest(print_format=print_format):
				doc = frappe.get_doc(
					{"doctype": doctype, "party": party, "date": now_datetime(), "items": [row], **values}
				).insert()
				html = get_print(doctype, doc.name, print_format=print_format)

				self.assertIn(books_format(3100, "Currency", doc.currency), html)
				self.assertNotIn(books_format(62, "Currency", doc.currency), html)

	def test_built_in_formats_print_their_doctype(self):
		formats = dict(
			frappe.get_all(
				"Print Format",
				filters={"module": "Frappe Books", "standard": "Yes"},
				fields=["name", "doc_type"],
				as_list=True,
			)
		)

		self.assertEqual(
			formats,
			{
				"Business - Quote": "Books Sales Quote",
				"Business - Sales Invoice": "Books Sales Invoice",
				"Business - Purchase Invoice": "Books Purchase Invoice",
				"Business - Payment": "Books Payment",
				"Business - Shipment": "Books Shipment",
				"Business-POS - Sales Invoice": "Books Sales Invoice",
			},
		)

	def test_books_format_follows_books_system_settings(self):
		settings = {"locale": "en-IN", "display_precision": 2, "date_format": "MMM d, y"}
		with self.change_settings("Books System Settings", settings):
			self.assertEqual(books_format(1234567.125, "Currency", "INR"), "₹ 12,34,567.13")
			self.assertEqual(books_format(10, "Float"), "10.00")
			self.assertEqual(books_format("2026-09-30 13:45:00", "Date"), "Sep 30, 2026")
			self.assertEqual(books_format(None, "Currency"), "")

		with self.change_settings("Books System Settings", {"locale": "de-DE", "display_precision": 1}):
			self.assertEqual(books_format(1234.56, "Currency", "EUR"), "€ 1.234,6")

	def test_print_settings_show_the_company_address_and_gstin(self):
		address = frappe.get_doc(
			{
				"doctype": "Books Address",
				"name": unique_name("Print Address"),
				"address_line1": "12 MG Road",
				"city": "Mumbai",
				"country": "India",
			}
		).insert()
		frappe.db.set_single_value("Books Print Settings", "address", address.name)
		frappe.db.set_single_value("Books Accounting Settings", "gstin", "27AAACB1234A1Z5")

		settings = get_print_settings()

		self.assertEqual(settings["address"], address.address_display)
		self.assertEqual(settings["gstin"], "27AAACB1234A1Z5")

	def test_invoice_prints_the_amount_each_payment_allocates_to_it(self):
		invoice, other = self.make_invoice(), self.make_invoice()
		self.make_payment({invoice: 50}).cancel()
		payment = self.make_payment({invoice: 100, other: 98})

		totals = get_print_totals(invoice)

		self.assertEqual(
			totals["payment_details"],
			[{"amount": 100, "amount_paid": 198, "payment_method": "Cash", "outstanding_amount": 98}],
		)
		self.assertEqual(payment.amount_paid, 198)

	def test_invoice_totals_and_amount_in_words(self):
		invoice = self.make_invoice()

		totals = get_print_totals(invoice)

		self.assertEqual(totals["sub_total"], 180)
		self.assertEqual(totals["grand_total_in_words"], money_in_words(198, invoice.currency))

	def test_payment_prints_every_invoice_tax(self):
		payment = self.make_payment({self.make_invoice(): 99})

		totals = get_print_totals(payment)

		self.assertEqual(totals["taxes"], [{"account": self.tax_account.name, "amount": 9}])
		self.assertEqual(totals["sub_total"], 90)
		self.assertEqual(totals["amount_paid_in_words"], money_in_words(99, company_currency()))

	def test_payment_prints_the_realised_tax_it_stored(self):
		paid_tax = make_account("Print Tax Paid", root_type="Liability", account_type="Tax")
		other_tax = make_account("Print Other Tax", root_type="Liability", account_type="Tax")
		tax = frappe.get_doc(
			{
				"doctype": "Books Tax",
				"name": unique_name("Print Cash Tax"),
				"details": [
					{"account": self.tax_account.name, "rate": 10, "payment_account": paid_tax.name},
					{"account": other_tax.name, "rate": 5},
				],
			}
		).insert()
		self.item.db_set("tax", tax.name)
		invoice = self.make_invoice()
		self.make_payment({invoice: Decimal("10.04")})
		# A fresh share of 18 * 10.04 / 207 rounds to 0.87; the second payment realised 0.88.
		payment = self.make_payment({invoice: Decimal("10.04")})

		totals = get_print_totals(payment)

		self.assertEqual([row.amount for row in payment.taxes], [Decimal("0.88")])
		self.assertEqual(
			totals["taxes"],
			[
				{"account": self.tax_account.name, "amount": Decimal("0.88")},
				{"account": other_tax.name, "amount": Decimal("0.44")},
			],
		)
		self.assertEqual(totals["sub_total"], Decimal("8.72"))

	def test_preview_renders_unsaved_html_for_a_document(self):
		invoice = self.make_invoice()

		with self.set_user(ensure_user(MANAGER, "Books Manager")):
			preview = preview_print_format(
				invoice.doctype,
				invoice.name,
				"<p>{{ doc.name }} {{ doc.party }}</p>",
				"@page { size: 8cm 22cm; }",
			)

		self.assertIn(f"<p>{invoice.name} {self.party.name}</p>", preview["html"])
		self.assertIn("@page { size: 8cm 22cm; }", preview["style"])

	def test_preview_needs_print_format_and_document_rights(self):
		invoice = self.make_invoice()
		log = frappe.get_doc({"doctype": "Error Log", "error": "Print preview test"}).insert()

		with self.set_user(ensure_user(USER, "Books User")):
			self.assertRaises(
				frappe.PermissionError, preview_print_format, invoice.doctype, invoice.name, "<p></p>"
			)
		with self.set_user(ensure_user(MANAGER, "Books Manager")):
			self.assertRaises(frappe.PermissionError, preview_print_format, log.doctype, log.name, "<p></p>")

	def test_preview_reports_the_template_error_line(self):
		invoice = self.make_invoice()

		self.assertRaisesRegex(
			frappe.ValidationError,
			"Line 2",
			preview_print_format,
			invoice.doctype,
			invoice.name,
			"<p>\n{% if doc.name %}</p>",
		)

	def test_print_hints_list_document_and_print_settings_fields(self):
		hints = get_print_hints("Books Sales Invoice")

		self.assertEqual(hints["doc"]["party"], "Customer")
		self.assertEqual(hints["doc"]["items"][0]["rate"], "Rate")
		self.assertNotIn("items_section_break_7", hints["doc"])
		self.assertEqual(hints["print"]["company_name"], "Company Name")
		self.assertEqual(hints["print"]["gstin"], "GSTIN")

	def test_books_defaults_show_and_set_the_doctype_default_print_format(self):
		print_format = make_print_format("Books Journal Entry")
		# Frappe stores no virtual single values since frappe#43435; the fields need none.
		frappe.db.delete("Singles", {"doctype": "Books Defaults", "field": ("in", list(PRINT_FORMAT_FIELDS))})

		with self.set_user(ensure_user(MANAGER, "Books Manager")):
			set_print_formats({"journal_entry_print_template": print_format})
			self.assertEqual(default_print_format("Books Journal Entry"), print_format)
			shown = frappe.get_single("Books Defaults").as_dict()
			self.assertEqual(shown.journal_entry_print_template, print_format)

			set_print_formats({"journal_entry_print_template": None})
			self.assertIsNone(default_print_format("Books Journal Entry"))

	def test_a_settings_save_keeps_the_default_print_formats_set_elsewhere(self):
		# Frappe before frappe#43435 stores virtual single values; this copy holds none.
		frappe.db.set_single_value("Books Defaults", "journal_entry_print_template", None)
		print_format = make_print_format("Books Journal Entry")
		set_default_print_format("Books Journal Entry", print_format)

		save_defaults({"sales_invoice_terms": "Net 30", "journal_entry_print_template": None})

		self.assertEqual(default_print_format("Books Journal Entry"), print_format)

	def test_only_settings_writers_set_print_formats_of_the_fields_shown(self):
		with self.set_user(ensure_user(USER, "Books User")):
			self.assertRaises(
				frappe.PermissionError, set_print_formats, {"journal_entry_print_template": None}
			)
		self.assertRaisesRegex(
			frappe.ValidationError,
			"no print format field sales_terms",
			set_print_formats,
			{"sales_terms": None},
		)

	def test_print_formats_must_be_for_the_doctype_they_print(self):
		message = "not a print format for Books Sales Invoice"
		self.assertRaisesRegex(
			frappe.ValidationError,
			message,
			set_print_formats,
			{"sales_invoice_print_template": "Business - Payment"},
		)
		self.assertRaisesRegex(
			frappe.ValidationError, message, save_defaults, {"pos_print_template": "Business - Payment"}
		)
		profile = frappe.get_doc(
			{
				"doctype": "Books Pos Profile",
				"name": unique_name("Print Profile"),
				"inventory": "Stores",
				"pos_print_template": "Business - Payment",
			}
		)
		self.assertRaisesRegex(frappe.ValidationError, message, profile.insert)

	def make_invoice(self):
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			make_auto_payment=0,
		)
		return invoice.submit()

	def make_payment(self, allocations):
		payment = frappe.get_doc(
			{
				"doctype": "Books Payment",
				"party": self.party.name,
				"date": now_datetime(),
				"payment_type": "Receive",
				"account": self.receivable.name,
				"payment_account": self.cash.name,
				"payment_method": "Cash",
				"amount": sum(allocations.values()),
				"payment_references": [
					{"reference_type": invoice.doctype, "reference_name": invoice.name, "amount": amount}
					for invoice, amount in allocations.items()
				],
			}
		).insert()
		return payment.submit()


def make_print_format(doctype):
	return (
		frappe.get_doc(
			{
				"doctype": "Print Format",
				"name": unique_name("Test Format"),
				"doc_type": doctype,
				"custom_format": 1,
				"html": "<p>{{ doc.name }}</p>",
			}
		)
		.insert()
		.name
	)


def save_defaults(values):
	"""Save Books Defaults as /books does: the loaded copy with the changed values."""
	defaults = frappe.get_single("Books Defaults")
	defaults.update(values)
	defaults.save()
