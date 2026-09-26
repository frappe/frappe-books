"""Loyalty-program validation, accrual, redemption, and expiry."""

from decimal import ROUND_HALF_UP, Decimal

import frappe
from frappe import _
from frappe.utils import add_days, getdate, nowdate

from frappe_books.accounting.money import as_decimal, rounded


def validate_program(program):
	if getdate(program.from_date) > getdate(program.to_date):
		frappe.throw(_("Loyalty program start date must be on or before its end date."))
	if program.maximum_use < 0 or program.used < 0:
		frappe.throw(_("Loyalty-program usage counts cannot be negative."))
	if program.maximum_use and program.used > program.maximum_use:
		frappe.throw(_("Loyalty-program usage cannot exceed its maximum."))
	if as_decimal(program.conversion_factor) < 0:
		frappe.throw(_("Loyalty conversion factor cannot be negative."))
	minimums = [as_decimal(row.minimum_total_spent) for row in program.collection_rules]
	if len(minimums) != len(set(minimums)):
		frappe.throw(_("Each loyalty tier must have a unique minimum spend."))
	for row in program.collection_rules:
		if as_decimal(row.collection_factor) < 0 or as_decimal(row.minimum_total_spent) < 0:
			frappe.throw(_("Loyalty tier values cannot be negative."))


def validate_invoice_loyalty(invoice):
	if invoice.transaction_type != "sales" or not invoice.get("loyalty_program"):
		return
	program = frappe.get_doc("Books Loyalty Program", invoice.loyalty_program)
	_validate_active(program, invoice.date)
	available = get_available_points(invoice.party, program.name)
	invoice.available_loyalty_points = available
	if invoice.redeem_loyalty_points:
		points = int(invoice.loyalty_points or 0)
		if points <= 0:
			frappe.throw(_("Loyalty points to redeem must be greater than zero."))
		if points > available:
			frappe.throw(
				_("Customer {0} has only {1} available loyalty points.").format(invoice.party, available)
			)
		amount = rounded(as_decimal(points) * as_decimal(program.conversion_factor))
		if amount > as_decimal(invoice.grand_total):
			frappe.throw(_("Loyalty redemption cannot exceed the invoice total."))


def redemption_amount(invoice):
	if not invoice.get("redeem_loyalty_points") or not invoice.get("loyalty_program"):
		return as_decimal(0)
	conversion = frappe.db.get_value("Books Loyalty Program", invoice.loyalty_program, "conversion_factor")
	return rounded(as_decimal(invoice.loyalty_points) * as_decimal(conversion))


def loyalty_expense_account(invoice):
	if not invoice.get("loyalty_program"):
		return None
	return frappe.db.get_value("Books Loyalty Program", invoice.loyalty_program, "expense_account")


def process_invoice(invoice):
	if invoice.transaction_type != "sales" or not invoice.get("loyalty_program"):
		return
	program = frappe.get_doc("Books Loyalty Program", invoice.loyalty_program)
	points, tier = _points_for_invoice(invoice, program)
	if points:
		frappe.get_doc(
			{
				"doctype": "Books Loyalty Point Entry",
				"loyalty_program": program.name,
				"loyalty_program_tier": tier,
				"customer": invoice.party,
				"invoice": invoice.name,
				"loyalty_points": points,
				"purchase_amount": invoice.grand_total,
				"expiry_date": add_days(getdate(invoice.date), program.expiry_duration or 0),
				"posting_date": getdate(invoice.date),
			}
		).insert(ignore_permissions=True)
	if invoice.redeem_loyalty_points:
		_update_program_usage(program, 1)
	update_party_points(invoice.party)


def reverse_invoice(invoice):
	if invoice.transaction_type != "sales" or not invoice.get("loyalty_program"):
		return
	frappe.db.delete("Books Loyalty Point Entry", {"invoice": invoice.name})
	if invoice.redeem_loyalty_points:
		program = frappe.get_doc("Books Loyalty Program", invoice.loyalty_program)
		_update_program_usage(program, -1)
	update_party_points(invoice.party)


def get_available_points(customer, loyalty_program=None, on_date=None):
	filters = {"customer": customer}
	if loyalty_program:
		filters["loyalty_program"] = loyalty_program
	on_date = getdate(on_date or nowdate())
	entries = frappe.get_all(
		"Books Loyalty Point Entry",
		filters=filters,
		fields=["loyalty_points", "expiry_date"],
	)
	return sum(
		int(entry.loyalty_points or 0)
		for entry in entries
		if not entry.expiry_date or getdate(entry.expiry_date) >= on_date
	)


def update_party_points(customer):
	frappe.db.set_value("Books Party", customer, "loyalty_points", max(0, get_available_points(customer)))


def expire_programs_and_points():
	today = getdate(nowdate())
	for name in frappe.get_all(
		"Books Loyalty Program", filters={"is_enabled": 1, "to_date": ["<", today]}, pluck="name"
	):
		frappe.db.set_value("Books Loyalty Program", name, "is_enabled", 0)
	customers = frappe.get_all("Books Loyalty Point Entry", distinct=True, pluck="customer")
	for customer in customers:
		update_party_points(customer)


def _points_for_invoice(invoice, program):
	if invoice.redeem_loyalty_points:
		return -int(invoice.loyalty_points or 0), None
	if invoice.get("return_against"):
		original_points = frappe.db.get_value(
			"Books Loyalty Point Entry",
			{"invoice": invoice.return_against, "loyalty_points": [">", 0]},
			"loyalty_points",
		)
		original_total = frappe.db.get_value("Books Sales Invoice", invoice.return_against, "grand_total")
		if not original_points or not original_total:
			return 0, None
		ratio = min(Decimal("1"), abs(as_decimal(invoice.grand_total) / as_decimal(original_total)))
		return -int(
			(as_decimal(original_points) * ratio).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
		), None
	tier = _tier_for_total(program, invoice.grand_total)
	if not tier:
		return 0, None
	points = (
		abs(as_decimal(invoice.grand_total)).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
		* as_decimal(tier.collection_factor)
	).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
	return int(points), tier.tier_name


def _tier_for_total(program, total):
	eligible = [
		row
		for row in program.collection_rules
		if as_decimal(row.minimum_total_spent) <= abs(as_decimal(total))
	]
	return max(eligible, key=lambda row: as_decimal(row.minimum_total_spent), default=None)


def _validate_active(program, date):
	date = getdate(date)
	if not program.is_enabled:
		frappe.throw(_("Loyalty program {0} is disabled.").format(program.name))
	if date < getdate(program.from_date) or date > getdate(program.to_date):
		frappe.throw(_("Loyalty program {0} is not active on the invoice date.").format(program.name))
	if program.maximum_use and program.used >= program.maximum_use:
		frappe.throw(_("Loyalty program {0} has reached its usage limit.").format(program.name))


def _update_program_usage(program, delta):
	used = max(0, int(program.used or 0) + delta)
	values = {"used": used}
	if program.maximum_use:
		values["is_enabled"] = int(used < program.maximum_use)
	frappe.db.set_value("Books Loyalty Program", program.name, values)
