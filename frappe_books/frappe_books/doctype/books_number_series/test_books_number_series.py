# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.model.naming import InvalidNamingSeriesError, make_autoname
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_number_series


class IntegrationTestBooksNumberSeries(IntegrationTestCase):
	def test_names_count_in_frappe_series_from_the_start(self):
		prefix = f"TEST-{frappe.generate_hash(length=6)}-"
		series = make_series(prefix, start=7, pad_zeros=3)

		self.assertEqual(make_autoname(series.pattern), f"{prefix}007")
		self.assertEqual(make_autoname(series.pattern), f"{prefix}008")
		self.assertEqual(frappe.db.get_value("Series", prefix, "current", order_by="name"), 8)
		self.assertEqual(series.current, 8)

	def test_documents_are_named_from_their_series(self):
		series = frappe.get_doc("Books Number Series", make_number_series("JournalEntry"))
		journal = frappe.get_doc({"doctype": "Books Journal Entry", "number_series": series.name})
		journal.set_new_name()

		self.assertEqual(journal.name, f"{series.name}001")
		self.assertEqual(series.current, 1)

	def test_interface_reads_the_counter_from_frappe_series(self):
		series = make_series(f"TEST-{frappe.generate_hash(length=6)}-", start=1001)

		self.assertEqual(frappe.get_doc("Books Number Series", series.name).as_dict().current, 1000)
		self.assertIn(series.name, frappe.get_list("Books Number Series", pluck="name"))

	def test_saving_the_series_does_not_change_its_counter(self):
		series = frappe.get_doc("Books Number Series", make_number_series("SalesInvoice"))
		series.update({"current": 500})
		series.save()

		self.assertEqual(series.current, 0)

	def test_recreated_series_continues_after_the_names_it_gave(self):
		prefix = f"TEST-{frappe.generate_hash(length=6)}-"
		make_autoname(make_series(prefix, start=1001).pattern)
		frappe.delete_doc("Books Number Series", prefix)

		self.assertEqual(make_series(prefix, start=1).current, 1001)

	def test_renamed_series_counts_from_the_start(self):
		series = make_series(f"TEST-{frappe.generate_hash(length=6)}-", start=1001)
		new_prefix = f"TEST-{frappe.generate_hash(length=6)}-"
		series.rename(new_prefix)

		self.assertEqual(make_autoname(series.pattern), f"{new_prefix}1001")

	def test_rejects_unsafe_prefix(self):
		self.assertRaisesRegex(
			frappe.ValidationError,
			"cannot be used /, \\?, &, =, % in a Number Series name",
			make_series,
			"BAD/",
		)

	def test_rejects_prefix_frappe_cannot_name_with(self):
		self.assertRaises(InvalidNamingSeriesError, make_series, "BAD@")

	def test_needs_a_reference_type_a_document_can_use(self):
		series = frappe.get_doc(
			{"doctype": "Books Number Series", "name": f"TEST-{frappe.generate_hash(length=6)}-"}
		)
		self.assertRaises(frappe.MandatoryError, series.insert)
		series.reference_type = "-"
		self.assertRaises(frappe.ValidationError, series.insert)

	def test_documents_take_only_a_series_of_their_type(self):
		journal = frappe.get_doc(
			{"doctype": "Books Journal Entry", "number_series": make_number_series("Payment")}
		)
		self.assertRaisesRegex(frappe.ValidationError, "is not for Books Journal Entry", journal.insert)


def make_series(prefix, start=1, pad_zeros=4):
	return frappe.get_doc(
		{
			"doctype": "Books Number Series",
			"name": prefix,
			"start": start,
			"pad_zeros": pad_zeros,
			"reference_type": "SalesInvoice",
		}
	).insert()
