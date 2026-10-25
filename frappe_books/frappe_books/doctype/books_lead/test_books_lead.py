# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_address, make_customer, unique_name


class IntegrationTestBooksLead(IntegrationTestCase):
	def test_a_new_lead_is_named_by_its_full_name_and_starts_as_lead(self):
		lead = make_lead()

		self.assertEqual((lead.name, lead.status), (lead.lead_name, "Lead"))

	def test_a_new_lead_makes_its_address_from_its_address_values(self):
		lead = make_lead(address_line1="12 Harbour Road", city="Pune")
		[name] = frappe.get_all(
			"Dynamic Link",
			filters={"parenttype": "Address", "link_doctype": lead.doctype, "link_name": lead.name},
			pluck="parent",
		)
		address = frappe.get_doc("Address", name)

		self.assertEqual(
			(address.address_title, address.city, address.is_primary_address),
			(lead.lead_name, "Pune", 1),
		)
		self.assertEqual(address.country, frappe.db.get_single_value("System Settings", "country"))

	def test_a_new_lead_without_address_values_makes_no_address(self):
		lead = make_lead()

		self.assertFalse(frappe.db.exists("Dynamic Link", {"parenttype": "Address", "link_name": lead.name}))

	def test_deleting_a_lead_deletes_the_addresses_only_it_links(self):
		lead = make_lead()
		customer = make_customer(None)
		own = make_address(links=[link(lead)])
		shared = make_address(links=[link(lead), link(customer)])

		lead.delete()

		self.assertFalse(frappe.db.exists("Address", own.name))
		self.assertFalse(frappe.get_doc("Address", shared.name).has_link(lead.doctype, lead.name))


def make_lead(**values):
	return frappe.get_doc({"doctype": "Books Lead", "lead_name": unique_name("Lead"), **values}).insert()


def link(doc):
	return {"link_doctype": doc.doctype, "link_name": doc.name}
