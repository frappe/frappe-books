# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.company import company_value, default_company, save_company


class IntegrationTestBooksCompany(IntegrationTestCase):
	def test_site_has_one_company(self):
		second = frappe.get_doc({"doctype": "Books Company", "company_name": "Second Books Company"})
		self.assertRaisesRegex(frappe.ValidationError, "keeps one company", second.insert)

	def test_abbreviation_defaults_to_the_name_initials(self):
		frappe.db.set_value("Books Company", default_company(), "abbr", None)
		initials = "".join(word[0] for word in default_company().split()).upper()

		self.assertEqual(save_company({}).abbr, initials)
		self.assertEqual(save_company({"abbr": " Lin "}).abbr, "Lin")
		self.assertEqual(company_value("abbr"), "Lin")

	def test_country_and_currency_are_frappe_system_settings(self):
		with self.change_settings("System Settings", country="Switzerland", currency="CHF"):
			company = frappe.get_doc("Books Company", default_company())
			self.assertEqual((company.country, company.default_currency), ("Switzerland", "CHF"))
