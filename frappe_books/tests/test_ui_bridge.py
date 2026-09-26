"""Integration coverage for the original Vue UI's Frappe compatibility layer."""

from base64 import b64encode
from datetime import datetime, timedelta

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.tests.accounting import make_account, make_item, make_party, unique_name
from frappe_books.ui_api import lifecycle_action
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries
from frappe_books.ui_bridge.database import BooksDatabaseBridge


class IntegrationTestUiBridge(IntegrationTestCase):
	def setUp(self):
		self.bridge = BooksDatabaseBridge()

	def test_account_crud_keeps_frappe_tree_indices(self):
		name = unique_name("UI Tree Account")
		parent = make_account("UI Tree Root")
		parent.is_group = 1
		parent.save()
		self.bridge.insert(
			"Account",
			{
				"name": name,
				"rootType": "Asset",
				"isGroup": False,
				"parentAccount": parent.name,
				"lft": 0,
				"rgt": 0,
			},
		)
		account = frappe.get_doc("Books Account", name)
		self.assertGreater(account.lft, 0)
		self.assertGreater(account.rgt, account.lft)
		indices = (account.lft, account.rgt)

		self.bridge.update("Account", {"name": name, "lft": -1, "rgt": -1})
		account.reload()
		self.assertEqual((account.lft, account.rgt), indices)
		self.bridge.delete("Account", name)
		self.assertFalse(frappe.db.exists("Books Account", name))

	def test_single_read_omits_unstored_frappe_defaults(self):
		frappe.db.delete("Singles", {"doctype": "Books Pos Settings"})

		self.assertEqual(
			self.bridge.get("POSSettings", "POSSettings"),
			{"name": "POSSettings"},
		)

	def test_missing_document_matches_interface_empty_read(self):
		self.assertEqual(
			self.bridge.get("PurchaseInvoice", "New Purchase Invoice 01"),
			{},
		)

	def test_return_outstanding_uses_interface_positive_balance_contract(self):
		values = self.bridge._row_to_source(
			"SalesInvoice",
			{
				"name": "SINV-RETURN",
				"return_against": "SINV-ORIGINAL",
				"outstanding_amount": -42,
			},
			["outstandingAmount"],
		)

		self.assertEqual(values["outstandingAmount"], 42)
		self.assertIn(
			"return_against",
			self.bridge._target_fields("SalesInvoice", ["outstandingAmount"]),
		)
		self.assertEqual(
			self.bridge._target_values("PaymentFor", {"amount": "-42"})["amount"],
			42,
		)

	def test_pay_accounts_are_translated_between_interface_and_frappe_semantics(self):
		target = self.bridge._target_values(
			"Payment",
			{
				"paymentType": "Pay",
				"account": "Cash",
				"paymentAccount": "Creditors",
			},
		)
		self.assertEqual(target["account"], "Creditors")
		self.assertEqual(target["payment_account"], "Cash")

		source = self.bridge._row_to_source(
			"Payment",
			{
				"name": "PAY-RETURN",
				"payment_type": "Pay",
				"account": "Creditors",
				"payment_account": "Cash",
			},
			["paymentType", "account", "paymentAccount"],
		)
		self.assertEqual(source["account"], "Cash")
		self.assertEqual(source["paymentAccount"], "Creditors")

	def test_autoincrement_query_returns_latest_numeric_name(self):
		first = frappe.get_doc({"doctype": "Books Item Enquiry", "item": "First bridge enquiry"}).insert(
			ignore_permissions=True
		)
		second = frappe.get_doc({"doctype": "Books Item Enquiry", "item": "Second bridge enquiry"}).insert(
			ignore_permissions=True
		)

		self.assertEqual(
			BooksBespokeQueries().call("getLastInserted", ["ItemEnquiry"]),
			max(int(first.name), int(second.name)),
		)

	def test_crud_uses_interface_names_and_iso_datetimes(self):
		name = unique_name("Web UOM")
		inserted = self.bridge.insert("UOM", {"name": name, "isWhole": True})

		self.assertEqual(inserted["name"], name)
		self.assertEqual(inserted["isWhole"], 1)
		self.assertEqual(inserted["createdBy"], frappe.session.user)
		self.assertEqual(inserted["modifiedBy"], frappe.session.user)
		self.assertIn("T", inserted["created"])
		self.assertEqual(self.bridge.get("UOM", name)["createdBy"], frappe.session.user)

		rows = self.bridge.get_all(
			"UOM",
			{
				"fields": ["*"],
				"filters": {"isWhole": ["=", True]},
			},
		)
		row = next(row for row in rows if row["name"] == name)
		self.assertEqual(row["createdBy"], frappe.session.user)

		next_modified = datetime.fromisoformat(inserted["modified"]) + timedelta(seconds=1)
		expected_modified = datetime.fromisoformat(inserted["modified"])
		expected_modified = expected_modified.replace(
			microsecond=expected_modified.microsecond // 1000 * 1000
		)
		updated = self.bridge.update(
			"UOM",
			{
				"name": name,
				"isWhole": False,
				"modified": next_modified.isoformat(),
				"__expectedModified": expected_modified.isoformat(),
			},
		)
		self.assertEqual(updated["modified"], self.bridge.get("UOM", name)["modified"])
		self.assertEqual(self.bridge.get("UOM", name)["isWhole"], 0)
		with self.assertRaises(frappe.TimestampMismatchError):
			self.bridge.update(
				"UOM",
				{
					"name": name,
					"isWhole": True,
					"__expectedModified": inserted["modified"],
				},
			)

		self.bridge.delete("UOM", name)
		self.assertFalse(self.bridge.exists("UOM", name))

	def test_system_settings_round_trip_only_persisted_values(self):
		self.bridge.update(
			"SystemSettings",
			{"dateFormat": "yyyy-MM-dd", "darkMode": True},
		)

		settings = self.bridge.get("SystemSettings", "SystemSettings")

		self.assertEqual(settings["dateFormat"], "yyyy-MM-dd")
		self.assertEqual(settings["darkMode"], "1")
		self.assertEqual(
			frappe.db.get_single_value("Books System Settings", "date_format"),
			"yyyy-MM-dd",
		)
		self.assertEqual(
			frappe.db.get_single_value("Books System Settings", "dark_mode"),
			1,
		)

	def test_doctype_references_are_translated_by_field_type(self):
		receivable = make_account("Bridge Quote Receivable", account_type="Receivable")
		income = make_account("Bridge Quote Income", root_type="Income", account_type="Income Account")
		expense = make_account("Bridge Quote Expense", root_type="Expense", account_type="Expense Account")
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		name = unique_name("Bridge Quote")

		inserted = self.bridge.insert(
			"SalesQuote",
			{
				"name": name,
				"numberSeries": "SQUOT-",
				"party": party.name,
				"date": now_datetime().isoformat(),
				"items": [
					{
						"item": item.name,
						"account": income.name,
						"rate": 100,
						"quantity": 1,
					}
				],
				"referenceType": "Party",
				"entryCurrency": "Party",
			},
		)

		self.assertEqual(inserted["referenceType"], "Party")
		self.assertEqual(inserted["entryCurrency"], "Party")
		self.assertEqual(
			frappe.db.get_value(
				"Books Sales Quote",
				name,
				["reference_type", "entry_currency"],
			),
			("Books Party", "Party"),
		)

	def test_draft_insert_runs_frappe_mandatory_validation(self):
		name = unique_name("Invalid Bridge Color")

		with self.assertRaises(frappe.MandatoryError):
			self.bridge.insert("Color", {"name": name})

		self.assertFalse(frappe.db.exists("Books Color", name))

	def test_draft_writes_run_frappe_controller_validation(self):
		income = make_account("Bridge Validation Income", root_type="Income", account_type="Income Account")
		expense = make_account(
			"Bridge Validation Expense", root_type="Expense", account_type="Expense Account"
		)
		invalid_name = unique_name("Invalid Bridge Item")
		values = {
			"itemCode": unique_name("INVALID-BRIDGE-ITEM"),
			"incomeAccount": income.name,
			"expenseAccount": expense.name,
		}

		with self.assertRaises(frappe.ValidationError):
			self.bridge.insert("Item", {"name": invalid_name, "rate": -1, **values})
		self.assertFalse(frappe.db.exists("Books Item", invalid_name))

		name = unique_name("Bridge Validated Item")
		inserted = self.bridge.insert("Item", {"name": name, "rate": 10, **values})
		with self.assertRaises(frappe.ValidationError):
			self.bridge.update(
				"Item",
				{
					"name": name,
					"rate": -1,
					"__expectedModified": inserted["modified"],
				},
			)

		self.assertEqual(frappe.db.get_value("Books Item", name, "rate"), 10)

	def test_numeric_strings_are_coerced_before_controller_validation(self):
		income = make_account("Bridge Numeric Income", root_type="Income", account_type="Income Account")
		expense = make_account("Bridge Numeric Expense", root_type="Expense", account_type="Expense Account")
		item = make_item(income.name, expense.name, rate=10)
		inserted = self.bridge.get("Item", item.name)

		updated = self.bridge.update(
			"Item",
			{
				"name": item.name,
				"rate": "16.00000000000",
				"trackItem": "1",
				"uomConversions": [{"uom": "Kg", "conversionFactor": "2.5"}],
				"__expectedModified": inserted["modified"],
			},
		)

		self.assertEqual(updated["rate"], 16)
		self.assertEqual(updated["trackItem"], 1)
		self.assertEqual(updated["uomConversions"][0]["conversionFactor"], 2.5)

	def test_child_tables_round_trip_through_draft_writes(self):
		account = make_account("Bridge Tax Account", root_type="Liability", account_type="Tax")
		name = unique_name("Bridge Tax")

		inserted = self.bridge.insert(
			"Tax",
			{
				"name": name,
				"details": [{"account": account.name, "rate": 10}],
			},
		)
		self.assertEqual(inserted["details"][0]["account"], account.name)
		self.assertEqual(inserted["details"][0]["rate"], 10)
		persisted = frappe.get_doc("Books Tax", name)
		self.assertEqual(len(persisted.details), 1)
		self.assertEqual(persisted.details[0].parent, name)

		self.bridge.update(
			"Tax",
			{
				"name": name,
				"details": [{"account": account.name, "rate": 18}],
			},
		)
		updated = self.bridge.get("Tax", name)
		self.assertEqual(len(updated["details"]), 1)
		self.assertEqual(updated["details"][0]["rate"], 18)

	def test_item_list_request_returns_created_items(self):
		income = make_account("Bridge Item Income", root_type="Income", account_type="Income Account")
		expense = make_account("Bridge Item Expense", root_type="Expense", account_type="Expense Account")
		item = make_item(income.name, expense.name, rate=42)

		rows = self.bridge.get_all(
			"Item",
			{"fields": ["*"], "filters": {}, "orderBy": ["created"]},
		)
		listed = next(row for row in rows if row["name"] == item.name)

		self.assertEqual(listed["unit"], "Unit")
		self.assertEqual(listed["rate"], 42)

	def test_double_encoded_attach_images_are_normalized(self):
		receivable = make_account("Bridge Image Receivable", account_type="Receivable")
		party = make_party(receivable.name)
		image = "data:image/png;base64,aW1hZ2UtYnl0ZXM="
		double_encoded = f"data:image/png;base64,{b64encode(image.encode()).decode()}"
		frappe.db.set_value("Books Party", party.name, "image", double_encoded)

		self.assertEqual(self.bridge.get("Party", party.name, ["image"])["image"], image)

		self.bridge.update("Party", {"name": party.name, "image": double_encoded})
		self.assertEqual(frappe.db.get_value("Books Party", party.name, "image"), image)

	def test_child_list_returns_parent_metadata_for_linked_entries(self):
		receivable = make_account("Bridge Linked Receivable", account_type="Receivable")
		income = make_account("Bridge Linked Income", root_type="Income", account_type="Income Account")
		expense = make_account("Bridge Linked Expense", root_type="Expense", account_type="Expense Account")
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		invoice_name = unique_name("Bridge Linked Invoice")
		self.bridge.insert(
			"SalesInvoice",
			{
				"name": invoice_name,
				"numberSeries": "SINV-",
				"party": party.name,
				"account": receivable.name,
				"date": now_datetime().isoformat(),
				"entryCurrency": "Party",
				"exchangeRate": 1,
				"items": [
					{
						"item": item.name,
						"account": income.name,
						"rate": 100,
						"quantity": 1,
					}
				],
			},
		)

		rows = self.bridge.get_all(
			"SalesInvoiceItem",
			{
				"fields": ["name", "parent", "parentSchemaName"],
				"filters": {"item": item.name},
			},
		)

		self.assertEqual(len(rows), 1)
		self.assertEqual(rows[0]["parent"], invoice_name)
		self.assertEqual(rows[0]["parentSchemaName"], "SalesInvoice")

	def test_calls_with_wrong_argument_counts_are_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self.bridge.call("get", [])
		with self.assertRaises(frappe.ValidationError):
			BooksBespokeQueries().call("getTopExpenses", ["2026-01-01"])

	def test_non_string_names_are_rejected_before_reading_rows(self):
		lookup = {"name": ["like", "%"]}
		with self.assertQueryCount(0), self.assertRaises(frappe.FrappeTypeError):
			self.bridge.call("get", ["Party", lookup])
		with self.assertQueryCount(0), self.assertRaises(frappe.FrappeTypeError):
			BooksBespokeQueries().call("getReturnBalanceItemsQty", ["SalesInvoice", lookup])

	def test_list_reads_return_every_matching_row(self):
		prefix = unique_name("Bridge Color")
		for index in range(501):
			frappe.get_doc(
				{"doctype": "Books Color", "name": f"{prefix} {index}", "hexvalue": "#000000"}
			).insert()
		filters = {"name": ["like", f"{prefix}%"]}

		self.assertEqual(len(self.bridge.get_all("Color", {"filters": filters})), 501)
		self.assertEqual(len(self.bridge.get_all("Color", {"filters": filters, "offset": 500})), 1)
		self.assertEqual(
			len(self.bridge.get_all("Color", {"filters": filters, "limit": 10, "offset": 495})), 6
		)

	def test_submit_and_cancel_use_atomic_server_lifecycle(self):
		receivable = make_account("Bridge Receivable", account_type="Receivable")
		income = make_account("Bridge Income", root_type="Income", account_type="Income Account")
		expense = make_account("Bridge Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		invoice_name = unique_name("Bridge Sales Invoice")
		self.bridge.insert(
			"SalesInvoice",
			{
				"name": invoice_name,
				"numberSeries": "SINV-",
				"party": party.name,
				"account": receivable.name,
				"date": now_datetime().isoformat(),
				"entryCurrency": "Party",
				"exchangeRate": 1,
				"items": [
					{
						"item": item.name,
						"account": income.name,
						"rate": 100,
						"quantity": 2,
						"itemDiscountPercent": 10,
					}
				],
			},
		)
		invoice = frappe.get_doc("Books Sales Invoice", invoice_name)
		self.assertEqual(len(invoice.items), 1)
		self.assertEqual(invoice.items[0].parent, invoice_name)
		self.assertEqual(invoice.entry_currency, "Party")

		with self.assertRaises(frappe.ValidationError):
			self.bridge.update(
				"SalesInvoice",
				{"name": invoice.name, "submitted": True},
			)

		submitted = lifecycle_action("submit", "SalesInvoice", invoice.name)
		self.assertTrue(submitted["submitted"])
		self.assertTrue(
			frappe.db.exists(
				"Books Ledger Entry",
				{"voucher_type": invoice.doctype, "voucher_no": invoice.name, "reverted": 0},
			)
		)

		cancelled = lifecycle_action("cancel", "SalesInvoice", invoice.name)
		self.assertTrue(cancelled["cancelled"])
		self.assertTrue(
			frappe.db.exists(
				"Books Ledger Entry",
				{"voucher_type": invoice.doctype, "voucher_no": invoice.name, "reverted": 1},
			)
		)
