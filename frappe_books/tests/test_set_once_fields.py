import frappe
from frappe import client
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, make_item, make_number_series


class IntegrationTestSetOnceFields(IntegrationTestCase):
	def test_item_stock_settings_cannot_change_after_insert(self):
		income = make_account("Set Once Income", root_type="Income").name
		expense = make_account("Set Once Expense", root_type="Expense").name
		received = make_account("Set Once Received", root_type="Liability").name
		unit = frappe.get_doc({"doctype": "Books Uom", "name": frappe.generate_hash()}).insert().name
		for fieldname, changes, is_tracked in (
			("unit", {"unit": unit}, False),
			("item_type", {"item_type": "Service"}, False),
			# a tracked item needs a liability account, so only the locked field can fail
			("track_item", {"track_item": 1, "expense_account": received}, False),
			# only tracked items have batches and serial numbers
			("has_batch", {"has_batch": 1}, True),
			("has_serial_number", {"has_serial_number": 1}, True),
		):
			with self.subTest(fieldname=fieldname):
				item = make_item(income, received, track_item=1) if is_tracked else make_item(income, expense)
				item.update(changes)
				self.assertRaises(frappe.CannotChangeConstantError, item.save)

	def test_account_tree_fields_cannot_change_after_insert(self):
		group = make_account("Set Once Group", is_group=1)
		for fieldname, value, is_group in (
			# a ledger takes its parent's root type, so only a root group keeps its own
			("root_type", "Expense", 1),
			("parent_books_account", group.name, 0),
			("is_group", 1, 0),
		):
			with self.subTest(fieldname=fieldname):
				account = make_account("Set Once Account", is_group=is_group)
				account.set(fieldname, value)
				self.assertRaises(frappe.CannotChangeConstantError, account.save)

	def test_account_type_is_empty_until_chosen(self):
		account = make_account("Untyped Account")

		self.assertFalse(frappe.db.get_value("Books Account", account.name, "account_type"))

	def test_account_type_can_be_set_once_when_empty(self):
		account = make_account("Set Once Type")
		account.account_type = "Bank"
		account.save()

		for value in ("Cash", None):
			with self.subTest(value=value):
				account.reload()
				account.account_type = value
				self.assertRaises(frappe.CannotChangeConstantError, account.save)

	def test_number_series_format_cannot_change_after_insert(self):
		for fieldname, value in (("reference_type", "Payment"), ("pad_zeros", 6), ("start", 50)):
			with self.subTest(fieldname=fieldname):
				series = frappe.get_doc("Books Number Series", make_number_series("SalesInvoice"))
				series.set(fieldname, value)
				self.assertRaises(frappe.CannotChangeConstantError, series.save)

	def test_a_whole_document_save_keeps_unchanged_locked_fields(self):
		account = make_account("Set Once Root", is_group=1)
		values = client.get("Books Account", account.name)

		client.save({**values, "account_type": "Bank"})

		self.assertEqual(frappe.db.get_value("Books Account", account.name, "account_type"), "Bank")
