import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.coa import STANDARD_CHART, chart_options, ensure_chart, load_chart
from frappe_books.frappe_books.doctype.books_accounting_settings import books_accounting_settings
from frappe_books.frappe_books.doctype.books_accounting_settings.books_accounting_settings import (
	POINT_OF_SALE_FEATURES,
)
from frappe_books.frappe_books.doctype.books_inventory_settings import books_inventory_settings
from frappe_books.series import default_series
from frappe_books.tests.accounting import make_account, make_number_series, unique_name

COMPANY = {
	"company_name": "Settings Test Company",
	"fullname": "Settings Owner",
	"email": "owner@example.com",
	"bank_name": "Settings Test Bank",
	"fiscal_year_start": "2026-04-01",
	"fiscal_year_end": "2027-03-31",
}


class IntegrationTestSettingsRules(IntegrationTestCase):
	def test_every_chart_links_each_account_to_a_parent_it_contains(self):
		for chart in chart_options():
			with self.subTest(chart=chart["name"]):
				accounts = load_chart(chart["name"])
				names = {account.name for account in accounts}
				self.assertTrue(all(account.name == account.name.strip() for account in accounts))
				self.assertTrue(all(account.parent in names for account in accounts if account.parent))

	def test_enabling_discounting_creates_the_discount_account(self):
		ensure_chart(load_chart(STANDARD_CHART))
		frappe.db.delete("Books Account", {"name": "Discounts"})
		settings = _accounting_settings(enable_discounting=0, discount_account=None)

		settings.enable_discounting = 1
		settings.save()

		self.assertEqual(settings.discount_account, "Discounts")
		account = frappe.get_doc("Books Account", "Discounts")
		self.assertEqual(
			(account.parent_books_account, account.root_type, account.account_type, account.is_group),
			("Indirect Income", "Income", "Income Account", 0),
		)

	def test_point_of_sale_without_inventory_turns_on_its_inventory_features(self):
		frappe.db.set_single_value("Books Inventory Settings", dict.fromkeys(POINT_OF_SALE_FEATURES, 0))
		settings = _accounting_settings(enable_point_of_sale_with_out_inventory=0)

		settings.enable_point_of_sale_with_out_inventory = 1
		settings.save()

		inventory_settings = frappe.get_single("Books Inventory Settings")
		for fieldname in POINT_OF_SALE_FEATURES:
			self.assertTrue(inventory_settings.get(fieldname), fieldname)

	def test_a_pos_can_list_all_items(self):
		settings = frappe.get_single("Books Pos Settings")
		cash = make_account("POS Cash", account_type="Cash").name
		settings.update({"item_visibility": "All Items", "cash_account": cash})
		settings.save()
		profile = frappe.get_doc(
			{
				"doctype": "Books Pos Profile",
				"name": unique_name("POS Profile"),
				"inventory": "Stores",
				"item_visibility": "All Items",
			}
		).insert()

		self.assertEqual((settings.item_visibility, profile.item_visibility), ("All Items", "All Items"))

	def test_one_way_switches_cannot_be_turned_off(self):
		_accounting_settings()
		switches = {
			"Books Accounting Settings": books_accounting_settings.ONE_WAY_SWITCHES,
			"Books Inventory Settings": books_inventory_settings.ONE_WAY_SWITCHES,
		}
		for doctype, fieldnames in switches.items():
			for fieldname in fieldnames:
				with self.subTest(fieldname=fieldname):
					frappe.db.set_single_value(doctype, fieldname, 1)
					settings = frappe.get_single(doctype)
					settings.set(fieldname, 0)
					self.assertRaisesRegex(frappe.ValidationError, "cannot be disabled", settings.save)

	def test_email_and_phone_values_must_be_valid(self):
		invalid_values = [
			("Books Party", {"role": "Customer", "email": "not-an-email"}, frappe.InvalidEmailAddressError),
			("Books Party", {"role": "Customer", "phone": "call me"}, frappe.InvalidPhoneNumberError),
			("Books Lead", {"email": "not-an-email"}, frappe.InvalidEmailAddressError),
			("Books Lead", {"mobile": "call me"}, frappe.InvalidPhoneNumberError),
		]
		for doctype, values, error in invalid_values:
			with self.subTest(doctype=doctype, values=values):
				doc = frappe.get_doc({"doctype": doctype, "name": unique_name("Format Test"), **values})
				self.assertRaises(error, doc.insert)
		settings = _accounting_settings()
		settings.email = "not-an-email"
		self.assertRaises(frappe.InvalidEmailAddressError, settings.save)

	def test_display_precision_stays_between_zero_and_nine(self):
		for precision in (-1, 10):
			with self.subTest(precision=precision):
				settings = frappe.get_single("Books System Settings")
				settings.display_precision = precision
				self.assertRaisesRegex(
					frappe.ValidationError, "should have a value between 0 and 9", settings.save
				)

	def test_default_number_series_come_from_books_defaults_else_the_standard_prefix(self):
		series = make_number_series("SalesInvoice")
		frappe.db.set_single_value(
			"Books Defaults", {"sales_invoice_number_series": series, "payment_number_series": None}
		)

		self.assertEqual(
			[
				default_series(doctype)
				for doctype in ("Books Sales Invoice", "Books Payment", "Books Pricing Rule")
			],
			[series, "PAY-", "PRLE-"],
		)


def _accounting_settings(**values):
	frappe.db.set_single_value("Books Accounting Settings", {**COMPANY, **values})
	return frappe.get_single("Books Accounting Settings")
