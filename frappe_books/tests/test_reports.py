from decimal import Decimal
from unittest.mock import patch

import frappe
from frappe.desk.query_report import run
from frappe.tests import IntegrationTestCase
from frappe.utils import add_to_date, add_years, getdate, now_datetime, nowdate

from frappe_books.accounting.returns import map_return
from frappe_books.reports import gst
from frappe_books.reports.filters import get_default_filters
from frappe_books.reports.financial_statements import TRIAL_BALANCE_KEYS
from frappe_books.reports.gstr_json import get_gstr_json
from frappe_books.reports.periods import get_periods
from frappe_books.tests.accounting import make_account, make_item, make_party, root_group, unique_name
from frappe_books.tests.test_valuation import move

VOUCHER = "Books Journal Entry"
YEARS_2045_AND_2046 = {"based_on": "Until Date", "periodicity": "Yearly", "count": 2, "to_date": "2046-12-31"}
PERIOD_KEYS = ("period_2046_12_31", "period_2045_12_31")
GSTR_DATE = "2063-01-15"


class IntegrationTestLedgerReports(IntegrationTestCase):
	def setUp(self):
		self.assets = _group_account("Report Assets", "Asset")
		self.cash = _account("Report Cash", "Asset", self.assets)
		self.sales = make_account("Report Sales", root_type="Income")
		self.rent = make_account("Report Rent", root_type="Expense")

	def test_general_ledger_carries_the_opening_into_running_balances(self):
		for date, debit, credit in (("2044-12-31", 100, 0), ("2045-01-05", 50, 0), ("2045-01-20", 0, 20)):
			_post(date, self.cash.name, debit, credit)
		for ascending in (True, False):
			rows = self._ledger(account=self.cash.name, ascending=ascending)
			entries = [row for row in rows if row.get("type") == "entry"]
			self.assertEqual(rows[0], _row("opening", "Opening", 0, 0, 100))
			self.assertEqual(
				sorted((row["date"].isoformat(), row["balance"]) for row in entries),
				[("2045-01-05", Decimal(150)), ("2045-01-20", Decimal(130))],
			)
			self.assertEqual(entries[0]["date"].isoformat(), "2045-01-05" if ascending else "2045-01-20")
			self.assertEqual(rows[-2:], [{}, _row("closing", "Closing", 50, 20, 130)])

	def test_general_ledger_groups_include_accounts_with_only_an_opening(self):
		voucher = unique_name("JV")
		_post("2044-12-31", self.cash.name, 100, 0, voucher)
		_post("2044-12-31", self.sales.name, 0, 100, voucher)
		_post("2045-01-01", self.cash.name, 20, 0, voucher)

		rows = self._ledger(reference_name=voucher, group_by="account", ascending=True)

		totals = [row["balance"] for row in rows if row.get("type") == "total"]
		self.assertEqual(totals, [Decimal(120), Decimal(-100)])
		self.assertEqual(
			[row["account"] for row in rows if row.get("type") == "opening"],
			[f"Opening: {self.cash.name}", f"Opening: {self.sales.name}"],
		)
		self.assertEqual(rows[-1], _row("closing", "Closing", 20, 0, 20))

	def test_general_ledger_filters_and_shows_documents_by_doctype(self):
		_post("2045-01-05", self.cash.name, 50, 0)
		_post("2045-01-06", self.cash.name, 30, 0, voucher_type="Books Payment")

		rows = self._ledger(account=self.cash.name, reference_type="Books Payment")

		entries = [row for row in rows if row.get("type") == "entry"]
		self.assertEqual(
			[(row["reference_type"], row["debit"]) for row in entries], [("Books Payment", Decimal(30))]
		)

	def test_general_ledger_of_a_group_account_shows_its_accounts_entries(self):
		_post("2044-12-31", self.cash.name, 100, 0)
		_post("2045-01-05", self.cash.name, 50, 0)

		rows = self._ledger(account=self.assets.name)

		self.assertEqual(rows[0], _row("opening", "Opening", 0, 0, 100))
		self.assertEqual(
			[(row["account"], row["debit"]) for row in rows if row.get("type") == "entry"],
			[(self.cash.name, Decimal(50))],
		)

	def test_trial_balance_splits_opening_and_closing_balances(self):
		for date, debit, credit in (
			("2044-12-31", 100, 20),
			("2045-01-01", 50, 0),
			("2045-01-31", 0, 30),
			("2045-02-01", 999, 0),
		):
			_post(date, self.cash.name, debit, credit)

		rows = _rows_by_account(_run("Books Trial Balance", from_date="2045-01-01", to_date="2045-01-31"))

		expected = _decimals(80, 0, 50, 30, 100, 0)
		self.assertEqual(_values(rows[self.cash.name], TRIAL_BALANCE_KEYS), expected)
		self.assertEqual(_values(rows[self.assets.name], TRIAL_BALANCE_KEYS), expected)
		self.assertEqual((rows[self.assets.name]["indent"], rows[self.cash.name]["indent"]), (0, 1))

	def test_profit_and_loss_shows_each_period_and_the_profit(self):
		_post("2045-02-01", self.sales.name, 0, 100)
		_post("2045-03-01", self.rent.name, 30, 0)
		_post("2046-02-01", self.sales.name, 0, 200)

		rows = _run("Books Profit and Loss", **YEARS_2045_AND_2046)

		accounts = _rows_by_account(rows)
		self.assertEqual(_values(accounts[self.sales.name], PERIOD_KEYS), _decimals(200, 100))
		self.assertEqual(_values(accounts[self.rent.name], PERIOD_KEYS), _decimals(0, 30))
		self.assertEqual(_values(rows[-1], PERIOD_KEYS), _decimals(200, 70))
		self.assertEqual(rows[-1]["account"], "Total Profit")

	def test_profit_and_loss_totals_each_row_over_its_periods(self):
		_post("2049-02-01", self.sales.name, 0, "0.1")
		_post("2050-02-01", self.sales.name, 0, "0.2")
		_post("2050-03-01", self.rent.name, "0.05", 0)
		income = root_group("Income")
		years = {**YEARS_2045_AND_2046, "to_date": "2050-12-31"}

		rows = _run("Books Profit and Loss", **years)

		accounts = _rows_by_account(rows)
		for account in (self.sales.name, income, "Total Income (Credit)"):
			self.assertEqual(accounts[account]["total"], Decimal("0.3"))
		self.assertEqual(rows[-1]["total"], Decimal("0.25"))
		hidden = _rows_by_account(_run("Books Profit and Loss", hide_group_amounts=1, **years))
		self.assertIsNone(hidden[income]["total"])
		self.assertEqual(hidden[self.sales.name]["total"], Decimal("0.3"))

	def test_profit_and_loss_has_a_total_column_after_its_periods(self):
		columns = run("Books Profit and Loss", YEARS_2045_AND_2046)["columns"]
		consolidated = run("Books Profit and Loss", {**YEARS_2045_AND_2046, "consolidate_columns": 1})

		self.assertEqual([column["fieldname"] for column in columns], ["account", *PERIOD_KEYS, "total"])
		self.assertEqual(columns[-1]["label"], "Total")
		self.assertNotIn("total", [column["fieldname"] for column in consolidated["columns"]])

	def test_balance_sheet_accumulates_from_the_first_entry(self):
		for date, debit, credit in (
			("2044-01-01", 100, 0),
			("2045-01-01", 50, 0),
			("2046-01-01", 0, 20),
			("2047-01-01", 999, 0),
		):
			_post(date, self.cash.name, debit, credit)

		rows = _rows_by_account(_run("Books Balance Sheet", **YEARS_2045_AND_2046))

		self.assertEqual(_values(rows[self.cash.name], PERIOD_KEYS), _decimals(130, 150))
		self.assertEqual(_values(rows[self.assets.name], PERIOD_KEYS), _decimals(130, 150))

	def test_ledger_reports_need_ledger_read_permission(self):
		with self.set_user("Guest"), self.assertRaises(frappe.PermissionError):
			self._ledger()

	def _ledger(self, **filters):
		return _run("Books General Ledger", from_date="2045-01-01", to_date="2045-01-31", **filters)


