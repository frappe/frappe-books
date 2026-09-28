"""Aggregate queries used by the Books web interface."""

from typing import Any, Literal

import frappe
from frappe.utils import getdate

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.commerce.pos import open_shift_name, transacted_amounts
from frappe_books.inventory.auto_transfer import default_location
from frappe_books.series import default_series_by_schema, new_item_names
from frappe_books.ui_bridge.database import system_datetime
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
			filters["date"] = ["between", [system_datetime(from_date), system_datetime(to_date)]]
		elif from_date:
			filters["date"] = [">=", system_datetime(from_date)]
		elif to_date:
			filters["date"] = ["<=", system_datetime(to_date)]
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

	def stock_location(self, source_schema: Literal["SalesInvoice", "PurchaseInvoice"], is_pos: bool = False):
		"""Return the location an invoice's stock transfer uses, as the server picks it."""
		invoice = frappe.new_doc(target_doctype(source_schema), is_pos=is_pos)
		frappe.has_permission(invoice.doctype, "read", throw=True)
		return default_location(invoice)

	def pos_transacted_amount(self, from_date: str, to_date: str):
		"""Return the same expected amounts the closing shift stores on the server."""
		for doctype in ("Books Payment", "Books Sales Invoice"):
			frappe.has_permission(doctype, ptype="read", throw=True)
		return transacted_amounts(system_datetime(from_date), system_datetime(to_date))

	def open_pos_shift(self):
		if not frappe.has_permission("Books Pos Opening Shift", ptype="read"):
			raise frappe.PermissionError
		return open_shift_name()

	def linked_entries(self, source_schema: str, name: str):
		return linked_entries(source_schema, name)

	def new_series_names(self, source_schema: Literal["Batch", "SerialNumber"], item: str, count: int):
		return new_item_names(target_doctype(source_schema), item, count)

	def default_number_series(self):
		frappe.has_permission("Books Defaults", "read", throw=True)
		return default_series_by_schema()

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
				"date": ["between", [system_datetime(from_date), system_datetime(to_date)]],
				"return_against": ["is", "set" if is_return else "not set"],
			},
			fields=[
				{"SUM": "base_grand_total", "as": "total"},
				{"SUM": "outstanding_amount", "as": "outstanding"},
			],
		)[0]


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
	"getStockLocation": "stock_location",
	"getPOSTransactedAmount": "pos_transacted_amount",
	"getOpenPOSShift": "open_pos_shift",
	"getLinkedEntries": "linked_entries",
	"getNewSeriesNames": "new_series_names",
	"getDefaultNumberSeries": "default_number_series",
}
