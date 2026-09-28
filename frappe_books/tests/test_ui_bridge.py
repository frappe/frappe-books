"""Integration coverage for the original Vue UI's Frappe compatibility layer."""

from unittest.mock import ANY

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.accounting.returns import map_return
from frappe_books.tests.accounting import (
	make_account,
	make_invoice,
	make_item,
	make_party,
	make_tax,
	unique_name,
)
from frappe_books.ui_api import bespoke_call, database_call, lifecycle_action
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries
from frappe_books.ui_bridge.database import BooksDatabaseBridge
from frappe_books.ui_bridge.mapping import source_by_doctype


class IntegrationTestUiBridge(IntegrationTestCase):
	def setUp(self):
		self.bridge = BooksDatabaseBridge()

	def test_account_crud_keeps_frappe_tree_indices(self):
		name = unique_name("UI Tree Account")
		parent = make_account("UI Tree Root", is_group=1)
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

	def test_pay_payment_accounts_pass_through_unchanged(self):
		payable = make_account("Bridge Payable", root_type="Liability", account_type="Payable")
		cash = make_account("Bridge Cash", account_type="Cash")
		expense = make_account("Bridge Expense", root_type="Expense", account_type="Expense Account")
		income = make_account("Bridge Income", root_type="Income", account_type="Income Account")
		party = make_party(payable.name, role="Supplier")
		item = make_item(income.name, expense.name)
		invoice = _submitted_invoice(
			"Books Purchase Invoice", party.name, payable.name, item.name, expense.name
		)

		name = self.bridge.insert(
			"Payment", _payment_values("Pay", party.name, payable.name, cash.name, invoice)
		)["name"]

		stored = frappe.db.get_value("Books Payment", name, ["account", "payment_account"])
		self.assertEqual(stored, (payable.name, cash.name))
		self.assertEqual(
			_accounts(self.bridge.get("Payment", name)),
			{"account": payable.name, "paymentAccount": cash.name},
		)
		rows = self.bridge.get_all(
			"Payment", {"fields": ["account", "paymentAccount"], "filters": {"name": name}}
		)
		self.assertEqual(_accounts(rows[0]), {"account": payable.name, "paymentAccount": cash.name})

	def test_return_outstanding_and_refund_allocations_keep_stored_signs(self):
		receivable = make_account("Bridge Receivable", account_type="Receivable")
		cash = make_account("Bridge Cash", account_type="Cash")
		income = make_account("Bridge Income", root_type="Income", account_type="Income Account")
		expense = make_account("Bridge Expense", root_type="Expense", account_type="Expense Account")
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		invoice = _submitted_invoice(
			"Books Sales Invoice", party.name, receivable.name, item.name, income.name
		)
		credit_note = map_return(invoice.doctype, invoice.name).insert()
		credit_note.submit()
		outstanding = credit_note.db_get("outstanding_amount")
		self.assertLess(outstanding, 0)

		self.assertEqual(self.bridge.get("SalesInvoice", credit_note.name)["outstandingAmount"], outstanding)
		rows = self.bridge.get_all(
			"SalesInvoice", {"fields": ["outstandingAmount"], "filters": {"name": credit_note.name}}
		)
		self.assertEqual(rows[0]["outstandingAmount"], outstanding)

		refund = _payment_values("Pay", party.name, receivable.name, cash.name, credit_note)
		refund["for"][0]["amount"] = outstanding
		with self.assertRaisesRegex(frappe.ValidationError, "Allocated amounts must be greater than zero"):
			self.bridge.insert("Payment", refund)
		refund["for"][0]["amount"] = -outstanding
		payment = self.bridge.insert("Payment", refund)
		self.assertEqual(payment["for"][0]["amount"], -outstanding)

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

		updated = self.bridge.update(
			"UOM", {"name": name, "isWhole": False, "modified": inserted["modified"]}
		)
		self.assertEqual(updated["modified"], self.bridge.get("UOM", name)["modified"])
		self.assertEqual(self.bridge.get("UOM", name)["isWhole"], 0)
		with self.assertRaises(frappe.TimestampMismatchError):
			self.bridge.update("UOM", {"name": name, "isWhole": True, "modified": inserted["modified"]})

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

		inserted = self.bridge.insert(
			"SalesQuote",
			{
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
			},
		)

		self.assertEqual(inserted["referenceType"], "Party")
		self.assertEqual(
			frappe.db.get_value("Books Sales Quote", inserted["name"], "reference_type"), "Books Party"
		)

	def test_series_names_come_from_the_server(self):
		account = make_account("Bridge Series Account", root_type="Liability")
		values = {"name": "Client Chosen Name", "numberSeries": "JV-", "date": "2031-01-01"}
		values["accounts"] = [{"account": account.name, "debit": 10}, {"account": account.name, "credit": 10}]

		first = self.bridge.insert("JournalEntry", values)["name"]
		second = self.bridge.insert("JournalEntry", values)["name"]

		self.assertRegex(first, r"^JV-\d+$")
		self.assertEqual(int(second.removeprefix("JV-")), int(first.removeprefix("JV-")) + 1)
		self.assertFalse(frappe.db.exists("Books Journal Entry", "Client Chosen Name"))

	def test_autoincrement_names_come_from_the_server(self):
		inserted = self.bridge.insert("ItemEnquiry", {"name": "999999999", "item": "Bridge enquiry"})
		self.assertNotEqual(inserted["name"], "999999999")

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
					"modified": inserted["modified"],
				},
			)

		self.assertEqual(frappe.db.get_value("Books Item", name, "rate"), 10)

	def test_numeric_strings_are_coerced_before_controller_validation(self):
		income = make_account("Bridge Numeric Income", root_type="Income", account_type="Income Account")
		# a tracked item books its cost against a liability until the stock is sold
		expense = make_account("Bridge Numeric Stock Received", root_type="Liability")
		item = make_item(income.name, expense.name, rate=10, track_item=1)
		inserted = self.bridge.get("Item", item.name)

		updated = self.bridge.update(
			"Item",
			{
				"name": item.name,
				"rate": "16.00000000000",
				"trackItem": "1",
				"uomConversions": [{"uom": "Kg", "conversionFactor": "2.5"}],
				"modified": inserted["modified"],
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

	def test_update_keeps_existing_child_rows_in_place(self):
		account = make_account("Bridge Row Account", root_type="Liability", account_type="Tax")
		tax, other = make_tax(account.name), make_tax(account.name)
		own_row, foreign_row = tax.details[0].name, other.details[0].name

		self.bridge.update(
			"Tax",
			{
				"name": tax.name,
				"details": [
					{"name": own_row, "account": account.name, "rate": 18},
					{"name": foreign_row, "account": account.name, "rate": 5},
				],
			},
		)

		tax.reload()
		self.assertEqual(tax.details[0].name, own_row)
		self.assertEqual([row.rate for row in tax.details], [18, 5])
		self.assertNotEqual(tax.details[1].name, foreign_row)
		self.assertEqual(frappe.db.get_value("Books Tax Detail", foreign_row, "parent"), other.name)

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

	def test_child_list_returns_parent_metadata_for_linked_entries(self):
		receivable = make_account("Bridge Linked Receivable", account_type="Receivable")
		income = make_account("Bridge Linked Income", root_type="Income", account_type="Income Account")
		expense = make_account("Bridge Linked Expense", root_type="Expense", account_type="Expense Account")
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		invoice_name = self.bridge.insert(
			"SalesInvoice",
			{
				"numberSeries": "SINV-",
				"party": party.name,
				"account": receivable.name,
				"date": now_datetime().isoformat(),
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
		)["name"]

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

	def test_child_list_pages_rows_in_the_query(self):
		income = make_account("Bridge Paging Income", root_type="Income", account_type="Income Account")
		expense = make_account("Bridge Paging Expense", root_type="Expense", account_type="Expense Account")
		conversions = [{"uom": uom, "conversion_factor": 2} for uom in ("Kg", "Gram", "Meter")]
		item = make_item(income.name, expense.name, uom_conversions=conversions)

		rows = self.bridge.get_all(
			"UOMConversionItem",
			{"fields": ["uom"], "filters": {"parent": item.name}, "orderBy": "idx", "limit": 1, "offset": 1},
		)

		self.assertEqual([row["uom"] for row in rows], ["Gram"])

	def test_count_matches_filtered_parent_and_child_rows(self):
		prefix = unique_name("Bridge Count")
		for index in range(3):
			frappe.get_doc(
				{"doctype": "Books Color", "name": f"{prefix} {index}", "hexvalue": "#000"}
			).insert()
		income = make_account("Bridge Count Income", root_type="Income", account_type="Income Account")
		expense = make_account("Bridge Count Expense", root_type="Expense", account_type="Expense Account")
		item = make_item(income.name, expense.name, uom_conversions=[{"uom": "Kg", "conversion_factor": 2}])

		self.assertEqual(self.bridge.call("count", ["Color", {"name": ["like", f"{prefix}%"]}]), 3)
		self.assertEqual(self.bridge.call("count", ["UOMConversionItem", {"parent": item.name}]), 1)

	def test_search_matches_keyword_letters_in_order_within_the_limit(self):
		prefix = frappe.generate_hash(length=6)
		for index in range(3):
			frappe.get_doc(
				{"doctype": "Books Color", "name": f"Qz{prefix} Marigold {index}", "hexvalue": "#000"}
			).insert()

		found = self.bridge.call("search", [f"qz{prefix} mrgld", ["Color"], 2])["Color"]

		self.assertEqual(len(found), 2)
		self.assertTrue(all(row["name"].startswith(f"Qz{prefix}") for row in found))
		self.assertEqual(self.bridge.call("search", ["zzq", ["Color"], 2])["Color"], [])

	def test_search_returns_the_parent_of_matching_rows(self):
		receivable = make_account("Bridge Search Receivable", account_type="Receivable")
		income = make_account("Bridge Search Income", root_type="Income", account_type="Income Account")
		expense = make_account("Bridge Search Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		item = make_item(income.name, expense.name)
		invoice = make_invoice(
			"Books Sales Invoice", make_party(receivable.name).name, receivable.name, item.name, income.name
		)

		found = self.bridge.call("search", [item.name, ["SalesInvoiceItem"], 5])

		self.assertEqual(
			found["SalesInvoiceItem"],
			[
				{
					"item": item.name,
					"tax": None,
					"parent": invoice.name,
					"parentSchemaName": "SalesInvoice",
					"name": ANY,
				}
			],
		)

	def test_search_matches_the_doctype_search_fields(self):
		account = make_account("Bridge Search Receivable", account_type="Receivable").name
		email = f"{frappe.generate_hash(length=8)}@example.com"
		party = make_party(account, email=email).name

		found = self.bridge.call("search", [email, ["Party"], 5])["Party"]

		self.assertEqual([(row["name"], row["email"]) for row in found], [(party, email)])

	def test_link_search_matches_letters_in_order_within_the_link_filters(self):
		account = make_account("Bridge Link Receivable", account_type="Receivable").name
		prefix = frappe.generate_hash(length=6)
		customers = [make_party(account, name=f"Qz{prefix} Customer {index}").name for index in range(3)]
		payable = make_account("Bridge Link Payable", account_type="Payable").name
		make_party(payable, "Supplier", name=f"Qz{prefix} Supplier")
		filters = {"role": ["in", ["Customer", "Both"]]}

		found = self.bridge.call("searchLink", ["Party", f"qz{prefix}cst", filters, ["name", "role"], 2])

		self.assertEqual(len(found), 2)
		self.assertTrue(all(row["name"] in customers and row["role"] == "Customer" for row in found))
		self.assertEqual(
			self.bridge.call("searchLink", ["Party", f"qz{prefix}spl", filters, ["name"], 5]), []
		)

	def test_calls_with_wrong_argument_counts_are_rejected(self):
		with self.assertRaises(frappe.ValidationError):
			self.bridge.call("get", [])
		with self.assertRaises(frappe.ValidationError):
			BooksBespokeQueries().call("getStockQuantity", [])

	def test_non_string_names_are_rejected_before_reading_rows(self):
		lookup = {"name": ["like", "%"]}
		with self.assertQueryCount(0), self.assertRaises(frappe.FrappeTypeError):
			self.bridge.call("get", ["Party", lookup])
		with self.assertQueryCount(0), self.assertRaises(frappe.FrappeTypeError):
			BooksBespokeQueries().call("getStockQuantity", [lookup])

	def test_api_endpoints_validate_argument_types(self):
		with self.assertQueryCount(0), self.assertRaises(frappe.FrappeTypeError):
			lifecycle_action("submit", "SalesInvoice", {"name": ["like", "%"]}, "2026-01-01 00:00:00")
		for action in ("Submit", "bogus"):
			with self.subTest(action=action), self.assertRaises(frappe.FrappeTypeError):
				lifecycle_action(action, "SalesInvoice", "SINV-0001", "2026-01-01 00:00:00")
		for endpoint in (database_call, bespoke_call):
			with self.subTest(endpoint=endpoint.__name__), self.assertRaises(frappe.FrappeTypeError):
				endpoint("get", {"source_schema": "Party"})

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

	def test_list_order_defaults_to_newest_first(self):
		prefix = unique_name("Bridge Order")
		for index, creation in enumerate(["2026-01-01", "2026-01-03", "2026-01-02"]):
			name = f"{prefix} {index}"
			frappe.get_doc({"doctype": "Books Color", "name": name, "hexvalue": "#000000"}).insert()
			frappe.db.set_value("Books Color", name, "creation", creation, update_modified=False)
		filters = {"name": ["like", f"{prefix}%"]}

		def listed_indexes(**options):
			rows = self.bridge.get_all("Color", {"filters": filters, **options})
			return [row["name"].removeprefix(f"{prefix} ") for row in rows]

		self.assertEqual(listed_indexes(), ["1", "2", "0"])
		self.assertEqual(listed_indexes(orderBy="name"), ["2", "1", "0"])
		self.assertEqual(listed_indexes(orderBy="name", order="asc"), ["0", "1", "2"])

	def test_submit_and_cancel_use_atomic_server_lifecycle(self):
		receivable = make_account("Bridge Receivable", account_type="Receivable")
		income = make_account("Bridge Income", root_type="Income", account_type="Income Account")
		expense = make_account("Bridge Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense.name)
		party = make_party(receivable.name)
		item = make_item(income.name, expense.name)
		invoice_name = self.bridge.insert(
			"SalesInvoice",
			{
				"numberSeries": "SINV-",
				"party": party.name,
				"account": receivable.name,
				"date": now_datetime().isoformat(),
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
		)["name"]
		invoice = frappe.get_doc("Books Sales Invoice", invoice_name)
		self.assertEqual(len(invoice.items), 1)
		self.assertEqual(invoice.items[0].parent, invoice_name)

		with self.assertRaises(frappe.ValidationError):
			self.bridge.update(
				"SalesInvoice",
				{"name": invoice.name, "submitted": True},
			)

		modified = self.bridge.get("SalesInvoice", invoice.name)["modified"]
		submitted = lifecycle_action("submit", "SalesInvoice", invoice.name, modified)
		self.assertTrue(submitted["submitted"])
		self.assertTrue(
			frappe.db.exists(
				"Books Ledger Entry",
				{"voucher_type": invoice.doctype, "voucher_no": invoice.name, "reverted": 0},
			)
		)

		cancelled = lifecycle_action("cancel", "SalesInvoice", invoice.name, submitted["modified"])
		self.assertTrue(cancelled["cancelled"])
		self.assertTrue(
			frappe.db.exists(
				"Books Ledger Entry",
				{"voucher_type": invoice.doctype, "voucher_no": invoice.name, "reverted": 1},
			)
		)


def _submitted_invoice(doctype, party, account, item, item_account):
	invoice = make_invoice(doctype, party, account, item, item_account)
	invoice.items[0].item_discount_percent = 0
	return invoice.save().submit()


def _payment_values(payment_type, party, account, payment_account, invoice):
	amount = abs(invoice.db_get("outstanding_amount"))
	return {
		"numberSeries": "PAY-",
		"party": party,
		"date": now_datetime().isoformat(),
		"paymentType": payment_type,
		"paymentMethod": "Cash",
		"account": account,
		"paymentAccount": payment_account,
		"amount": amount,
		"for": [
			{
				"referenceType": source_by_doctype()[invoice.doctype],
				"referenceName": invoice.name,
				"amount": amount,
			}
		],
	}


def _accounts(values):
	return {field: values[field] for field in ("account", "paymentAccount")}