class IntegrationTestBalancedReports(IntegrationTestCase):
	"""Report totals sum every entry, so these tests keep out of the one-sided ledger tests."""

	@classmethod
	def setUpClass(cls):
		super().setUpClass()
		cash = make_account("Balance Cash")
		sales = make_account("Balance Sales", root_type="Income")
		rent = make_account("Balance Rent", root_type="Expense")
		for date, account, debit, credit in (
			("2045-03-01", cash.name, 100, 0),
			("2045-03-01", sales.name, 0, 100),
			("2046-03-01", rent.name, 30, 0),
			("2046-03-01", cash.name, 0, 30),
		):
			_post(date, account, debit, credit)

	def test_trial_balance_totals_debits_and_credits(self):
		rows = _run("Books Trial Balance", from_date="2046-01-01", to_date="2046-12-31")

		self.assertEqual(rows[-2:-1], [{}])
		self.assertEqual(rows[-1]["account"], "Total")
		self.assertEqual(_values(rows[-1], TRIAL_BALANCE_KEYS), _decimals(100, 100, 30, 30, 100, 100))

	def test_balance_sheet_balances_with_the_profit_not_closed_into_equity(self):
		rows = _rows_by_account(_run("Books Balance Sheet", **YEARS_2045_AND_2046))

		profit = rows["Provisional Profit / Loss (Credit)"]
		self.assertEqual(_values(profit, PERIOD_KEYS), _decimals(70, 100))
		self.assertEqual(
			_values(rows["Total (Credit)"], PERIOD_KEYS), _values(rows["Total Asset (Debit)"], PERIOD_KEYS)
		)


