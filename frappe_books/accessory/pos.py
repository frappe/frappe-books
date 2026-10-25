"""POS in accessory mode: ERPNext POS Profiles, POS Opening and Closing Entries, and POS invoices."""

import frappe
from erpnext.accounts.doctype.payment_entry.payment_entry import get_payment_entry
from erpnext.accounts.doctype.pos_closing_entry.pos_closing_entry import make_closing_entry_from_opening
from erpnext.accounts.doctype.sales_invoice.services.pos import get_bank_cash_account
from erpnext.selling.page.point_of_sale.point_of_sale import check_opening_entry
from frappe import _
from frappe.utils import flt, getdate, now_datetime, nowdate

from frappe_books.accessory.ui_settings import check_ui_settings_access
from frappe_books.accounting.money import as_decimal, sum_decimal
from frappe_books.commerce.pos import counter_payment_amounts

# Books' POS screen preferences, by the single that holds them
POS_SETTINGS_FIELDS = (
	"pos_ui",
	"item_visibility",
	"weight_enabled_barcode",
	"check_digits",
	"item_code_digits",
	"item_weight_digits",
)
DEFAULTS_FIELDS = tuple(f"{action}_button_colour" for action in ("save", "cancel", "held", "return", "pay"))
# What a POS Closing Entry takes from the one ERPNext makes from its opening entry
CLOSING_FIELDS = (
	"period_start_date",
	"period_end_date",
	"pos_profile",
	"user",
	"company",
	"grand_total",
	"net_total",
	"total_quantity",
	"total_taxes_and_charges",
	"pos_invoices",
	"sales_invoices",
	"taxes",
)


@frappe.whitelist()
def get_pos_preferences() -> dict:
	"""Books' POS screen preferences, which every accessory mode user reads, whatever their ERPNext roles."""
	check_ui_settings_access()
	settings = frappe.get_cached_doc("Books POS Settings")
	defaults = frappe.get_cached_doc("Books Defaults")
	return {
		**{field: settings.get(field) for field in POS_SETTINGS_FIELDS},
		**{field: defaults.get(field) for field in DEFAULTS_FIELDS},
		"pos_cash_denominations": [row.denomination for row in defaults.pos_cash_denominations],
	}


@frappe.whitelist()
def get_selling_rates(pos_profile: str) -> dict[str, float]:
	"""Each item's selling rate today in the POS Profile's price list, as ERPNext's POS lists items.

	The profile entitles its cashiers to its prices, as in ERPNext's POS, so they need no Item Price rights.
	"""
	frappe.has_permission("POS Profile", doc=pos_profile, throw=True)
	price_list = frappe.db.get_value("POS Profile", pos_profile, "selling_price_list")
	if not price_list:
		return {}

	price = frappe.qb.DocType("Item Price")
	today = nowdate()
	rows = (
		frappe.qb.from_(price)
		.select(price.item_code, price.price_list_rate, price.valid_from)
		.where(
			(price.price_list == price_list)
			& (price.selling == 1)
			& (price.valid_from.isnull() | (price.valid_from <= today))
			& (price.valid_upto.isnull() | (price.valid_upto >= today))
		)
		.run(as_dict=True)
	)
	# A dated price wins over an undated one, the latest start over earlier ones.
	rows.sort(key=lambda row: (row.valid_from is not None, row.valid_from or getdate(today)))
	return {row.item_code: row.price_list_rate for row in rows}


@frappe.whitelist(methods=["POST"])
def pay_pos_invoice(invoice: str, payments: list[dict]) -> list[str]:
	"""Pay a submitted POS invoice at the counter with ERPNext Payment Entries and return their names."""
	doc = frappe.get_doc("Sales Invoice", invoice)
	doc.check_permission("read")
	if not (doc.is_pos and doc.docstatus == 1):
		frappe.throw(_("Only submitted POS invoices can be paid at the counter."))
	tenders = [frappe._dict(row) for row in payments]
	validate_profile_modes(doc.pos_profile, tenders)
	due = abs(as_decimal(doc.outstanding_amount))
	amounts = counter_payment_amounts(tenders, due, is_cash=is_cash_mode)
	validate_full_payment(doc, sum_decimal(paid for _tender, paid in amounts), due)
	return [make_payment(doc, tender, paid) for tender, paid in amounts]


def validate_full_payment(invoice, paid, due):
	"""The tenders together pay what is due unless the POS Profile allows partial payments, as ERPNext's checkout."""
	if invoice.is_return or paid >= due:
		return
	if not frappe.db.get_value("POS Profile", invoice.pos_profile, "allow_partial_payment"):
		frappe.throw(_("Partial Payment in POS Transactions are not allowed."))


