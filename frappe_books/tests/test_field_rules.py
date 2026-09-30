import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import get_datetime, now_datetime, nowdate

from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party


class IntegrationTestFieldRules(IntegrationTestCase):
	"""Rules the Books app applied to its own schema fields, now enforced by the DocTypes."""

	def test_series_start_and_padding_cannot_be_negative(self):
		for fieldname in ("start", "pad_zeros"):
			with self.subTest(fieldname=fieldname):
				series = frappe.new_doc("Books Number Series", name=f"NEG-{frappe.generate_hash(length=6)}-")
				series.update({"start": 1, "pad_zeros": 4, "reference_type": "SalesInvoice", fieldname: -1})
				self.assertRaises(frappe.NonNegativeError, series.insert)

	def test_precision_cannot_be_negative(self):
		settings = frappe.get_single("Books System Settings")
		# The display precision's own range check, with the form's message, comes first.
		for fieldname, error in (
			("display_precision", frappe.ValidationError),
			("internal_precision", frappe.NonNegativeError),
		):
			with self.subTest(fieldname=fieldname):
				settings.reload()
				settings.set(fieldname, -1)
				self.assertRaises(error, settings.save)

	def test_pos_settings_need_a_cash_account(self):
		settings = frappe.get_single("Books Pos Settings")
		settings.cash_account = None
		self.assertRaises(frappe.MandatoryError, settings.save)

	def test_documents_default_to_the_current_date(self):
		receivable = make_account("Dated Receivable", account_type="Receivable").name
		income = make_account("Dated Income", root_type="Income").name
		item = make_item(income, make_account("Dated Expense", root_type="Expense").name).name
		started = now_datetime().replace(microsecond=0)
		invoice = make_invoice(
			"Books Sales Invoice", make_party(receivable).name, receivable, item, income, date=None
		)

		self.assertGreaterEqual(get_datetime(invoice.date), started)
		self.assertEqual(str(frappe.new_doc("Books Journal Entry").posting_date), nowdate())
