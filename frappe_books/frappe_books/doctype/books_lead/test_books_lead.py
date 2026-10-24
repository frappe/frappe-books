# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_address, make_customer, unique_name


class IntegrationTestBooksLead(IntegrationTestCase):
	def test_a_new_lead_is_named_by_its_full_name_and_starts_as_lead(self):
		lead = make_lead()

		self.assertEqual((lead.name, lead.status), (lead.lead_name, "Lead"))

	def test_deleting_a_lead_deletes_the_addresses_only_it_links(self):
		lead = make_lead()
		customer = make_customer(None)
		own = make_address(links=[link(lead)])
		shared = make_address(links=[link(lead), link(customer)])

		lead.delete()

		self.assertFalse(frappe.db.exists("Address", own.name))
		self.assertFalse(frappe.get_doc("Address", shared.name).has_link(lead.doctype, lead.name))


def make_lead():
	return frappe.get_doc({"doctype": "Books Lead", "lead_name": unique_name("Lead")}).insert()


def link(doc):
	return {"link_doctype": doc.doctype, "link_name": doc.name}
