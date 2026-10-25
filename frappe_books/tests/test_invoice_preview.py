import frappe
from frappe.api.v2 import run_doc_method
from frappe.permissions import add_permission, update_permission_property
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, nowdate, set_request

from frappe_books.tests.accounting import (
	ensure_user,
	make_account,
	make_customer,
	make_item,
	make_price_list,
	make_tax,
	set_company_value,
	unique_name,
)

COMPARED_FIELDS = (
	"net_total",
	"total_taxes_and_charges",
	"grand_total",
	"base_grand_total",
	"outstanding_amount",
)
COMPARED_ROW_FIELDS = (
	"item_code",
	"price_list_rate",
	"rate",
	"amount",
	"item_tax_template",
	"income_account",
	"discount_percentage",
	"discount_amount",
	"pricing_rules",
	"is_free_item",
)
TAX_FIELDS = ("charge_type", "account_head", "rate", "tax_amount", "total")
NO_ROLE_USER = "books-preview-no-role@example.com"
CREATOR = "books-preview-creator@example.com"


class IntegrationTestInvoicePreview(IntegrationTestCase):
	def setUp(self):
		set_request(method="POST", path="/api/v2/method/run_doc_method")
		self.receivable = make_account("Preview Receivable", account_type="Receivable")
		self.income = make_account("Preview Sales", root_type="Income", account_type="Income Account")
		self.expense = make_account("Preview Expense", root_type="Expense", account_type="Expense Account")
		tax_account = make_account("Preview Tax", root_type="Liability", account_type="Tax")
		set_company_value("default_discount_account", self.expense.name)
		frappe.db.set_single_value(
			"Books Accounting Settings", {"enable_pricing_rule": 1, "enable_price_list": 1}
		)
		self.party = make_customer(self.receivable.name)
		self.item = make_item(
			self.income.name, self.expense.name, make_tax(tax_account.name).name, standard_rate=100
		)
		self.values = self._invoice_values()

	def test_preview_matches_the_saved_calculation(self):
		preview = _preview(self.values)
		saved = _insert(self.values)

		for field in COMPARED_FIELDS:
			self.assertEqual(preview[field], saved[field], field)
		self.assertEqual(_rows(preview["taxes"], TAX_FIELDS), _rows(saved["taxes"], TAX_FIELDS))
		self.assertEqual(
			_rows(preview["items"], COMPARED_ROW_FIELDS), _rows(saved["items"], COMPARED_ROW_FIELDS)
		)
		# The price list's 80, less the coupon's 25%.
		self.assertEqual((preview["items"][0]["price_list_rate"], preview["items"][0]["rate"]), (80, 60))
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
		# /books leaves the quantity that follows an edited one for the server to fill.
		row = {key: value for key, value in saved["items"][0].items() if key != "qty"}
		edited = {**saved, "items": [{**row, "stock_qty": 4}]}

		preview = _preview(edited)

		# Four at 80 less the coupon's 25%.
		self.assertEqual(preview["net_total"], 240)
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
			invoice.naming_series,
			frappe.db.get_single_value("Books Defaults", "sales_invoice_number_series") or "SINV-",
		)
		self.assertEqual((invoice.terms, invoice.make_auto_payment), ("Pay in 30 days", 1))

	def test_a_row_tax_left_out_follows_the_item_and_a_cleared_one_stays_cleared(self):
		row = {"item_code": self.item.name, "qty": 1}
		values = {"customer": self.party.name, "posting_date": nowdate(), "items": [row]}
		template = self.item.taxes[0].item_tax_template
		self.assertEqual(_preview(values)["items"][0]["item_tax_template"], template)

		cleared = {**values, "items": [{**row, "item_tax_template": ""}]}
		saved = _insert(cleared)
		self.assertFalse(_preview(cleared)["items"][0].get("item_tax_template"))
		self.assertFalse(saved["items"][0].get("item_tax_template"))
		self.assertEqual((saved["grand_total"], saved["taxes"]), (100, []))
		resaved = frappe.get_doc("Books Sales Invoice", saved["name"]).save()
		self.assertFalse(resaved.items[0].item_tax_template)

	def test_only_whitelisted_methods_run(self):
		with self.assertRaisesRegex(frappe.PermissionError, "not whitelisted"):
			run_doc_method("calculate", _new_document(self.values))

	def _invoice_values(self):
		free_item = make_item(self.income.name, self.expense.name)
		bundle_item = make_item(self.income.name, self.expense.name, standard_rate=50)
		price_list = make_price_list((self.item.name, "Unit", 80))
		coupon_rule = self._pricing_rule(
			self.item, coupon_code_based=1, rate_or_discount="Discount Percentage", discount_percentage=25
		)
		self._pricing_rule(
			bundle_item,
			price_or_product_discount="Product",
			free_item=free_item.name,
			free_qty=1,
			free_item_uom="Unit",
		)
		coupon = frappe.get_doc(
			{
				"doctype": "Books Coupon Code",
				"coupon_name": frappe.generate_hash(length=8),
				"pricing_rule": coupon_rule.name,
				"valid_from": add_days(nowdate(), -1),
				"valid_upto": add_days(nowdate(), 1),
			}
		).insert()
		return {
			"customer": self.party.name,
			"posting_date": nowdate(),
			"selling_price_list": price_list.name,
			"coupon_code": coupon.name,
			"items": [
				{"name": "client-row-1", "item_code": self.item.name, "qty": 2},
				{"name": "client-row-2", "item_code": bundle_item.name, "qty": 1},
			],
		}

	def _pricing_rule(self, item, **values):
		return frappe.get_doc(
			{
				"doctype": "Books Pricing Rule",
				"title": unique_name("Preview Rule"),
				"items": [{"item_code": item.name, "uom": "Unit"}],
				"price_or_product_discount": "Price",
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
