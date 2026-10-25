"""Previews of ERPNext documents: what a save would fill, worked out by ERPNext's own code."""

from contextlib import contextmanager

import frappe
from erpnext.accounts.doctype.loyalty_program.loyalty_program import get_loyalty_program_details
from erpnext.accounts.doctype.payment_entry.payment_entry import get_reference_details
from erpnext.accounts.doctype.pricing_rule.utils import validate_coupon_code
from erpnext.accounts.party import get_party_details
from erpnext.accounts.services.taxes import get_default_taxes_and_charges
from erpnext.stock.doctype.stock_entry.stock_entry import get_uom_details
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
# The payment type a new payment takes from its party type, and the reverse
PAYMENT_TYPE_OF_PARTY = {"Customer": "Receive", "Supplier": "Pay"}
PARTY_TYPE_OF_PAYMENT = {"Receive": "Customer", "Pay": "Supplier"}
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
	untouched = document.is_new() and not (edited or edited_rows)
	frappe.db.savepoint("books_preview")
	try:
		fetch_links(document)
		refresh_party(document, edited)
		refresh_items(document, edited_rows)
		fill_stock_entry_rows(document)
		if hasattr(document, "set_use_serial_batch_fields"):
			# What its save sets, which shows the rows' Batch No and Serial No as Desk's form does
			document.set_use_serial_batch_fields()
		fill_payment_account(document)
		reallocate_payment(document, edited)
		if edited & PRICE_SOURCES:
			reprice_rows(document, edited_rows)
		if check_coupons and document.get("coupon_code"):
			validate_coupon_code(document.coupon_code)
		with without_blank_rows(document):
			if untouched:
				fill_untouched(document)
			else:
				fill(document, edited)
				allocate_references(document)
		# What the steps announced, like an Item Price added, is rolled back; the save says it again.
		frappe.clear_messages()
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
		set_payment_party_type(document, values)
		return document

	document = frappe.get_doc(doctype, name)
	document.update(values)
	return document


def set_default_taxes(document: Document):
	"""A new document takes the company's default tax template, as Desk gives it, until the user clears it.

	The client sends a template it was given empty, so rows already there came
	from it on an earlier preview and stay as they are.
	"""
	field = document.meta.get_field("taxes_and_charges")
	if not field or document.get("taxes_and_charges") is not None:
		return

	default = get_default_taxes_and_charges(field.options, company=document.company) or {}
	if document.get("taxes"):
		default.pop("taxes", None)
	document.update(default)


def set_payment_party_type(document: Document, values: dict):
	"""A new payment given only a party type receives from a customer or pays a supplier, as Books' payments do;
	one without a party type takes its payment type's, as Desk's form fills it.
	"""
	if document.doctype != "Payment Entry":
		return

	if values.get("party_type") and not values.get("payment_type"):
		document.payment_type = PAYMENT_TYPE_OF_PARTY.get(document.party_type, document.payment_type)
	elif not (document.party_type or document.party):
		document.party_type = PARTY_TYPE_OF_PAYMENT.get(document.payment_type)


def fetch_links(document: Document):
	"""Fields fetched from a link take the linked record's values, as the save fetches them, like a stock
	entry's purpose from its type; the client sends them empty once the server filled them.
	"""
	for field in document.meta.get_link_fields():
		if document.get(field.fieldname):
			fetch_link_values(document, field)


def fetch_link_values(document: Document, field):
	fetched = [
		df
		for df in document.meta.get_fields_to_fetch(field.fieldname)
		if not df.fetch_if_empty or not document.get(df.fieldname)
	]
	sources = [df.fetch_from.split(".")[-1] for df in fetched]
	values = fetched and frappe.db.get_value(
		field.options, document.get(field.fieldname), sources, as_dict=True
	)
	if not values:
		return

	for df in fetched:
		document.set_fetch_from_value(field.options, df, values)


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


def fill_stock_entry_rows(document: Document):
	"""Stock entry rows take their item's details, as Desk's form asks ERPNext for them once an item is chosen.

	What a row holds stays; a unit other than the stock unit takes its conversion factor.
	"""
	if document.doctype != "Stock Entry":
		return

	for row in document.get("items") or []:
		if not row.item_code or row.conversion_factor:
			continue

		args = frappe._dict(
			item_code=row.item_code,
			warehouse=row.s_warehouse or row.t_warehouse,
			qty=row.qty,
			company=document.company,
		)
		details = document.get_item_details(args)
		if row.uom and row.uom != details.stock_uom:
			details.update(get_uom_details(row.item_code, row.uom, row.qty))
		row.update({key: value for key, value in details.items() if value and not row.get(key)})


@contextmanager
def without_blank_rows(document: Document):
	"""Rows with no item yet sit out ERPNext's fills, which refuse them; Desk never sends them either."""
	rows = document.get("items") or []
	filled = [row for row in rows if row.get("item_code")]
	if len(filled) == len(rows):
		yield
		return

	document.set("items", filled)
	try:
		yield
	finally:
		document.set("items", rows)


def fill_payment_account(document: Document):
	"""An empty cash or bank account of a payment takes its mode of payment's account for the company, as Desk's
	form fills it; a mode without one leaves the account to the user.
	"""
	if document.doctype != "Payment Entry" or not document.mode_of_payment:
		return

	field = "paid_to" if document.payment_type == "Receive" else "paid_from"
	if not document.get(field):
		filters = {"parent": document.mode_of_payment, "company": document.company}
		document.set(field, frappe.db.get_value("Mode of Payment Account", filters, "default_account"))


def reallocate_payment(document: Document, edited: set[str]):
	"""A payment's new amount is allocated to its references again, oldest first, as Desk's form does."""
	if document.doctype != "Payment Entry" or not edited & {"paid_amount", "received_amount"}:
		return

	paid_by_received = document.payment_type == "Pay" and "received_amount" in edited
	amount = document.received_amount if paid_by_received else document.paid_amount
	document.allocate_amount_to_references(flt(amount), True, True)


def allocate_references(document: Document):
	"""A reference with no allocation takes what is left of the payment, up to its outstanding amount, as Desk's
	form allocates a reference just chosen; a payment with no amount takes the references' outstanding amounts.
	The client sends an allocation the server made empty, so it is made again.
	"""
	if document.doctype != "Payment Entry":
		return

	chosen = [
		row for row in document.get("references") or [] if row.reference_name and not row.allocated_amount
	]
	if not chosen:
		return

	receiving = document.payment_type == "Receive"
	currency = document.paid_from_account_currency if receiving else document.paid_to_account_currency
	for row in chosen:
		row.update(
			get_reference_details(
				row.reference_doctype, row.reference_name, currency, document.party_type, document.party
			)
		)
		left = flt(document.unallocated_amount) if document.paid_amount else flt(row.outstanding_amount)
		row.allocated_amount = min(left, flt(row.outstanding_amount))
		document.set_amounts()

	if not document.paid_amount:
		document.paid_amount = sum(flt(row.allocated_amount) for row in document.references)
		document.set_amounts()


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


def fill_untouched(document: Document):
	"""Fill a new document the user has not edited, leaving what ERPNext refuses to its save, as Desk does."""
	try:
		fill(document, set())
	except frappe.ValidationError:
		frappe.clear_last_message()


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
