"""Aggregate queries used by the Books web interface."""

from collections import defaultdict
from typing import Any, Literal

import frappe
from frappe.utils import get_datetime, getdate

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.commerce.pos import open_shift_name, transacted_amounts
from frappe_books.inventory.stock import parse_serial_numbers
from frappe_books.reports import financial_statements, gst, stock
from frappe_books.reports.financial_statements import Period
from frappe_books.reports.general_ledger import LedgerFilters, general_ledger
from frappe_books.reports.gst import GSTRFilters
from frappe_books.reports.stock import StockFilters
from frappe_books.series import new_item_names
from frappe_books.ui_bridge.dispatch import call_handler
from frappe_books.ui_bridge.linked_entries import linked_entries
from frappe_books.ui_bridge.mapping import target_doctype

MONTH_FIELDS = [{"YEAR": "posting_date", "as": "year"}, {"MONTH": "posting_date", "as": "month"}]
MONTH_GROUP = "year, month"
DEBIT_MINUS_CREDIT = [{"SUB": [{"SUM": "debit"}, {"SUM": "credit"}], "as": "balance"}]
CREDIT_MINUS_DEBIT = [{"SUB": [{"SUM": "credit"}, {"SUM": "debit"}], "as": "balance"}]


class BooksBespokeQueries:
	def call(self, method: str, args: list[Any]) -> Any:
		handler = getattr(self, _METHODS.get(method, ""), None)
		if not handler:
			frappe.throw(f"Unsupported Books query: {method}")
		return call_handler(handler, method, args)

	def top_expenses(self, from_date: str, to_date: str):
		rows = self._ledger_totals(
			from_date, to_date, {"account.root_type": "Expense"}, ["account", *DEBIT_MINUS_CREDIT], "account"
		)
		# The query engine wraps an ORDER BY on this expression alias in MAX() on Postgres.
		rows.sort(key=lambda row: row.balance, reverse=True)
		return [{"account": row.account, "total": rounded(row.balance)} for row in rows[:5]]

	def total_outstanding(self, source_schema: str, from_date: str, to_date: str):
		invoices = self._invoice_totals(source_schema, from_date, to_date, is_return=False)
		returns = self._invoice_totals(source_schema, from_date, to_date, is_return=True)
		# Credit notes are stored negative. Both are shown as positive amounts.
		return {
			key: rounded(abs(as_decimal(invoices[key])) + abs(as_decimal(returns[key]))) for key in invoices
		}

	def cashflow(self, from_date: str, to_date: str):
		fields = [*MONTH_FIELDS, {"SUM": "debit", "as": "inflow"}, {"SUM": "credit", "as": "outflow"}]
		rows = self._ledger_totals(
			from_date, to_date, {"account.account_type": ["in", ["Cash", "Bank"]]}, fields, MONTH_GROUP
		)
		return [
			{"yearmonth": _year_month(row), "inflow": rounded(row.inflow), "outflow": rounded(row.outflow)}
			for row in rows
		]

	def income_and_expenses(self, from_date: str, to_date: str):
		return {
			"income": self._monthly_balances(from_date, to_date, "Income", CREDIT_MINUS_DEBIT),
			"expense": self._monthly_balances(from_date, to_date, "Expense", DEBIT_MINUS_CREDIT),
		}

	def total_credit_and_debit(self):
		fields = ["account", {"SUM": "credit", "as": "credit"}, {"SUM": "debit", "as": "debit"}]
		rows = self._ledger_totals(None, None, {}, fields, "account")
		return [
			{"account": row.account, "totalCredit": rounded(row.credit), "totalDebit": rounded(row.debit)}
			for row in rows
		]

	def stock_quantity(
		self,
		item: str,
		location: str | None = None,
		from_date: str | None = None,
		to_date: str | None = None,
		batch: str | None = None,
		serial_numbers: list[str] | None = None,
	):
		filters: dict[str, Any] = {"item": item}
		if location:
			filters["location"] = location
		if batch:
			filters["batch"] = batch
		if serial_numbers:
			filters["serial_number"] = ["in", serial_numbers]
		if from_date and to_date:
			filters["date"] = ["between", [from_date, to_date]]
		elif from_date:
			filters["date"] = [">=", from_date]
		elif to_date:
			filters["date"] = ["<=", to_date]
		quantity = frappe.get_list(
			"Books Stock Ledger Entry", filters=filters, fields=[{"SUM": "quantity", "as": "quantity"}]
		)[0].quantity
		return None if quantity is None else float(quantity)

	def stock_quantities(self, location: str | None = None, items: list[str] | None = None):
		"""Return the stock quantity of each item and batch."""
		filters: dict[str, Any] = {}
		if location:
			filters["location"] = location
		if items:
			filters["item"] = ["in", items]
		return frappe.get_list(
			"Books Stock Ledger Entry",
			filters=filters,
			fields=["item", "batch", {"SUM": "quantity", "as": "quantity"}],
			group_by="item, batch",
			order_by="item, batch",
		)

	def return_balance(self, source_schema: str, name: str):
		doc = frappe.get_doc(target_doctype(source_schema), name)
		doc.check_permission("read")
		return_names = frappe.get_list(
			doc.doctype,
			filters={"return_against": name, "docstatus": 1},
			pluck="name",
		)
		if not return_names:
			return None

		returned_rows = frappe.get_list(
			doc.meta.get_field("items").options,
			filters={"parent": ["in", return_names], "parenttype": doc.doctype, "parentfield": "items"},
			fields=["item", "quantity", "batch", "serial_number"],
			parent_doctype=doc.doctype,
		)
		if not returned_rows:
			return None

		original_items = self._return_items(doc.items)
		returned_items = self._return_items(returned_rows)
		balances = {}
		for item, original in original_items.items():
			returned = returned_items.get(item, {})
			balances[item] = self._remaining_return(original, returned)
			balances[item]["batches"] = {
				batch: self._remaining_return(values, returned.get("batches", {}).get(batch, {}))
				for batch, values in original["batches"].items()
			}
		return balances

	def pos_transacted_amount(self, from_date: str, to_date: str):
		"""Return the same expected amounts the closing shift stores on the server."""
		for doctype in ("Books Payment", "Books Sales Invoice"):
			frappe.has_permission(doctype, ptype="read", throw=True)
		return transacted_amounts(get_datetime(from_date), get_datetime(to_date))

	def open_pos_shift(self):
		if not frappe.has_permission("Books Pos Opening Shift", ptype="read"):
			raise frappe.PermissionError
		return open_shift_name()

	def linked_entries(self, source_schema: str, name: str):
		return linked_entries(source_schema, name)

	def general_ledger(self, filters: LedgerFilters):
		return general_ledger(filters)

	def trial_balance(self, from_date: str, to_date: str):
		return financial_statements.trial_balance(from_date, to_date)

	def profit_and_loss(self, periods: list[Period]):
		return financial_statements.profit_and_loss(periods)

	def balance_sheet(self, periods: list[Period]):
		return financial_statements.balance_sheet(periods)

	def stock_ledger(self, filters: StockFilters):
		return stock.stock_ledger(filters)

	def stock_balance(self, filters: StockFilters):
		return stock.stock_balance(filters)

	def gstr_rows(self, schema: Literal["SalesInvoice", "PurchaseInvoice"], filters: GSTRFilters):
		return gst.gstr_rows(schema, filters)

	def new_series_names(self, source_schema: Literal["Batch", "SerialNumber"], item: str, count: int):
		return new_item_names(target_doctype(source_schema), item, count)

	def _monthly_balances(self, from_date, to_date, root_type, balance):
		rows = self._ledger_totals(
			from_date, to_date, {"account.root_type": root_type}, [*MONTH_FIELDS, *balance], MONTH_GROUP
		)
		return [{"yearmonth": _year_month(row), "balance": rounded(row.balance)} for row in rows]

	def _ledger_totals(self, from_date, to_date, filters, fields, group_by):
		filters = {"reverted": 0, **filters}
		if from_date and to_date:
			filters["posting_date"] = ["between", [getdate(from_date), getdate(to_date)]]
		return frappe.get_list(
			"Books Ledger Entry", filters=filters, fields=fields, group_by=group_by, order_by=group_by
		)

	def _invoice_totals(self, source_schema, from_date, to_date, is_return):
		return frappe.get_list(
			target_doctype(source_schema),
			filters={
				"docstatus": 1,
				"date": ["between", [from_date, to_date]],
				"return_against": ["is", "set" if is_return else "not set"],
			},
			fields=[
				{"SUM": "base_grand_total", "as": "total"},
				{"SUM": "outstanding_amount", "as": "outstanding"},
			],
		)[0]

	def _return_items(self, rows):
		items = defaultdict(lambda: {"quantity": as_decimal(0), "batches": {}, "serialNumbers": []})
		for row in rows:
			entry = items[row.item]
			quantity = abs(as_decimal(row.quantity))
			entry["quantity"] += quantity
			if row.get("batch"):
				batch = entry["batches"].setdefault(
					row.batch, {"quantity": as_decimal(0), "serialNumbers": []}
				)
				batch["quantity"] += quantity
			self._add_serials(entry, row)
		return items

	def _remaining_return(self, original, returned):
		remaining = max(original["quantity"] - returned.get("quantity", 0), 0)
		returned_serials = set(returned.get("serialNumbers", []))
		return {
			# The interface represents return quantities as negative values.
			"quantity": -float(remaining),
			"serialNumbers": [
				serial for serial in original["serialNumbers"] if serial not in returned_serials
			],
		}

	def _add_serials(self, entry, row):
		serials = parse_serial_numbers(row.get("serial_number"))
		entry["serialNumbers"].extend(serials)
		if row.get("batch"):
			entry["batches"][row.batch]["serialNumbers"].extend(serials)


def _year_month(row) -> str:
	return f"{row.year:04d}-{row.month:02d}"


_METHODS = {
	"getTopExpenses": "top_expenses",
	"getTotalOutstanding": "total_outstanding",
	"getCashflow": "cashflow",
	"getIncomeAndExpenses": "income_and_expenses",
	"getTotalCreditAndDebit": "total_credit_and_debit",
	"getStockQuantity": "stock_quantity",
	"getStockQuantities": "stock_quantities",
	"getReturnBalanceItemsQty": "return_balance",
	"getPOSTransactedAmount": "pos_transacted_amount",
	"getOpenPOSShift": "open_pos_shift",
	"getLinkedEntries": "linked_entries",
	"getGeneralLedger": "general_ledger",
	"getTrialBalance": "trial_balance",
	"getProfitAndLoss": "profit_and_loss",
	"getBalanceSheet": "balance_sheet",
	"getStockLedger": "stock_ledger",
	"getStockBalance": "stock_balance",
	"getGSTRRows": "gstr_rows",
	"getNewSeriesNames": "new_series_names",
}
