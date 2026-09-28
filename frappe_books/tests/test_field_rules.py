import frappe
from frappe.tests import IntegrationTestCase


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
		for fieldname in ("display_precision", "internal_precision"):
			with self.subTest(fieldname=fieldname):
				settings.reload()
				settings.set(fieldname, -1)
				self.assertRaises(frappe.NonNegativeError, settings.save)

	def test_pos_settings_need_a_cash_account(self):
		settings = frappe.get_single("Books Pos Settings")
		settings.cash_account = None
		self.assertRaises(frappe.MandatoryError, settings.save)
