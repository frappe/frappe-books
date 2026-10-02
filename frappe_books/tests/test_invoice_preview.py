import frappe
from frappe.api.v2 import run_doc_method
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

COMPARED_FIELDS = ("net_total", "grand_total", "base_grand_total", "outstanding_amount", "total_discount")
COMPARED_ROW_FIELDS = (
	"item",
	"rate",
	"amount",
	"tax",
	"account",
	"item_discount_percent",
	"item_discounted_total",
	"item_taxed_total",
	"pricing_rule",
	"is_free_item",
)
NO_ROLE_USER = "books-preview-no-role@example.com"
CREATOR = "books-preview-creator@example.com"


class IntegrationTestInvoicePreview(IntegrationTestCase):
	def setUp(self):
		set_request(method="POST", path="/api/v2/method/run_doc_method")
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
		saved = _insert(self.values)

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
		self.assertTrue(preview["items"][-1]["is_free_item"])

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
		saved = _insert(self.values)
		# /books leaves the quantities that follow an edited quantity for the server to fill.
		row = {
			key: value for key, value in saved["items"][0].items() if key not in ("qty", "transfer_quantity")
		}
		edited = {**saved, "items": [{**row, "quantity": 4}]}

		preview = _preview(edited)

		self.assertEqual(preview["net_total"], 320)
		self.assertEqual(
			frappe.db.get_value("Books Sales Invoice", saved["name"], "net_total"), saved["net_total"]
		)

	def test_preview_requires_create_or_write_permission(self):
		saved = _insert(self.values)
		with self.set_user(ensure_user(NO_ROLE_USER)):
			self.assertRaises(frappe.PermissionError, _preview, self.values)
			self.assertRaises(frappe.PermissionError, _preview, saved)

	def test_preview_needs_create_for_a_new_invoice_and_write_for_a_saved_one(self):
		saved = _insert(self.values)
		role = frappe.get_doc({"doctype": "Role", "role_name": unique_name("Books Invoice Creator")}).insert()
		add_permission("Books Sales Invoice", role.name)
		update_permission_property("Books Sales Invoice", role.name, 0, "create", 1)

		with self.set_user(ensure_user(CREATOR, role.name)):
			# Frappe's /api/v2 run_doc_method also needs write; the controller's rule needs create.
			invoice = frappe.get_doc(_new_document(self.values))
			invoice.preview()
			self.assertEqual(invoice.net_total, saved["net_total"])
			self.assertRaises(frappe.PermissionError, _preview, saved)

	def test_a_preview_of_a_draft_changed_since_it_was_read_is_refused(self):
		saved = _insert(self.values)
		frappe.db.set_value("Books Sales Invoice", saved["name"], "terms", "Changed elsewhere")

		self.assertRaises(frappe.TimestampMismatchError, _preview, saved)

	def test_preview_starts_a_new_invoice_with_its_defaults(self):
		frappe.db.set_single_value(
			"Books Defaults",
			{"sales_invoice_terms": "Pay in 30 days", "sales_payment_account": self.expense.name},
		)
		invoice = frappe.new_doc("Books Sales Invoice", party=self.party.name)
		invoice.make_auto_payment = None

		invoice.preview()

		self.assertEqual(
			invoice.number_series,
			frappe.db.get_single_value("Books Defaults", "sales_invoice_number_series") or "SINV-",
		)
		self.assertEqual((invoice.terms, invoice.make_auto_payment), ("Pay in 30 days", 1))

	def test_a_row_tax_left_out_follows_the_item_and_a_cleared_one_stays_cleared(self):
		row = {"item": self.item.name, "quantity": 1}
		values = {"party": self.party.name, "date": str(now_datetime()), "items": [row]}
		self.assertEqual(_preview(values)["items"][0]["tax"], self.item.tax)

		cleared = {**values, "items": [{**row, "tax": ""}]}
		saved = _insert(cleared)
		self.assertFalse(_preview(cleared)["items"][0].get("tax"))
		self.assertFalse(saved["items"][0].get("tax"))
		self.assertEqual((saved["grand_total"], saved["taxes"]), (100, []))
		resaved = frappe.get_doc("Books Sales Invoice", saved["name"]).save()
		self.assertFalse(resaved.items[0].tax)

	def test_only_whitelisted_methods_run(self):
		with self.assertRaisesRegex(frappe.PermissionError, "not whitelisted"):
			run_doc_method("calculate", _new_document(self.values))

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
			"date": str(now_datetime()),
			"price_list": price_list.name,
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


def _preview(document):
	"""Preview the client's copy of an invoice, as /books does through run_doc_method."""
	if "name" not in document:
		document = _new_document(document)
	run_doc_method("preview", document)
	return frappe.response.docs.pop().as_dict(convert_dates_to_str=True)


def _new_document(values):
	return {"doctype": "Books Sales Invoice", **values, "__islocal": 1}


def _insert(values):
	"""Save new values as /books does: new rows go without their client names."""
	rows = [{key: value for key, value in row.items() if key != "name"} for row in values["items"]]
	invoice = frappe.get_doc({"doctype": "Books Sales Invoice", **values, "items": rows}).insert()
	return invoice.as_dict(convert_dates_to_str=True)


def _rows(rows, fields):
	return [{field: row.get(field) for field in fields} for row in rows]