def _group_account(label, root_type):
	return _account(label, root_type, is_group=1)


def _account(label, root_type, parent=None, is_group=0):
	return frappe.get_doc(
		{
			"doctype": "Books Account",
			"account_name": unique_name(label),
			"root_type": root_type,
			"is_group": is_group,
			"parent_books_account": parent.name if parent else None,
		}
	).insert()


def _post(date, account, debit, credit, voucher=None, voucher_type=VOUCHER):
	frappe.get_doc(
		{
			"doctype": "Books Ledger Entry",
			"posting_date": date,
			"account": account,
			"debit": debit,
			"credit": credit,
			"voucher_type": voucher_type,
			"voucher_no": voucher or unique_name("JV"),
		}
	).insert(ignore_links=True)


def _row(row_type, account, debit, credit, balance):
	return {
		"type": row_type,
		"account": account,
		"debit": Decimal(debit),
		"credit": Decimal(credit),
		"balance": Decimal(balance),
	}


def _run(report_name, **filters):
	return run(report_name, filters)["result"]


def _rows_by_account(rows):
	return {row["account"]: row for row in rows if row}


def _values(row, keys):
	return tuple(row[key] for key in keys)


class IntegrationTestReportDefaults(IntegrationTestCase):
	def test_ledgers_open_on_the_year_up_to_today(self):
		today = getdate()
		for report in ("Books General Ledger", "Books Stock Ledger", "Books Stock Balance"):
			self.assertEqual(
				get_default_filters(report), {"from_date": add_years(today, -1), "to_date": today}
			)

	def test_default_filters_need_report_access(self):
		with self.set_user("Guest"), self.assertRaises(frappe.PermissionError):
			get_default_filters("Books General Ledger")


