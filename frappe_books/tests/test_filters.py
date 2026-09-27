"""Result-set tests for every operator accepted by the Books filter adapter."""

import json
from itertools import product

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import unique_name
from frappe_books.ui_bridge.database import BooksDatabaseBridge
from frappe_books.ui_bridge.mapping import target_doctype


class IntegrationTestFilters(IntegrationTestCase):
	def setUp(self):
		self.bridge = BooksDatabaseBridge()
		self.names = make_filter_entries()

	def rows(self, filters, schema="JournalEntry", names=None):
		query = fixture_filters(filters, names or self.names)
		return {row["name"] for row in self.bridge.get_all(schema, {"fields": ["name"], "filters": query})}

	def assert_rows(self, filters, indices):
		self.assertEqual(self.rows(filters), {self.names[i] for i in indices}, filters)

	def test_text_operator_results(self):
		cases = [
			("=", "Beta", [3]),
			("!=", "Beta", [0, 1, 2, 4]),
			("like", "%Alpha%", [2, 4]),
			("not like", "%Alpha%", [0, 1, 3]),
			("includes", "Alpha", [2, 4]),
			(">", "Alpha", [2, 3, 4]),
			("<", "Alpha", [0, 1]),
			(">=", "Beta", [3]),
			("<=", "Beta", [0, 1, 2, 3, 4]),
			("is null", None, [0, 1]),
			("is not null", None, [2, 3, 4]),
			("in", ["Beta", "Alpha café"], [2, 3]),
			("not in", ["Beta", "Alpha café"], [0, 1, 4]),
			("in", [], []),
			("not in", [], [0, 1, 2, 3, 4]),
			("=", "Alpha O'Reilly", [4]),
			("like", "%café%", [2]),
			("like", "B_ta", [3]),
			("=", "%Alpha%", []),
			("like", "Alpha", []),
		]
		for operator, value, indices in cases:
			with self.subTest(operator=operator, value=value):
				self.assert_rows({"userRemark": [operator, value]}, indices)

	def test_every_pair_of_ui_operators_intersects_results(self):
		cases = [
			("=", "Beta", {3}),
			("!=", "Beta", {0, 1, 2, 4}),
			("like", "%Alpha%", {2, 4}),
			("not like", "%Alpha%", {0, 1, 3}),
			(">", "Alpha", {2, 3, 4}),
			("<", "Beta", {0, 1, 2, 4}),
			("is null", None, {0, 1}),
			("is not null", None, {2, 3, 4}),
		]
		for first, second in product(cases, repeat=2):
			with self.subTest(first=first[:2], second=second[:2]):
				self.assert_rows({"userRemark": [*first[:2], *second[:2]]}, first[2] & second[2])

	def test_multiple_conditions_and_no_matches(self):
		self.assert_rows({"userRemark": ["like", "%Alpha%", "not like", "%Reilly%"]}, [2])
		self.assert_rows({"date": [">", "2024-01-02", "<", "2024-01-05"]}, [2, 3])
		self.assert_rows({"date": [">", "2024-01-04", "<", "2024-01-02"]}, [])
		self.assert_rows({"userRemark": ["is not null", None], "entryType": "Journal Entry"}, [2])
		self.assert_rows({"userRemark": ["=", "Beta", "=", "Beta"]}, [3])
		self.assert_rows({}, range(5))

	def test_or_filters_match_any_field_within_the_filters(self):
		query = fixture_filters({"entryType": "Journal Entry"}, self.names)
		or_filters = {"userRemark": ["like", "%Beta%"], "referenceNumber": ["like", "%2%"]}
		rows = self.bridge.get_all("JournalEntry", {"fields": ["name"], "filters": query, "orFilters": or_filters})

		self.assertEqual({row["name"] for row in rows}, {self.names[2]})
		self.assertEqual(self.bridge.count("JournalEntry", query, or_filters), 1)

	def test_date_datetime_and_select_comparisons(self):
		for field, pivot in [("date", "2024-01-03"), ("created", "2024-01-03 12:00:00")]:
			for operator, indices in [
				("=", [2]),
				("!=", [0, 1, 3, 4]),
				(">", [3, 4]),
				("<", [0, 1]),
				(">=", [2, 3, 4]),
				("<=", [0, 1, 2]),
				("is null", []),
				("is not null", range(5)),
			]:
				with self.subTest(field=field, operator=operator):
					self.assert_rows({field: [operator, pivot]}, indices)
		self.assert_rows({"entryType": ["=", "Cash Entry"]}, [3, 4])
		self.assert_rows({"entryType": ["not like", "%Cash%"]}, [0, 1, 2])

	def test_numeric_link_and_check_fields(self):
		names = []
		for index, rate in enumerate([-1.5, 0, 2.5, 10]):
			name = unique_name("Filter item")
			frappe.get_doc(
				{
					"doctype": "Books Item",
					"name": name,
					"rate": rate,
					"track_item": index % 2,
					"item_group": "Group A" if index < 2 else "Group B",
				}
			).db_insert()
			names.append(name)
		for operator, value, indices in [
			("=", "0", [1]),
			("!=", 0, [0, 2, 3]),
			(">", 0, [2, 3]),
			("<", 0, [0]),
			(">=", 0, [1, 2, 3]),
			("<=", 0, [0, 1]),
			("in", [0, 10], [1, 3]),
			("not in", [0, 10], [0, 2]),
		]:
			with self.subTest(operator=operator):
				self.assertEqual(
					self.rows({"rate": [operator, value]}, "Item", names), {names[i] for i in indices}
				)
		for value in [False, 0, "0", True, 1, "1"]:
			expected = {names[i] for i in range(4) if i % 2 == int(value)}
			self.assertEqual(self.rows({"trackItem": ["=", value]}, "Item", names), expected)
			self.assertEqual(self.rows({"trackItem": ["!=", value]}, "Item", names), set(names) - expected)
		self.assertEqual(self.rows({"itemGroup": ["like", "%A%"]}, "Item", names), set(names[:2]))
		self.assertEqual(
			self.rows({"rate": [">", 0, "<", 10], "itemGroup": "Group B"}, "Item", names), {names[2]}
		)

	def test_every_submitted_cancelled_boolean_combination(self):
		for submitted, cancelled, op1, op2 in product([False, True], [False, True], ["=", "!="], ["=", "!="]):
			expected = [
				i
				for i in range(5)
				if ((i % 3 > 0) == submitted) == (op1 == "=") and ((i % 3 == 2) == cancelled) == (op2 == "=")
			]
			with self.subTest(submitted=submitted, cancelled=cancelled, op1=op1, op2=op2):
				self.assert_rows({"submitted": [op1, submitted], "cancelled": [op2, cancelled]}, expected)
		self.assert_rows({"submitted": True}, [1, 2, 4])
		self.assert_rows({"submitted": False}, [0, 3])
		self.assert_rows({"cancelled": False}, [0, 1, 3, 4])
		self.assert_rows({"submitted": ["=", True, "!=", True]}, [])

	def test_document_number_series_and_audit_fields(self):
		self.assert_rows({"name": ["like", "Filter 3 %"]}, [3])
		self.assert_rows({"numberSeries": ["=", "JV-"]}, [0, 2, 4])
		self.assert_rows({"createdBy": "Administrator"}, [0, 2, 4])
		self.assert_rows({"modifiedBy": "Guest"}, [1, 3])
		self.assert_rows({"modified": [">", "2024-02-03 12:00:00"]}, [3, 4])

	def test_stored_invoice_totals(self):
		for schema in ("SalesInvoice", "PurchaseInvoice", "SalesQuote"):
			names = make_filter_invoices(schema)
			for field, step in (("netTotal", 100), ("grandTotal", 112), ("baseGrandTotal", 224)):
				with self.subTest(schema=schema, field=field):
					self.assertEqual(self.rows({field: ["=", 0]}, schema, names), {names[0]})
					self.assertEqual(
						self.rows({field: [">", step, "<", step * 4]}, schema, names), set(names[2:4])
					)

	def test_malformed_filters_are_rejected(self):
		cases = [
			{"userRemark": value}
			for value in [[], ["="], ["invalid", "x"], ["=", {}], ["=", []], ["in", "a,b"], ["not in", [{}]]]
		]
		for malformed in [[], "bad", False]:
			with self.assertRaises(frappe.FrappeTypeError):
				self.bridge.call("getAll", ["JournalEntry", {"filters": malformed}])
		cases += [{"name) OR 1=1 --": "x"}, {"submitted": ["like", "%1%"]}, {"cancelled": "bad"}]
		for filters in cases:
			with self.subTest(filters=filters), self.assertRaises(frappe.ValidationError):
				self.rows(filters)
		for value in ["word", "NaN", "Infinity", " "]:
			with self.subTest(value=value), self.assertRaises(frappe.ValidationError):
				self.rows({"rate": ["=", value]}, "Item")
		for value in ["1.5", "bad"]:
			with self.assertRaises(frappe.ValidationError):
				self.rows({"loyaltyPoints": ["=", value]}, "Party")

	def test_filtering_does_not_bypass_read_permissions(self):
		user = frappe.session.user
		try:
			frappe.set_user("Guest")
			with self.assertRaises(frappe.PermissionError):
				self.rows({"userRemark": ["is not null", None]})
		finally:
			frappe.set_user(user)


