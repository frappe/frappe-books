"""Previews of ERPNext documents: what a save would fill, worked out by ERPNext's own code."""

import frappe
from erpnext.accounts.doctype.loyalty_program.loyalty_program import get_loyalty_program_details
from erpnext.accounts.doctype.pricing_rule.utils import validate_coupon_code
from erpnext.accounts.party import get_party_details
from erpnext.accounts.services.taxes import get_default_taxes_and_charges
from frappe.model import no_value_fields
from frappe.model.document import Document
from frappe.utils import flt

from frappe_books.accessory import pos
from frappe_books.permissions import check_preview_permission

# ERPNext's own steps that fill a draft, by doctype; transactions fill their defaults and totals.
FILL_STEPS = {
	"Payment Entry": (
		"setup_party_account_field",
		"set_missing_values",
		"set_missing_ref_details",
		"set_exchange_rate",
		"set_amounts",
		"apply_taxes",
		"set_amounts_after_tax",
	),
	"Journal Entry": ("set_amounts_in_company_currency", "set_total_debit_credit"),
	"Stock Entry": ("set_missing_values", "calculate_rate_and_amount"),
}
DEFAULT_FILL_STEPS = ("set_missing_values", "calculate_taxes_and_totals")
# Party fields and the party type they name, as Desk refreshes a document from its party; a
# quotation's party is a customer or a lead, which ERPNext fills only where empty.
PARTY_TYPES = {"customer": "Customer", "supplier": "Supplier", "party_name": "Customer"}
# Fields after whose change Desk prices every row again.
PRICE_SOURCES = {"selling_price_list", "buying_price_list", "currency", "price_list_currency"}
# What Desk's form scripts fill as their fields change, for doctypes ERPNext's Python leaves to them
FORM_FILLS = {
	"POS Opening Entry": pos.fill_opening_entry,
	"POS Closing Entry": pos.fill_closing_entry,
}


@frappe.whitelist(methods=["POST"])
def preview(doc: dict, changed: dict | None = None, check_coupons: bool = False) -> dict:
	"""`doc` as ERPNext would fill it on save, without writing anything.

	`changed` names the fields the user edited since the last preview, as
	`{"doc": [fieldname], "rows": {row name: [fieldname]}}`. As in Desk, a new
	party refreshes its details and the prices, and a new item its row; a rate
	the user typed stays, which ERPNext keeps as a discount. `check_coupons`
	refuses a coupon ERPNext would refuse on save.
	"""
	document = get_document(frappe.parse_json(doc))
	check_preview_permission(document)
	if document.docstatus != 0:
		return document.as_dict()

	changed = frappe.parse_json(changed) or {}
	edited = set(changed.get("doc") or [])
	edited_rows = changed.get("rows") or {}
	frappe.db.savepoint("books_preview")
	try:
		refresh_party(document, edited)
		refresh_items(document, edited_rows)
		if edited & PRICE_SOURCES:
			reprice_rows(document, edited_rows)
		if check_coupons and document.get("coupon_code"):
			validate_coupon_code(document.coupon_code)
		fill(document, edited)
		return document.as_dict()
	finally:
		# ERPNext's fills only read, but a preview never keeps a write.
		frappe.db.rollback(save_point="books_preview")


def get_document(values: dict) -> Document:
	"""The saved draft with `values`, or a new document with ERPNext's defaults and the values set."""
	doctype = values["doctype"]
	name = values.get("name")
	if values.get("__islocal") or not name or not frappe.db.exists(doctype, name):
		document = frappe.new_doc(doctype)
		document.update({key: value for key, value in values.items() if value is not None})
		document.name = None
		set_default_taxes(document)
		return document

	document = frappe.get_doc(doctype, name)
	document.update(values)
	return document


def set_default_taxes(document: Document):
	"""A new document takes the company's default tax template, as Desk gives it, until the user clears it."""
	field = document.meta.get_field("taxes_and_charges")
	if field and document.get("taxes_and_charges") is None and not document.get("taxes"):
		document.update(get_default_taxes_and_charges(field.options, company=document.company) or {})


def refresh_party(document: Document, edited: set[str]):
	"""A new party's details replace the old party's, prices included, as Desk does."""
	fieldname = next((field for field in PARTY_TYPES if field in edited and document.get(field)), None)
	if not fieldname or document.get("quotation_to") not in (None, "Customer"):
		return

	details = get_party_details(
		party=document.get(fieldname),
		party_type=PARTY_TYPES[fieldname],
		company=document.company,
		posting_date=document.get("posting_date") or document.get("transaction_date"),
		price_list=document.get("selling_price_list") or document.get("buying_price_list"),
		doctype=document.doctype,
	)
	template = document.get("taxes_and_charges")
	document.update({key: value for key, value in details.items() if document.meta.has_field(key)})
	if document.get("taxes_and_charges") != template:
		# ERPNext fills the new template's rows into an empty table.
		document.set("taxes", [])
	reprice_rows(document, {})


def refresh_items(document: Document, edited_rows: dict[str, list[str]]):
	"""A row whose item changed starts afresh, keeping its quantity and what the user just typed.

	An empty quantity is 1, as Desk asks ERPNext for an item's details and price with.
	"""
	for row in document.get("items") or []:
		edited = set(edited_rows.get(row.name) or [])
		if "item_code" in edited:
			kept = {"item_code", "qty", *edited}
			for field in row.meta.fields:
				if field.fieldtype not in no_value_fields and field.fieldname not in kept:
					row.set(field.fieldname, None)
		if row.item_code and not row.qty:
			row.qty = 1


def reprice_rows(document: Document, edited_rows: dict[str, list[str]]):
	"""Rows take prices from the new price list, except a rate the user just typed."""
	for row in document.get("items") or []:
		if not row.item_code or row.get("is_free_item") or "rate" in (edited_rows.get(row.name) or []):
			continue
		row.price_list_rate = None
		row.rate = None


def fill(document: Document, edited: set[str]):
	"""Run ERPNext's steps that fill the document's defaults, details and totals, then Desk's form fills.

	A POS invoice keeps the payments the cashier entered, which its POS Profile's modes replace.
	"""
	tendered = pos.get_tendered_payments(document)
	for step in FILL_STEPS.get(document.doctype, DEFAULT_FILL_STEPS):
		if hasattr(document, step):
			getattr(document, step)()
		if step == "set_missing_values":
			pos.restore_tendered_payments(document, tendered)
			fill_loyalty(document, edited)

	if form_fill := FORM_FILLS.get(document.doctype):
		form_fill(document, edited)


def fill_loyalty(document: Document, edited: set[str]):
	"""A sales invoice takes its customer's loyalty program, and redeemed points their value, as Desk's form does."""
	if document.doctype != "Sales Invoice" or not document.customer:
		return

	if "customer" in edited or not document.loyalty_program:
		# The field's fetch_from, which Desk runs as the customer changes
		document.loyalty_program = frappe.db.get_value("Customer", document.customer, "loyalty_program")
	if not (document.redeem_loyalty_points and document.loyalty_points and document.loyalty_program):
		document.loyalty_amount = 0
		return

	details = get_loyalty_program_details(
		document.customer, document.loyalty_program, document.posting_date, document.company
	)
	document.loyalty_redemption_account = details.expense_account
	document.loyalty_redemption_cost_center = details.cost_center
	document.loyalty_amount = flt(
		details.conversion_factor * document.loyalty_points, document.precision("loyalty_amount")
	)
