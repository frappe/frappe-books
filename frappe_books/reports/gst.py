from collections import defaultdict
from datetime import date

import frappe
from frappe import _
from frappe.utils import add_months, create_batch, getdate

from frappe_books.accounting.money import as_decimal, rounded, sum_decimal
from frappe_books.regional import INDIAN_STATES
from frappe_books.reports.filters import datetime_conditions

# The amount field of each GST head an account holds.
TAX_AMOUNT_FIELDS = {"IGST": "igst_amount", "CGST": "cgst_amount", "SGST": "sgst_amount"}
# CGST rule 59(4): interstate B2C invoices above this value are listed one by one. Notification
# 12/2024-Central Tax lowered it from 2,50,000 to 1,00,000 from 1 August 2024.
LARGE_B2C_INVOICE = 100000
LARGE_B2C_INVOICE_FROM = date(2024, 8, 1)
LARGE_B2C_INVOICE_BEFORE = 250000
CREDIT_NOTES = ("CDNR", "CDNUR")
# SQLite allows 32766 query parameters.
IN_LIST_BATCH_SIZE = 1000


def get_default_filters() -> dict:
	today = getdate()
	return {"from_date": add_months(today, -3), "to_date": today, "transfer_type": "B2B"}


def get_columns(filters) -> list[dict]:
	transfer_type = filters.get("transfer_type") or "B2B"
	note = transfer_type in CREDIT_NOTES
	columns = [
		{"fieldname": "party", "label": _("Party"), "fieldtype": "Data", "width": 180},
		{
			"fieldname": "invoice_no",
			"label": _("Note No.") if note else _("Invoice No."),
			"fieldtype": "Data",
		},
		{
			"fieldname": "invoice_value",
			"label": _("Note Value") if note else _("Invoice Value"),
			"fieldtype": "Currency",
		},
		{
			"fieldname": "invoice_date",
			"label": _("Note Date") if note else _("Invoice Date"),
			"fieldtype": "Date",
		},
		{"fieldname": "place", "label": _("Place of supply"), "fieldtype": "Data"},
		{"fieldname": "rate", "label": _("Rate"), "fieldtype": "Data", "width": 60},
		{"fieldname": "taxable_value", "label": _("Taxable Value"), "fieldtype": "Currency"},
		{"fieldname": "reverse_charge", "label": _("Reverse Chrg."), "fieldtype": "Data"},
		{"fieldname": "igst_amount", "label": _("Integrated Tax"), "fieldtype": "Currency"},
		{"fieldname": "cgst_amount", "label": _("Central Tax"), "fieldtype": "Currency"},
		{"fieldname": "sgst_amount", "label": _("State Tax"), "fieldtype": "Currency"},
	]
	if transfer_type in ("B2B", "CDNR"):
		columns.insert(0, {"fieldname": "gstin", "label": _("GSTIN No."), "fieldtype": "Data", "width": 180})
	return columns


def get_data(doctype, filters) -> list[dict]:
	"""Return one row per submitted invoice and tax rate, in the company currency."""
	invoices = _invoices(doctype, filters)
	if not invoices:
		return []
	items = _items(doctype, [invoice.name for invoice in invoices])
	details = _tax_details({item.tax for item in items if item.tax})
	places = _party_places({invoice.party for invoice in invoices})
	company_state = _gstin_state(frappe.db.get_single_value("Books Accounting Settings", "gstin"))
	originals = _originals(
		doctype, {invoice.return_against for invoice in invoices if invoice.return_against}
	)
	items_by_invoice = defaultdict(list)
	for item in items:
		items_by_invoice[item.parent].append(item)
	rows = []
	for invoice in invoices:
		gstin, place = places[invoice.party]
		header = _row_header(invoice, gstin, place, company_state, originals.get(invoice.return_against))
		rows += _invoice_rows(invoice, items_by_invoice[invoice.name], details, header)
	return [row for row in rows if _matches(row, filters)]


def _invoices(doctype, filters):
	conditions = [
		["docstatus", "=", 1],
		*datetime_conditions("date", filters.get("from_date"), filters.get("to_date")),
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
			"return_against",
		],
		order_by="date asc, name asc",
	)


def _originals(doctype, names):
	"""Return the invoices that the credit notes return, by name."""
	invoices = _get_list_in(doctype, "name", names, fields=["name", "date", "base_grand_total"])
	return {invoice.name: invoice for invoice in invoices}


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
		fields=["parent", "rate", "account.gst_head as gst_head"],
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
	"""The state of the party's address, or else of its GSTIN."""
	return positions.get(party.address) or _gstin_state(party.gstin)


def _gstin_state(gstin):
	return INDIAN_STATES.get((gstin or "")[:2], "")


def _row_header(invoice, gstin, place, company_state, original):
	return {
		"gstin": gstin,
		"party": invoice.party,
		"invoice_no": invoice.name,
		"invoice_date": getdate(invoice.date),
		# Reverse charge depends on what is supplied, not on the GSTIN, and Books records no such supply.
		"reverse_charge": "N",
		"in_state": bool(company_state) and company_state == place,
		"place": place,
		"invoice_value": as_decimal(invoice.base_grand_total),
		"return_against": invoice.return_against,
		# A credit note is B2C-Large when the invoice it returns is.
		"above_b2c_limit": _is_above_b2c_limit(original or invoice),
	}


def _is_above_b2c_limit(invoice):
	date = getdate(invoice.date)
	limit = LARGE_B2C_INVOICE if date >= LARGE_B2C_INVOICE_FROM else LARGE_B2C_INVOICE_BEFORE
	return as_decimal(invoice.base_grand_total) > limit


def _invoice_rows(invoice, items, details, header):
	rows = {}
	for item in items:
		item_details = details[item.tax] if item.tax else []
		rate = sum_decimal(detail.rate for detail in item_details)
		row = rows.setdefault(rate, {**header, "rate": rate, "taxable_value": as_decimal(0)})
		base = as_decimal(item.amount if invoice.discount_after_tax else item.item_discounted_total)
		row["taxable_value"] += base
		for detail in item_details:
			_add_tax(row, detail, base, invoice.currency)
	return [_in_company_currency(row, invoice.exchange_rate) for row in rows.values()]


def _add_tax(row, detail, base, currency):
	field = TAX_AMOUNT_FIELDS.get(detail.gst_head)
	if not field:
		return
	row[field] = row.get(field, as_decimal(0)) + rounded(base * as_decimal(detail.rate) / 100, currency)
	if detail.gst_head == "IGST":
		row["in_state"] = False


def _in_company_currency(row, exchange_rate):
	for field in ("taxable_value", *TAX_AMOUNT_FIELDS.values()):
		if field in row:
			row[field] = rounded(row[field] * as_decimal(exchange_rate or 1))
	return row


def _transfer_type(row):
	"""Return the one GSTR section a row belongs to."""
	if row["rate"] == 0:
		return "NR"
	if row["gstin"]:
		return "CDNR" if row["return_against"] else "B2B"
	if not row["in_state"] and row["above_b2c_limit"]:
		return "CDNUR" if row["return_against"] else "B2CL"
	# Credit notes of other consumer invoices reduce B2C-Small, as GSTR-1 table 7 nets them.
	return "B2CS"


def _matches(row, filters):
	place = filters.get("place")
	if place and INDIAN_STATES.get(place) != row["place"]:
		return False
	transfer_type = filters.get("transfer_type")
	return not transfer_type or _transfer_type(row) == transfer_type
