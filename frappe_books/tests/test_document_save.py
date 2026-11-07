"""A failed dependent save fails its parent save, so the request rolls back both."""

from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.frappe_books.doctype.books_lead.books_lead import BooksLead, make_sales_quote
from frappe_books.tests.accounting import enable_features, make_account, make_item, unique_name


class IntegrationTestDocumentSave(IntegrationTestCase):
	def test_party_converts_the_linked_lead_even_when_the_names_differ(self):
		lead = frappe.get_doc({"doctype": "Books Lead", "name": unique_name("Source Lead")}).insert()
		party = frappe.get_doc(
			{
				"doctype": "Books Party",
				"name": unique_name("Customer"),
				"role": "Customer",
				"from_lead": lead.name,
			}
		).insert()
		self.assertNotEqual(lead.name, party.name)
		self.assertEqual(lead.reload().status, "Converted")

	def test_deleting_a_converted_party_reopens_its_lead(self):
		lead = frappe.get_doc({"doctype": "Books Lead", "name": unique_name("Source Lead")}).insert()
		party = frappe.get_doc(
			{
				"doctype": "Books Party",
				"name": unique_name("Customer"),
				"role": "Customer",
				"from_lead": lead.name,
			}
		).insert()

		party.delete()

		self.assertEqual(lead.reload().status, "Interested")

	def test_rejected_lead_conversion_fails_the_party_insert(self):
		lead = frappe.get_doc({"doctype": "Books Lead", "name": unique_name("Source Lead")}).insert()
		with patch.object(BooksLead, "validate", self.reject_save, create=True):
			with self.assertRaises(frappe.ValidationError):
				frappe.get_doc(
					{
						"doctype": "Books Party",
						"name": unique_name("Rejected Party"),
						"role": "Customer",
						"from_lead": lead.name,
					}
				).insert()

	def test_quote_made_from_a_lead_saves_whatever_the_lead_status(self):
		enable_features()
		item = make_item(
			make_account("Lead Income", root_type="Income").name,
			make_account("Lead Expense", root_type="Expense").name,
		)
		lead = frappe.get_doc(
			{"doctype": "Books Lead", "name": unique_name("Quote Lead"), "status": "Replied"}
		).insert()

		quote = make_sales_quote(lead.name)
		quote.append("items", {"item": item.name, "quantity": 1, "rate": 10})
		quote.insert()

		self.assertEqual(
			(quote.reference_type, quote.party, quote.status), ("Books Lead", lead.name, "Saved")
		)

	@staticmethod
	def reject_save(*args, **kwargs):
		frappe.throw("Dependent save rejected")