def make_filter_entries():
	names = []
	for index, remark in enumerate([None, "", "Alpha café", "Beta", "Alpha O'Reilly"]):
		name = unique_name(f"Filter {index}")
		frappe.get_doc(
			{
				"doctype": "Books Journal Entry",
				"name": name,
				"user_remark": remark,
				"posting_date": f"2024-01-{index + 1:02}",
				"entry_type": "Journal Entry" if index < 3 else "Cash Entry",
				"reference_number": str(index),
				"docstatus": index % 3,
				"creation": f"2024-01-{index + 1:02} 12:00:00",
				"modified": f"2024-02-{index + 1:02} 12:00:00",
				"owner": "Administrator" if index % 2 == 0 else "Guest",
				"modified_by": "Administrator" if index % 2 == 0 else "Guest",
				"number_series": "JV-" if index % 2 == 0 else "BANK-",
			}
		).db_insert()
		names.append(name)
	return names


def make_filter_invoices(schema="SalesInvoice"):
	names = []
	for index in range(5):
		name = unique_name(f"Filter invoice {index}")
		frappe.get_doc(
			{
				"doctype": target_doctype(schema),
				"name": name,
				"net_total": index * 100,
				"grand_total": index * 112,
				"base_grand_total": index * 224,
				"number_series": "INV-",
			}
		).db_insert()
		names.append(name)
	return names


def query_filter_fixture(filters, schema_name="JournalEntry"):
	"""Serve browser test queries through the real adapter in a rolled-back transaction."""
	if not frappe.conf.allow_tests:
		frappe.throw("Filter fixtures require a test site")
	if isinstance(filters, str):
		filters = json.loads(filters)
	frappe.db.savepoint("browser_filter_fixture")
	try:
		if schema_name == "JournalEntry":
			names = make_filter_entries()
		elif schema_name == "SalesInvoice":
			names = make_filter_invoices()
		else:
			frappe.throw("Unsupported browser filter fixture")
		query = fixture_filters(filters, names)
		return BooksDatabaseBridge().get_all(schema_name, {"fields": ["*"], "filters": query})
	finally:
		frappe.db.rollback(save_point="browser_filter_fixture")


def fixture_filters(filters, names):
	query = {**filters, "name": ["in", names]}
	if "name" in filters:
		value = filters["name"]
		query["name"].extend(value if isinstance(value, list) else ["=", value])
	return query
