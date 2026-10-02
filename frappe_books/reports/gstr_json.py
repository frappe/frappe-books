from collections import defaultdict

import frappe
from frappe import _
from frappe.desk.query_report import run
from frappe.utils import getdate

from frappe_books.accounting.money import as_decimal
from frappe_books.regional import INDIAN_STATES

GSTR_REPORTS = ("Books GSTR-1", "Books GSTR-2")
STATE_CODES = {state: code for code, state in INDIAN_STATES.items()}
TAX_AMOUNTS = {"iamt": "igst_amount", "camt": "cgst_amount", "samt": "sgst_amount"}


@frappe.whitelist()
def get_gstr_json(report_name: str, filters: dict) -> dict:
	"""Return the GST portal JSON of the rows a GSTR report shows for `filters`."""
	if report_name not in GSTR_REPORTS:
		frappe.throw(_("{0} is not a GSTR report.").format(report_name))
	frappe.permissions.can_export(
		frappe.get_cached_value("Report", report_name, "ref_doctype"), raise_exception=True
	)
	gstin = frappe.db.get_single_value("Books Accounting Settings", "gstin")
	if not gstin:
		frappe.throw(_("Please set GSTIN in General Settings."), title=_("Cannot Export"))
	filters = frappe._dict(filters)
	build = SECTIONS.get(filters.transfer_type)
	if not build:
		frappe.throw(
			_("JSON export is not available for nil rated, exempted and non-GST supplies."),
			title=_("Cannot Export"),
		)
	return {
		"version": "GST3.0.4",
		"hash": "hash",
		"gstin": gstin,
		"fp": getdate(filters.to_date).strftime("%m%Y"),
		filters.transfer_type.lower(): build(run(report_name, filters)["result"]),
	}


def _b2b(rows) -> list[dict]:
	return _by_gstin(rows, _invoice, "inv")


def _cdnr(rows) -> list[dict]:
	return _by_gstin(rows, _note, "nt")


def _by_gstin(rows, build, key):
	"""Return the documents built from the rows, grouped by the party's GSTIN."""
	documents_by_gstin = defaultdict(list)
	for document_rows in _rows_by_invoice(rows):
		row = document_rows[0]
		document = build(document_rows, ("iamt", "camt", "samt"))
		document.update(pos=_state_code(row), rchrg=row["reverse_charge"], inv_typ="R")
		documents_by_gstin[row["gstin"]].append(document)
	return [{"ctin": gstin, key: documents} for gstin, documents in documents_by_gstin.items()]


def _b2cl(rows) -> list[dict]:
	invoices_by_state = defaultdict(list)
	for invoice_rows in _rows_by_invoice(rows):
		invoices_by_state[_state_code(invoice_rows[0])].append(_invoice(invoice_rows, ("iamt",)))
	return [{"pos": state, "inv": invoices} for state, invoices in invoices_by_state.items()]


def _cdnur(rows) -> list[dict]:
	"""Return the credit notes of B2C-Large invoices, the only unregistered notes Books makes."""
	return [
		{"typ": "B2CL", "pos": _state_code(note_rows[0]), **_note(note_rows, ("iamt",))}
		for note_rows in _rows_by_invoice(rows)
	]


def _b2cs(rows) -> list[dict]:
	"""Return the supplies summed by supply type, place of supply and rate, as the portal expects."""
	summaries = {}
	for row in rows:
		supply_type = "INTRA" if row["in_state"] else "INTER"
		key = (supply_type, _state_code(row), row["rate"])
		summary = summaries.setdefault(
			key,
			{"sply_ty": supply_type, "pos": key[1], "typ": "OE", "txval": as_decimal(0), "rt": row["rate"]},
		)
		summary["txval"] += row["taxable_value"]
		for field, amount in {**_tax_amounts(row, TAX_AMOUNTS), "csamt": 0}.items():
			summary[field] = summary.get(field, as_decimal(0)) + amount
	return list(summaries.values())


def _rows_by_invoice(rows):
	"""The report has one row per invoice and tax rate."""
	invoices = defaultdict(list)
	for row in rows:
		invoices[row["invoice_no"]].append(row)
	return invoices.values()


def _invoice(rows, tax_fields, amount=lambda value: value):
	row = rows[0]
	items = [
		{
			"num": number,
			"itm_det": {
				"txval": amount(rate_row["taxable_value"]),
				"rt": rate_row["rate"],
				"csamt": 0,
				**{
					field: amount(value)
					for field, value in _tax_amounts(
						rate_row, {field: TAX_AMOUNTS[field] for field in tax_fields}
					).items()
				},
			},
		}
		for number, rate_row in enumerate(rows, 1)
	]
	return {
		"inum": row["invoice_no"],
		"idt": getdate(row["invoice_date"]).strftime("%d-%m-%Y"),
		"val": amount(row["invoice_value"]),
		"itms": items,
	}


def _note(rows, tax_fields):
	"""Return a credit note as the portal takes it: its type and unsigned amounts."""
	note = _invoice(rows, tax_fields, amount=abs)
	return {"ntty": "C", "nt_num": note.pop("inum"), "nt_dt": note.pop("idt"), **note}


def _tax_amounts(row, fields):
	return {field: row.get(amount_field) or as_decimal(0) for field, amount_field in fields.items()}


def _state_code(row):
	if row["place"] not in STATE_CODES:
		frappe.throw(_("Set the place of supply for invoice {0}.").format(row["invoice_no"]))
	return STATE_CODES[row["place"]]


SECTIONS = {"B2B": _b2b, "B2CL": _b2cl, "B2CS": _b2cs, "CDNR": _cdnr, "CDNUR": _cdnur}
