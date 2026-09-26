import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, now_datetime, nowdate

from frappe_books.tests.accounting import make_account, make_item, make_party, make_tax, unique_name
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


class IntegrationTestInvoicePreview(IntegrationTestCase):
	def setUp(self):
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
		preview = self.bridge.preview("SalesInvoice", self.values)
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
		preview = self.bridge.preview("SalesInvoice", self.values)

		self.assertEqual([row["name"] for row in preview["items"]][:2], ["client-row-1", "client-row-2"])
		self.assertIsNone(preview["name"])

	def test_preview_writes_nothing(self):
		writes = frappe.db.transaction_writes
		invoices = frappe.db.count("Books Sales Invoice")

		self.bridge.preview("SalesInvoice", self.values)

		self.assertEqual(frappe.db.transaction_writes, writes)
		self.assertEqual(frappe.db.count("Books Sales Invoice"), invoices)

	def test_preview_recalculates_an_edited_draft_without_saving_it(self):
		saved = self.bridge.insert("SalesInvoice", self.values)
		edited = {**saved, "items": [{**saved["items"][0], "quantity": 4}]}

		preview = self.bridge.preview("SalesInvoice", edited, saved["name"])

		self.assertEqual(preview["netTotal"], 320)
		self.assertEqual(
			frappe.db.get_value("Books Sales Invoice", saved["name"], "net_total"), saved["netTotal"]
		)

	def test_preview_requires_create_or_write_permission(self):
		saved = self.bridge.insert("SalesInvoice", self.values)
		_ensure_user(NO_ROLE_USER)
		with self.set_user(NO_ROLE_USER):
			self.assertRaises(frappe.PermissionError, self.bridge.preview, "SalesInvoice", self.values)
			self.assertRaises(
				frappe.PermissionError, self.bridge.preview, "SalesInvoice", saved, saved["name"]
			)

	def test_preview_is_only_for_invoices(self):
		with self.assertRaisesRegex(frappe.ValidationError, "cannot preview"):
			self.bridge.preview("Party", {"role": "Customer"})

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


def _rows(rows, fields):
	return [{field: row.get(field) for field in fields} for row in rows]


def _ensure_user(email):
	if not frappe.db.exists("User", email):
		frappe.get_doc(
			{"doctype": "User", "email": email, "first_name": "No Role", "send_welcome_email": 0}
		).insert(ignore_permissions=True)
