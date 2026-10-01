# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import json

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.accounting.accounts import PAYMENT_ACCOUNT_TYPES
from frappe_books.frappe_books.doctype.books_defaults.books_defaults import ACCOUNT_TYPES, PRINT_FORMAT_FIELDS


class IntegrationTestBooksDefaults(IntegrationTestCase):
	def test_pickers_offer_what_the_settings_accept(self):
		link_filters = {
			df.fieldname: json.loads(df.link_filters)
			for df in frappe.get_meta("Books Defaults").fields
			if df.link_filters
		}

		print_formats = {**PRINT_FORMAT_FIELDS, "pos_print_template": "Books Sales Invoice"}
		for fieldname, doctype in print_formats.items():
			self.assertEqual(link_filters[fieldname], [["Print Format", "doc_type", "=", doctype]])
		account = [
			["Books Account", "is_group", "=", 0],
			["Books Account", "account_type", "in", list(PAYMENT_ACCOUNT_TYPES)],
		]
		for fieldname in ACCOUNT_TYPES:
			self.assertEqual(link_filters[fieldname], account)
