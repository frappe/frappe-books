import frappe
from frappe.client import insert
from frappe.model.naming import NamingSeries
from frappe.tests import IntegrationTestCase

from frappe_books.series import new_item_names
from frappe_books.tests.accounting import ensure_user, make_account, make_item, make_supplier

BOOKS_USER = "books-series-user@example.com"
NO_ROLE_USER = "books-series-no-role@example.com"


class IntegrationTestItemSeries(IntegrationTestCase):
	def setUp(self):
		self.prefix = f"SN{frappe.generate_hash(length=6)}-"
		self.item = make_series_item(has_serial_no=1, serial_no_series=self.prefix)

	def test_names_count_in_frappe_series_from_1001(self):
		first = new_item_names("Books Serial No", self.item, 2)
		second = new_item_names("Books Serial No", self.item, 3)

		self.assertEqual(first + second, [f"{self.prefix}{number}" for number in range(1001, 1006)])
		self.assertEqual(NamingSeries(f"{self.prefix}.####").get_current_value(), 1005)

	def test_names_continue_from_the_series_counter(self):
		NamingSeries(f"{self.prefix}.####").update_counter(1019)

		self.assertEqual(new_item_names("Books Serial No", self.item, 1), [f"{self.prefix}1020"])

	def test_names_skip_hand_made_serial_numbers(self):
		taken = f"{self.prefix}1002"
		frappe.get_doc({"doctype": "Books Serial No", "serial_no": taken, "item_code": self.item}).insert()

		names = new_item_names("Books Serial No", self.item, 2)

		self.assertEqual(names, [f"{self.prefix}1001", f"{self.prefix}1003"])

	def test_batch_names_follow_the_item_series(self):
		prefix = f"B{frappe.generate_hash(length=6)}-"
		item = make_series_item(has_batch_no=1, batch_number_series=f" {prefix} ")

		self.assertEqual(new_item_names("Books Batch", item, 1), [f"{prefix}1001"])
		self.assertEqual(new_item_names("Books Batch", item, 1), [f"{prefix}1002"])

	def test_item_without_a_series_gets_no_names(self):
		frappe.db.set_value("Books Item", self.item, "has_serial_no", 0)

		self.assertEqual(new_item_names("Books Serial No", self.item, 1), [])
		self.assertEqual(new_item_names("Books Batch", make_series_item(has_batch_no=1), 1), [])

	def test_series_prefix_cannot_hold_url_characters(self):
		self.assertRaisesRegex(
			frappe.ValidationError,
			"Batch Number Series cannot contain the following characters: /, \\?, &, =, %",
			make_series_item,
			has_batch_no=1,
			batch_number_series="BAD/",
		)

	def test_series_prefix_must_suit_frappe_naming(self):
		self.assertRaises(frappe.ValidationError, make_series_item, has_serial_no=1, serial_no_series="BAD@")

	def test_books_user_takes_names_from_the_series(self):
		with self.set_user(ensure_user(BOOKS_USER, "Books User")):
			names = new_item_names("Books Serial No", self.item, 1)

		self.assertEqual(names, [f"{self.prefix}1001"])

	def test_names_require_permission_to_create_serial_numbers(self):
		with self.set_user(ensure_user(NO_ROLE_USER)):
			self.assertRaises(frappe.PermissionError, new_item_names, "Books Serial No", self.item, 1)


class IntegrationTestSeriesBatches(IntegrationTestCase):
	def setUp(self):
		self.prefix = f"B{frappe.generate_hash(length=6)}-"
		self.item = make_series_item(has_batch_no=1, batch_number_series=self.prefix)
		payable = make_account("Series Payable", root_type="Liability", account_type="Payable")
		self.supplier = make_supplier(payable.name).name

	def test_receipts_create_empty_batches_from_the_item_series(self):
		row = {"item_code": self.item, "qty": 1}
		invoice_row = {**row, "price_list_rate": 10}
		invoice = frappe.get_doc(self._purchase("Books Purchase Invoice", invoice_row)).insert()
		receipt = frappe.get_doc(
			self._purchase("Books Purchase Receipt", {**row, "warehouse": "Stores", "rate": 10})
		).insert()
		movement = insert(movement_values("Material Receipt", {**row, "basic_rate": 10}))

		batches = [invoice.items[0].batch_no, receipt.items[0].batch_no, movement["items"][0]["batch_no"]]
		self.assertEqual(batches, [f"{self.prefix}{number}" for number in range(1001, 1004)])
		for batch in batches:
			self.assertEqual(frappe.db.get_value("Books Batch", batch, "item"), self.item)

	def test_saving_again_keeps_the_batch(self):
		receipt = frappe.get_doc(
			movement_values("Material Receipt", {"item_code": self.item, "qty": 1, "basic_rate": 10})
		).insert()
		receipt.save()

		self.assertEqual(receipt.items[0].batch_no, f"{self.prefix}1001")
		self.assertEqual(frappe.db.count("Books Batch", {"item": self.item}), 1)

	def test_rows_that_take_stock_out_still_require_a_batch(self):
		issue = frappe.get_doc(
			movement_values("Material Issue", {"item_code": self.item, "qty": 1, "basic_rate": 10})
		)

		self.assertRaisesRegex(frappe.ValidationError, "Please select a batch first", issue.insert)
		self.assertFalse(frappe.db.exists("Books Batch", {"item": self.item}))

	def test_item_without_a_batch_series_still_requires_a_batch(self):
		item = make_series_item(has_batch_no=1)
		receipt = frappe.get_doc(
			movement_values("Material Receipt", {"item_code": item, "qty": 1, "basic_rate": 10})
		)

		self.assertRaisesRegex(frappe.ValidationError, "Please select a batch first", receipt.insert)

	def _purchase(self, doctype, row):
		return {"doctype": doctype, "supplier": self.supplier, "items": [row]}


def movement_values(purpose, row):
	warehouse = "t_warehouse" if purpose == "Material Receipt" else "s_warehouse"
	return {"doctype": "Books Stock Entry", "purpose": purpose, "items": [{warehouse: "Stores", **row}]}


def make_series_item(**values):
	income = make_account("Series Income", root_type="Income")
	received = make_account("Series Received", root_type="Liability")
	return make_item(income.name, received.name, is_stock_item=1, **values).name