def validate_profile_modes(pos_profile: str, tenders: list):
	"""A POS invoice is paid only by the modes of its POS Profile, as ERPNext's POS offers them."""
	modes = {row.mode_of_payment for row in frappe.get_cached_doc("POS Profile", pos_profile).payments}
	for tender in tenders:
		if tender.mode_of_payment not in modes:
			frappe.throw(_("POS Profile {0} does not take {1}.").format(pos_profile, tender.mode_of_payment))


def is_cash_mode(mode_of_payment: str) -> bool:
	return frappe.get_cached_value("Mode of Payment", mode_of_payment, "type") == "Cash"


def make_payment(invoice, tender, paid) -> str:
	"""A submitted Payment Entry of `paid` of the tender against the invoice; a return's pays it back."""
	sign = -1 if flt(invoice.outstanding_amount) < 0 else 1
	entry = get_payment_entry(
		"Sales Invoice",
		invoice.name,
		party_amount=sign * flt(paid),
		reference_date=tender.clearance_date,
	)
	entry.mode_of_payment = tender.mode_of_payment
	entry.paid_to = get_bank_cash_account(tender.mode_of_payment, invoice.company)["account"]
	entry.reference_no = tender.reference_no
	entry.reference_date = getdate(tender.clearance_date)
	entry.insert()
	entry.submit()
	return entry.name


def fill_opening_entry(entry, edited: set[str]):
	"""Fill a draft POS Opening Entry as Desk's form does.

	It opens now for the user; a new POS Profile lists one row per mode of payment.
	"""
	entry.user = entry.user or frappe.session.user
	entry.period_start_date = entry.period_start_date or now_datetime()
	if entry.pos_profile and "pos_profile" in edited:
		profile = frappe.get_doc("POS Profile", entry.pos_profile)
		profile.check_permission("read")
		modes = [{"mode_of_payment": row.mode_of_payment, "opening_amount": 0} for row in profile.payments]
		entry.set("balance_details", modes)


def fill_closing_entry(entry, edited: set[str]):
	"""Fill a draft POS Closing Entry from its opening entry as Desk's form does.

	Without an opening entry it closes the user's open shift. It takes the
	shift's invoices, taxes and totals, which each preview reads afresh; a new
	opening entry lists, per mode of payment, the opening amount plus the
	payments as expected, where the counted amount starts.
	"""
	entry.pos_opening_entry = entry.pos_opening_entry or get_open_shift(entry.company)
	if not entry.pos_opening_entry:
		return

	opening = frappe.get_doc("POS Opening Entry", entry.pos_opening_entry)
	opening.check_permission("read")
	closing = make_closing_entry_from_opening(opening)
	entry.update({field: closing.get(field) for field in CLOSING_FIELDS})
	if "pos_opening_entry" in edited or not entry.payment_reconciliation:
		entry.set("payment_reconciliation", get_closing_amounts(opening, closing))


def get_open_shift(company: str) -> str | None:
	"""The user's latest open POS Opening Entry in the company, as ERPNext's POS finds it."""
	return next(
		(shift.name for shift in check_opening_entry(frappe.session.user) if shift.company == company), None
	)


def get_closing_amounts(opening, closing) -> list[dict]:
	"""Per mode of payment, the opening amount and that plus the shift's payments as expected and counted."""
	paid = {row.mode_of_payment: flt(row.expected_amount) for row in closing.payment_reconciliation}
	rows = [
		(
			row.mode_of_payment,
			flt(row.opening_amount),
			flt(row.opening_amount) + paid.pop(row.mode_of_payment, 0),
		)
		for row in opening.balance_details
	]
	rows += [(mode, 0, amount) for mode, amount in paid.items()]
	return [
		{
			"mode_of_payment": mode,
			"opening_amount": opening_amount,
			"expected_amount": expected,
			"closing_amount": expected,
			"difference": 0,
		}
		for mode, opening_amount, expected in rows
	]


def get_tendered_payments(invoice) -> list[dict]:
	"""A POS invoice's payment rows the cashier filled in."""
	if not invoice.get("is_pos"):
		return []
	return [row.as_dict() for row in invoice.get("payments") or [] if flt(row.amount)]


def restore_tendered_payments(invoice, tendered: list[dict]):
	"""Put the tendered amounts back on the rows of their modes, which the POS Profile's modes replaced."""
	rows = {row.mode_of_payment: row for row in invoice.get("payments") or []}
	for tender in tendered:
		row = rows.get(tender.mode_of_payment) or invoice.append(
			"payments", {"mode_of_payment": tender.mode_of_payment}
		)
		row.update({field: tender.get(field) for field in ("amount", "reference_no", "clearance_date")})
