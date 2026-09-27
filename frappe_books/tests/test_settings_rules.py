import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.coa import STANDARD_CHART, ensure_chart, load_chart
from frappe_books.frappe_books.doctype.books_accounting_settings import books_accounting_settings
from frappe_books.frappe_books.doctype.books_accounting_settings.books_accounting_settings import (
	POINT_OF_SALE_FEATURES,
)
from frappe_books.frappe_books.doctype.books_inventory_settings import books_inventory_settings

COMPANY = {
	"company_name": "Settings Test Company",
	"fullname": "Settings Owner",
	"email": "owner@example.com",
	"country": "India",
	"bank_name": "Settings Test Bank",
	"fiscal_year_start": "2026-04-01",
	"fiscal_year_end": "2027-03-31",
}


class IntegrationTestSettingsRules(IntegrationTestCase):
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


def _accounting_settings(**values):
	frappe.db.set_single_value("Books Accounting Settings", {**COMPANY, **values})
	return frappe.get_single("Books Accounting Settings")
