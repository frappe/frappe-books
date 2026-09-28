import frappe
from frappe.permissions import add_permission, update_permission_property
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, now_datetime, nowdate, set_request

from frappe_books.tests.accounting import (
	ensure_user,
	make_account,
	make_item,
	make_party,
	make_tax,
	unique_name,
)
from frappe_books.ui_api import run_doc_method
from frappe_books.ui_bridge.database import BooksDatabaseBridge

COMPARED_FIELDS = ("netTotal", "grandTotal", "baseGrandTotal", "outstandingAmount", "discountAmount")
COMPARED_ROW_FIELDS = (
	"item",
	"rate",
	"amount",
	"tax",
	"account",
	"itemDiscountPercent",
	"itemDiscountedTotal",
	"itemTaxedTotal",
	"pricingRule",
	"isFreeItem",
)
NO_ROLE_USER = "books-preview-no-role@example.com"
CREATOR = "books-preview-creator@example.com"


class IntegrationTestInvoicePreview(IntegrationTestCase):
	def setUp(self):
		set_request(method="POST", path="/api/method/frappe_books.ui_api.run_doc_method")
		self.bridge = BooksDatabaseBridge()
		self.receivable = make_account("Preview Receivable", account_type="Receivable")
		self.income = make_account("Preview Sales", root_type="Income", account_type="Income Account")
		self.expense = make_account("Preview Expense", root_type="Expense", account_type="Expense Account")
		tax_account = make_account("Preview Tax", root_type="Liability", account_type="Tax")
		frappe.db.set_single_value(
			"Books Accounting Settings",
			{"discount_account": self.expense.name, "enable_pricing_rule": 1, "enable_price_list": 1},
		)
		self.party = make_party(self.receivable.name)
		self.item = make_item(self.income.name, self.expense.name, make_tax(tax_account.name).name, rate=100)
		self.values = self._invoice_values()

	def test_preview_matches_the_saved_calculation(self):
		preview = _preview(self.values)
		saved = self.bridge.insert("SalesInvoice", self.values)

		for field in COMPARED_FIELDS:
			self.assertEqual(preview[field], saved[field], field)
		self.assertEqual(
			_rows(preview["taxes"], ("account", "rate", "amount")),
			_rows(saved["taxes"], ("account", "rate", "amount")),
		)
		self.assertEqual(
			_rows(preview["items"], COMPARED_ROW_FIELDS), _rows(saved["items"], COMPARED_ROW_FIELDS)
		)
		self.assertEqual(preview["items"][0]["rate"], 80)
		self.assertTrue(preview["items"][-1]["isFreeItem"])

	def test_preview_keeps_client_row_names(self):
		preview = _preview(self.values)

		self.assertEqual([row["name"] for row in preview["items"]][:2], ["client-row-1", "client-row-2"])
		self.assertIsNone(preview["name"])

	def test_preview_writes_nothing(self):
		writes = frappe.db.transaction_writes
		invoices = frappe.db.count("Books Sales Invoice")

		_preview(self.values)

		self.assertEqual(frappe.db.transaction_writes, writes)
		self.assertEqual(frappe.db.count("Books Sales Invoice"), invoices)

	def test_preview_recalculates_an_edited_draft_without_saving_it(self):
		saved = self.bridge.insert("SalesInvoice", self.values)
		edited = {**saved, "items": [{**saved["items"][0], "quantity": 4}]}

		preview = _preview(edited, saved["name"])

		self.assertEqual(preview["netTotal"], 320)
		self.assertEqual(
			frappe.db.get_value("Books Sales Invoice", saved["name"], "net_total"), saved["netTotal"]
		)

	def test_preview_requires_create_or_write_permission(self):
		saved = self.bridge.insert("SalesInvoice", self.values)
		with self.set_user(ensure_user(NO_ROLE_USER)):
			self.assertRaises(frappe.PermissionError, _preview, self.values)
			self.assertRaises(frappe.PermissionError, _preview, saved, saved["name"])

	def test_preview_needs_create_for_a_new_invoice_and_write_for_a_saved_one(self):
		saved = self.bridge.insert("SalesInvoice", self.values)
		role = frappe.get_doc({"doctype": "Role", "role_name": unique_name("Books Invoice Creator")}).insert()
		add_permission("Books Sales Invoice", role.name)
		update_permission_property("Books Sales Invoice", role.name, 0, "create", 1)

		with self.set_user(ensure_user(CREATOR, role.name)):
			self.assertEqual(_preview(self.values)["netTotal"], saved["netTotal"])
			self.assertRaises(frappe.PermissionError, _preview, saved, saved["name"])

	def test_a_preview_of_a_draft_changed_since_it_was_read_is_refused(self):
		saved = self.bridge.insert("SalesInvoice", self.values)
		frappe.db.set_value("Books Sales Invoice", saved["name"], "terms", "Changed elsewhere")

		self.assertRaises(frappe.TimestampMismatchError, _preview, saved, saved["name"])

	def test_only_whitelisted_methods_run(self):
		with self.assertRaisesRegex(frappe.PermissionError, "not whitelisted"):
			run_doc_method("calculate", "SalesInvoice", self.values)

	def _invoice_values(self):
		free_item = make_item(self.income.name, self.expense.name)
		bundle_item = make_item(self.income.name, self.expense.name, rate=50)
		price_list = frappe.get_doc(
			{
				"doctype": "Books Price List",
				"name": unique_name("Preview Prices"),
				"is_enabled": 1,
				"is_sales": 1,
				"price_list_item": [{"item": self.item.name, "unit": "Unit", "rate": 80}],
			}
		).insert()
		coupon_rule = self._pricing_rule(
			self.item, is_coupon_code_based=1, price_discount_type="percentage", discount_percentage=25
		)
		self._pricing_rule(
			bundle_item,
			discount_type="Product Discount",
			free_item=free_item.name,
			free_item_quantity=1,
			free_item_unit="Unit",
		)
		coupon = frappe.get_doc(
			{
				"doctype": "Books Coupon Code",
				"coupon_name": frappe.generate_hash(length=8),
				"pricing_rule": coupon_rule.name,
				"valid_from": add_days(nowdate(), -1),
				"valid_to": add_days(nowdate(), 1),
			}
		).insert()
		return {
			"party": self.party.name,
			"date": now_datetime().isoformat(),
			"priceList": price_list.name,
			"discountPercent": 5,
			"coupons": [{"coupons": coupon.name}],
			"items": [
				{"name": "client-row-1", "item": self.item.name, "quantity": 2},
				{"name": "client-row-2", "item": bundle_item.name, "quantity": 1},
			],
		}

	def _pricing_rule(self, item, **values):
		return frappe.get_doc(
			{
				"doctype": "Books Pricing Rule",
				"title": unique_name("Preview Rule"),
				"applied_items": [{"item": item.name, "unit": "Unit"}],
				"discount_type": "Price Discount",
				"priority": "10",
				**values,
			}
		).insert()


def _preview(values, name=None):
	return run_doc_method("preview", "SalesInvoice", values, name)


def _rows(rows, fields):
	return [{field: row.get(field) for field in fields} for row in rows]
