from collections import defaultdict
from typing import Literal, TypedDict

import frappe
from frappe.utils import create_batch

from frappe_books.accounting.money import as_decimal, rounded, sum_decimal
from frappe_books.regional import INDIAN_STATES
from frappe_books.reports.filters import datetime_conditions
from frappe_books.ui_bridge.mapping import target_doctype

TAX_AMOUNT_FIELDS = {"IGST": "igstAmt", "CGST": "cgstAmt", "SGST": "sgstAmt"}
TAX_FLAGS = {"Nil Rated": "nilRated", "Exempt": "exempt", "Non GST": "nonGST"}
LARGE_B2C_INVOICE = 250000
# SQLite allows 32766 query parameters.
IN_LIST_BATCH_SIZE = 1000
TRANSFER_TYPES = {
	"B2B": lambda row: bool(row["gstin"]),
	"B2CL": lambda row: not row["gstin"] and not row["inState"] and row["invAmt"] >= LARGE_B2C_INVOICE,
	"B2CS": lambda row: not row["gstin"] and (row["inState"] or row["invAmt"] < LARGE_B2C_INVOICE),
	"NR": lambda row: row["rate"] == 0,
}


class GSTRFilters(TypedDict, total=False):
	fromDate: str | None
	toDate: str | None
	place: str | None
	transferType: Literal["B2B", "B2CL", "B2CS", "NR"] | None


def gstr_rows(schema: Literal["SalesInvoice", "PurchaseInvoice"], filters: GSTRFilters) -> list[dict]:
	"""Return one row per submitted invoice and tax rate, in the company currency."""
	doctype = target_doctype(schema)
	invoices = _invoices(doctype, filters)
	if not invoices:
		return []
	items = _items(doctype, [invoice.name for invoice in invoices])
	details = _tax_details({item.tax for item in items if item.tax})
	places = _party_places({invoice.party for invoice in invoices})
	company_state = _gstin_state(frappe.db.get_single_value("Books Accounting Settings", "gstin"))
	items_by_invoice = defaultdict(list)
	for item in items:
		items_by_invoice[item.parent].append(item)
	rows = []
	for invoice in invoices:
		gstin, place = places[invoice.party]
		header = _row_header(invoice, gstin, place, company_state)
		rows += _invoice_rows(invoice, items_by_invoice[invoice.name], details, header)
	return [row for row in rows if _matches(row, filters)]


def _invoices(doctype, filters):
	conditions = [
		["docstatus", "=", 1],
		*datetime_conditions("date", filters.get("fromDate"), filters.get("toDate")),
	]
	return frappe.get_list(
		doctype,
		filters=conditions,
		fields=[
			"name",
			"party",
			"date",
			"base_grand_total",
			"currency",
			"exchange_rate",
			"discount_after_tax",
		],
		order_by="date asc, name asc",
	)


def _items(doctype, names):
	return _get_list_in(
		frappe.get_meta(doctype).get_field("items").options,
		"parent",
		names,
		filters={"parenttype": doctype, "parentfield": "items"},
		fields=["parent", "tax", "amount", "item_discounted_total"],
		parent_doctype=doctype,
		order_by="idx asc",
	)


def _tax_details(taxes):
	details = defaultdict(list)
	if not taxes:
		return details
	for detail in frappe.get_list(
		"Books Tax Detail",
		filters={"parent": ["in", list(taxes)], "parenttype": "Books Tax"},
		fields=["parent", "account", "rate"],
		parent_doctype="Books Tax",
	):
		details[detail.parent].append(detail)
	return details


def _party_places(parties):
	"""Return each party's GSTIN and place of supply."""
	rows = _get_list_in("Books Party", "name", parties, fields=["name", "gstin", "address"])
	addresses = {row.address for row in rows if row.address}
	positions = dict(_get_list_in("Books Address", "name", addresses, fields=["name", "pos"], as_list=True))
	return {row.name: (row.gstin or "", _place(row, positions)) for row in rows}


def _get_list_in(doctype, fieldname, values, filters=None, **kwargs):
	"""`frappe.get_list` of rows whose `fieldname` is in `values`, queried in batches."""
	rows = []
	for batch in create_batch(list(values), IN_LIST_BATCH_SIZE):
		rows += frappe.get_list(doctype, filters={**(filters or {}), fieldname: ["in", batch]}, **kwargs)
	return rows


def _place(party, positions):
	if party.address:
		return positions.get(party.address) or ""
	return _gstin_state(party.gstin)


def _gstin_state(gstin):
	return INDIAN_STATES.get((gstin or "")[:2], "")


def _row_header(invoice, gstin, place, company_state):
	return {
		"gstin": gstin,
		"partyName": invoice.party,
		"invNo": invoice.name,
		"invDate": invoice.date,
		"reverseCharge": "N" if gstin else "Y",
		"inState": bool(company_state) and company_state == place,
		"place": place,
		"invAmt": as_decimal(invoice.base_grand_total),
	}


def _invoice_rows(invoice, items, details, header):
	rows = {}
	for item in items:
		item_details = details[item.tax] if item.tax else []
		rate = sum_decimal(detail.rate for detail in item_details)
		row = rows.setdefault(rate, {**header, "rate": rate, "taxVal": as_decimal(0)})
		base = as_decimal(item.amount if invoice.discount_after_tax else item.item_discounted_total)
		row["taxVal"] += base
		for detail in item_details:
			_add_tax(row, detail, base, invoice.currency)
	return [_in_company_currency(row, invoice.exchange_rate) for row in rows.values()]


def _add_tax(row, detail, base, currency):
	if detail.account in TAX_FLAGS:
		row[TAX_FLAGS[detail.account]] = True
	if detail.account not in TAX_AMOUNT_FIELDS:
		return
	field = TAX_AMOUNT_FIELDS[detail.account]
	row[field] = row.get(field, as_decimal(0)) + rounded(base * as_decimal(detail.rate) / 100, currency)
	if detail.account == "IGST":
		row["inState"] = False


def _in_company_currency(row, exchange_rate):
	for field in ("taxVal", *TAX_AMOUNT_FIELDS.values()):
		if field in row:
			row[field] = rounded(row[field] * as_decimal(exchange_rate or 1))
	return row


def _matches(row, filters):
	place = filters.get("place")
	if place and INDIAN_STATES.get(place) != row["place"]:
		return False
	matches_transfer_type = TRANSFER_TYPES.get(filters.get("transferType"))
	return not matches_transfer_type or matches_transfer_type(row)