class IntegrationTestStockReports(IntegrationTestCase):
	def setUp(self):
		self.income = make_account("Stock Report Income", root_type="Income")
		self.received = make_account("Stock Report Received", root_type="Liability")
		self.item = self._item()
		now = now_datetime()
		move(self.item, "MaterialReceipt", 4, 10, add_to_date(now, days=-3))
		move(self.item, "MaterialReceipt", 2, 20, add_to_date(now, days=-2))
		move(self.item, "MaterialIssue", 5, 99, now)

	def test_stock_ledger_reads_the_stored_fifo_balances(self):
		rows = _run("Books Stock Ledger", item=self.item, ascending=True)

		columns = (
			"quantity",
			"balance_quantity",
			"value_change",
			"balance_value",
			"incoming_rate",
			"valuation_rate",
		)
		self.assertEqual(
			[tuple(row[column] for column in columns) for row in rows],
			[
				_decimals(4, 4, 40, 40, 10, 10),
				_decimals(2, 6, 40, 80, 20, "13.33"),
				_decimals(-5, 1, -60, 20, 12, 20),
			],
		)

	def test_stock_ledger_dates_are_iso_datetimes(self):
		rows = _run("Books Stock Ledger", item=self.item)

		for row in rows:
			self.assertRegex(row["date"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?[+-]\d{2}:\d{2}$")

	def test_stock_ledger_filters_and_shows_documents_by_doctype(self):
		rows = _run("Books Stock Ledger", item=self.item, reference_type="Books Stock Movement")

		self.assertEqual([row["reference_type"] for row in rows], ["Books Stock Movement"] * 3)
		self.assertEqual(_run("Books Stock Ledger", item=self.item, reference_type="Books Shipment"), [])

	def test_stock_ledger_groups_rows_and_numbers_them_in_order(self):
		other = self._item()
		for item, day in ((self.item, 1), (other, 2), (self.item, 3)):
			move(item, "MaterialReceipt", 1, 10, f"2061-01-0{day} 10:00:00")

		rows = _run(
			"Books Stock Ledger",
			from_date="2061-01-01",
			to_date="2061-01-03",
			group_by="item",
			ascending=True,
		)

		self.assertEqual(
			[(row.get("index"), row.get("item")) for row in rows],
			[(1, self.item), (2, self.item), (None, None), (3, other)],
		)

	def test_stock_balance_splits_opening_and_period_movement(self):
		today = nowdate()
		rows = _run("Books Stock Balance", item=self.item, from_date=today, to_date=today)

		self.assertEqual(len(rows), 1)
		columns = (
			"opening_quantity",
			"opening_value",
			"outgoing_quantity",
			"outgoing_value",
			"balance_value",
		)
		self.assertEqual(tuple(rows[0][column] for column in columns), _decimals(6, 80, 5, 60, 20))
		self.assertEqual((rows[0]["balance_quantity"], rows[0]["valuation_rate"]), _decimals(1, 20))

	def test_stock_balance_ignores_serial_numbers_while_they_are_off(self):
		frappe.db.set_single_value("Books Inventory Settings", "enable_serial_number", 0)

		rows = _run("Books Stock Balance", item=self.item, show_serial_numbers=1)

		self.assertEqual([row["balance_quantity"] for row in rows], [1])

	def _item(self):
		return make_item(self.income.name, self.received.name, track_item=1).name


class IntegrationTestGSTR(IntegrationTestCase):
	def setUp(self):
		for account in ("CGST", "SGST", "IGST"):
			if not frappe.db.exists("Books Account", account):
				_tax_account(account, account)
			# The site may already have these accounts, without a GST head.
			frappe.db.set_value("Books Account", account, "gst_head", account)
		self.receivable = make_account("GSTR Receivable", account_type="Receivable")
		self.income = make_account("GSTR Income", root_type="Income", account_type="Income Account")
		expense = make_account("GSTR Expense", root_type="Expense", account_type="Expense Account")
		self.party = make_party(self.receivable.name)
		self.item = make_item(self.income.name, expense.name).name

	def test_mixed_rates_give_one_row_per_rate(self):
		gst_18 = _tax(("CGST", 9), ("SGST", 9))
		gst_5 = _tax(("CGST", 2.5), ("SGST", 2.5))
		invoice = self._invoice((gst_18, 100, 1), (gst_5, 50, 2), (gst_18, 200, 1))

		rows = self._rows(invoice)

		self.assertEqual(
			{(row["rate"], row["taxable_value"], row["cgst_amount"], row["sgst_amount"]) for row in rows},
			{_decimals(18, 300, 27, 27), _decimals(5, 100, "2.5", "2.5")},
		)
		self.assertTrue(all(row["invoice_value"] == Decimal(459) for row in rows))

	def test_invoice_dates_are_dates(self):
		invoice = self._invoice((_tax(("IGST", 18)), 100, 1))

		(row,) = self._rows(invoice)

		self.assertEqual(row["invoice_date"], getdate())

	def test_igst_rows_are_interstate(self):
		invoice = self._invoice((_tax(("IGST", 18)), 100, 1))

		(row,) = self._rows(invoice)

		self.assertEqual((row["rate"], row["igst_amount"], row["in_state"]), (*_decimals(18, 18), False))
		self.assertNotIn("cgst_amount", row)

	def test_supplies_to_unregistered_parties_are_not_reverse_charge(self):
		self.party = self._party("Karnataka")
		invoice = self._invoice((_tax(("CGST", 9), ("SGST", 9)), 100, 1))

		(row,) = self._rows(invoice)

		self.assertEqual((row["gstin"], row["reverse_charge"]), ("", "N"))

	def test_interstate_consumer_invoices_above_one_lakh_are_large_from_august_2024(self):
		frappe.db.set_single_value("Books Accounting Settings", "gstin", "27AAAAA0000A1Z5")
		self.party = self._party("Karnataka")
		igst_25 = _tax(("IGST", 25))
		invoices = [
			self._invoice((igst_25, rate, 1), date=date)
			for date, rate in (("2064-03-10", 80001), ("2064-03-10", 80000), ("2024-07-31", 80001))
		]

		dates = {"from_date": "2024-07-31", "to_date": "2064-03-10"}
		large = {row["invoice_no"] for row in _run("Books GSTR-1", transfer_type="B2CL", **dates)}
		small = {row["invoice_no"] for row in _run("Books GSTR-1", transfer_type="B2CS", **dates)}

		self.assertEqual([invoice.name in large for invoice in invoices], [True, False, False])
		self.assertEqual([invoice.name in small for invoice in invoices], [False, True, True])

	def test_nil_rated_supplies_show_only_as_nil_rated(self):
		registered = self._party("Karnataka", gstin="29AAAAA0000A1Z5")
		unregistered = self._party("Karnataka")
		gst_0 = _tax(("CGST", 0), ("SGST", 0))
		invoices = []
		for party in (registered, unregistered):
			self.party = party
			invoices.append(self._invoice((gst_0, 100, 1), date="2064-04-20").name)

		def shown(transfer_type):
			rows = _run(
				"Books GSTR-1", from_date="2064-04-20", to_date="2064-04-20", transfer_type=transfer_type
			)
			return sorted(row["invoice_no"] for row in rows)

		self.assertEqual([shown(transfer_type) for transfer_type in ("B2B", "B2CL", "B2CS")], [[], [], []])
		self.assertEqual(shown("NR"), sorted(invoices))

	def test_json_export_refuses_sections_it_cannot_build(self):
		frappe.db.set_single_value("Books Accounting Settings", "gstin", "29AAAAA0000A1Z5")

		with self.assertRaisesRegex(frappe.ValidationError, "JSON"):
			self._json("NR")

	def test_tax_amounts_follow_the_gst_head_of_the_account(self):
		central, state = (
			_tax_account(unique_name(f"Output {head} 9%"), head).name for head in ("CGST", "SGST")
		)
		invoice = self._invoice((_tax((central, 9), (state, 9)), 100, 1))

		(row,) = self._rows(invoice)

		self.assertEqual((row["rate"], row["cgst_amount"], row["sgst_amount"]), _decimals(18, 9, 9))

	def test_invoices_and_parties_are_read_in_batches(self):
		gst_18 = _tax(("CGST", 9), ("SGST", 9))
		first = self._invoice((gst_18, 100, 1))
		self.party = make_party(self.receivable.name)
		second = self._invoice((gst_18, 200, 1))

		with patch.object(gst, "IN_LIST_BATCH_SIZE", 1):
			rows = [*self._rows(first), *self._rows(second)]

		self.assertEqual(
			[(row["invoice_no"], row["party"], row["taxable_value"]) for row in rows],
			[(first.name, first.party, Decimal(100)), (second.name, second.party, Decimal(200))],
		)

	def test_json_takes_the_place_of_supply_and_amounts_from_the_rows(self):
		self.party = self._party("Karnataka", gstin="27AAAAA0000A1Z5")
		self._invoice((_tax(("IGST", 18)), 100, 1), (_tax(("IGST", 5)), 50, 1), date=GSTR_DATE)

		(customer,) = self._json("B2B")["b2b"]

		(invoice,) = customer["inv"]
		self.assertEqual(
			(customer["ctin"], invoice["pos"], invoice["idt"]), ("27AAAAA0000A1Z5", "29", "15-01-2063")
		)
		self.assertEqual(
			[(item["num"], item["itm_det"]["txval"], item["itm_det"]["iamt"]) for item in invoice["itms"]],
			[(1, *_decimals(100, 18)), (2, *_decimals(50, "2.5"))],
		)

	def test_place_of_supply_falls_back_to_the_gstin_state(self):
		frappe.db.set_single_value("Books Accounting Settings", "gstin", "29AAAAA0000A1Z5")
		self.party = self._party("Bombay", gstin="27AAAAA0000A1Z5")
		self._invoice((_tax(("IGST", 18)), 100, 1), date="2064-05-05")

		(customer,) = get_gstr_json(
			"Books GSTR-1", {"from_date": "2064-05-05", "to_date": "2064-05-05", "transfer_type": "B2B"}
		)["b2b"]

		self.assertEqual(customer["inv"][0]["pos"], "27")

	def test_json_sums_small_consumer_supplies_by_state_and_rate(self):
		frappe.db.set_single_value("Books Accounting Settings", "gstin", "29AAAAA0000A1Z5")
		gst_18 = _tax(("CGST", 9), ("SGST", 9))
		self.party = self._party("Karnataka")
		self._invoice((gst_18, 100, 1), date=GSTR_DATE)
		self._invoice((gst_18, 200, 1), date=GSTR_DATE)

		(summary,) = self._json("B2CS")["b2cs"]

		self.assertEqual((summary["sply_ty"], summary["pos"], summary["typ"]), ("INTRA", "29", "OE"))
		self.assertEqual(
			(summary["rt"], summary["txval"], summary["camt"], summary["samt"], summary["iamt"]),
			_decimals(18, 300, 27, 27, 0),
		)

	def test_registered_credit_notes_show_as_cdnr_not_b2b(self):
		frappe.db.set_single_value("Books Accounting Settings", "gstin", "29AAAAA0000A1Z5")
		self.party = self._party("Maharashtra", gstin="27AAAAA0000A1Z5")
		invoice = self._invoice((_tax(("IGST", 18)), 100, 1), date="2065-02-10")
		note = self._credit_note(invoice, "2065-02-11")
		dates = {"from_date": "2065-02-10", "to_date": "2065-02-11"}

		b2b = _run("Books GSTR-1", transfer_type="B2B", **dates)
		(row,) = _run("Books GSTR-1", transfer_type="CDNR", **dates)
		(customer,) = get_gstr_json("Books GSTR-1", {**dates, "transfer_type": "CDNR"})["cdnr"]

		self.assertEqual([row["invoice_no"] for row in b2b], [invoice.name])
		self.assertEqual((row["invoice_no"], row["taxable_value"]), (note.name, Decimal(-100)))
		self.assertEqual(customer["ctin"], "27AAAAA0000A1Z5")
		self.assertEqual(
			customer["nt"],
			[
				{
					"ntty": "C",
					"nt_num": note.name,
					"nt_dt": "11-02-2065",
					"val": Decimal(118),
					"itms": [
						{
							"num": 1,
							"itm_det": {
								"txval": Decimal(100),
								"rt": Decimal(18),
								"csamt": 0,
								"iamt": Decimal(18),
								"camt": Decimal(0),
								"samt": Decimal(0),
							},
						}
					],
					"pos": "27",
					"rchrg": "N",
					"inv_typ": "R",
				}
			],
		)

	def test_unregistered_credit_notes_follow_the_invoice_they_return(self):
		frappe.db.set_single_value("Books Accounting Settings", "gstin", "29AAAAA0000A1Z5")
		self.party = self._party("Maharashtra")
		igst = _tax(("IGST", 25))
		large, small = (self._invoice((igst, rate, 1), date="2065-03-10") for rate in (80001, 100))
		large_note, small_note = (self._credit_note(invoice, "2065-03-11") for invoice in (large, small))
		dates = {"from_date": "2065-03-11", "to_date": "2065-03-11"}

		shown = {
			transfer_type: [
				row["invoice_no"] for row in _run("Books GSTR-1", transfer_type=transfer_type, **dates)
			]
			for transfer_type in ("B2CL", "B2CS", "CDNUR")
		}
		(note,) = get_gstr_json("Books GSTR-1", {**dates, "transfer_type": "CDNUR"})["cdnur"]

		self.assertEqual(shown, {"B2CL": [], "B2CS": [small_note.name], "CDNUR": [large_note.name]})
		self.assertEqual(
			(note["typ"], note["ntty"], note["nt_num"], note["pos"], note["val"]),
			("B2CL", "C", large_note.name, "27", Decimal("100001.25")),
		)
		self.assertEqual(
			note["itms"][0]["itm_det"],
			{"txval": Decimal(80001), "rt": Decimal(25), "csamt": 0, "iamt": Decimal("20000.25")},
		)

	def test_json_export_needs_the_company_gstin(self):
		frappe.db.set_single_value("Books Accounting Settings", "gstin", None)

		with self.assertRaisesRegex(frappe.ValidationError, "GSTIN"):
			self._json("B2B")

	def test_json_export_needs_export_permission(self):
		with self.set_user("Guest"), self.assertRaises(frappe.PermissionError):
			self._json("B2B")

	def _json(self, transfer_type):
		filters = {"from_date": GSTR_DATE, "to_date": GSTR_DATE, "transfer_type": transfer_type}
		return get_gstr_json("Books GSTR-1", filters)

	def _party(self, state, **values):
		address = frappe.get_doc(
			{
				"doctype": "Books Address",
				"name": unique_name("Address"),
				"address_line1": "1 Road",
				"city": "City",
				"state": state,
				"country": "India",
			}
		).insert()
		gst_type = "Registered Regular" if values.get("gstin") else "Unregistered"
		return make_party(self.receivable.name, address=address.name, gst_type=gst_type, **values)

	def _invoice(self, *rows, date=None):
		return (
			frappe.get_doc(
				{
					"doctype": "Books Sales Invoice",
					"party": self.party.name,
					"account": self.receivable.name,
					"date": date or now_datetime(),
					"items": [
						{
							"item": self.item,
							"account": self.income.name,
							"tax": tax,
							"rate": rate,
							"quantity": quantity,
						}
						for tax, rate, quantity in rows
					],
				}
			)
			.insert()
			.submit()
		)

	def _credit_note(self, invoice, date):
		frappe.db.set_single_value("Books Accounting Settings", "enable_invoice_returns", 1)
		note = map_return(invoice.doctype, invoice.name)
		note.date = date
		return note.insert().submit()

	def _rows(self, invoice):
		today = nowdate()
		rows = _run("Books GSTR-1", from_date=today, to_date=today)
		return [row for row in rows if row["invoice_no"] == invoice.name]


def _tax_account(name, gst_head):
	return frappe.get_doc(
		{
			"doctype": "Books Account",
			"account_name": name,
			"parent_books_account": root_group("Liability"),
			"account_type": "Tax",
			"gst_head": gst_head,
		}
	).insert()


def _tax(*details):
	return (
		frappe.get_doc(
			{
				"doctype": "Books Tax",
				"name": unique_name("GST"),
				"details": [{"account": account, "rate": rate} for account, rate in details],
			}
		)
		.insert()
		.name
	)


def _decimals(*values):
	return tuple(Decimal(str(value)) for value in values)


class IntegrationTestReportPeriods(IntegrationTestCase):
	def setUp(self):
		_set_fiscal_year("2026-04-01", "2027-03-31")

	def test_trial_balance_opens_on_the_whole_fiscal_year(self):
		account = make_account("Period Cash")
		_post("2027-03-31", account.name, 10, 0)

		with self.freeze_time("2026-09-28"):
			defaults = get_default_filters("Books Trial Balance")
			rows = _rows_by_account(_run("Books Trial Balance"))

		self.assertEqual(defaults, {"from_date": getdate("2026-04-01"), "to_date": getdate("2027-03-31")})
		self.assertEqual(rows[account.name]["closing_debit"], Decimal(10))

	def test_defaults_before_the_fiscal_year_ends_open_the_current_one(self):
		with self.freeze_time("2027-02-15"):
			statement = get_default_filters("Books Profit and Loss")
			trial_balance = get_default_filters("Books Trial Balance")

		self.assertEqual((statement["from_year"], statement["to_year"]), (2026, 2027))
		self.assertEqual(trial_balance["from_date"], getdate("2026-04-01"))

	def test_a_calendar_fiscal_year_is_one_year_of_twelve_months(self):
		_set_fiscal_year("2026-01-01", "2026-12-31")
		with self.freeze_time("2026-09-28"):
			defaults = get_default_filters("Books Balance Sheet")
		fiscal_year = frappe._dict(
			based_on="Fiscal Year", periodicity="Monthly", from_year=2026, to_year=2026
		)

		periods = get_periods(fiscal_year)

		self.assertEqual((defaults["from_year"], defaults["to_year"]), (2026, 2026))
		self.assertEqual(len(periods), 12)
		self.assertEqual((periods[-1].from_date, periods[0].to_date), _dates("2026-01-01", "2026-12-31"))

	def test_until_date_defaults_to_today(self):
		with self.freeze_time("2026-09-28"):
			defaults = get_default_filters("Books Balance Sheet")

		self.assertEqual((defaults["based_on"], defaults["to_date"]), ("Until Date", getdate("2026-09-28")))

	def test_periods_count_back_from_the_until_date_and_keep_month_ends(self):
		frappe.db.set_single_value("Books System Settings", "date_format", "dd/MM/yyyy")
		until = frappe._dict(based_on="Until Date", periodicity="Monthly", count=3, to_date="2026-09-30")

		periods = get_periods(until)

		self.assertEqual(
			[(period.from_date, period.to_date) for period in periods],
			[
				_dates("2026-09-01", "2026-09-30"),
				_dates("2026-08-01", "2026-08-31"),
				_dates("2026-07-01", "2026-07-31"),
			],
		)
		self.assertEqual([period.label for period in periods], ["30/09/2026", "31/08/2026", "31/07/2026"])
		(consolidated,) = get_periods(frappe._dict(until, consolidate_columns=1))
		self.assertEqual((consolidated.from_date, consolidated.to_date), _dates("2026-07-01", "2026-09-30"))

	def test_expense_only_profit_and_loss_shows_the_loss(self):
		rent = make_account("Period Rent", root_type="Expense")
		_post("2062-06-01", rent.name, 30, 0)

		rows = _run("Books Profit and Loss", periodicity="Yearly", count=1, to_date="2062-12-31")

		self.assertEqual(
			[row.get("account") for row in rows[-3:]], ["Total Expense (Debit)", None, "Total Profit"]
		)
		self.assertEqual((rows[-1]["period_2062_12_31"], rows[-1]["total"]), _decimals(-30, -30))


def _set_fiscal_year(start, end):
	frappe.db.set_single_value(
		"Books Accounting Settings", {"fiscal_year_start": start, "fiscal_year_end": end}
	)


def _dates(*dates):
	return tuple(getdate(date) for date in dates)
