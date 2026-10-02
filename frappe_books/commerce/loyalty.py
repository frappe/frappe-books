"""Loyalty-program validation, accrual, redemption, and expiry."""

from datetime import date
from decimal import ROUND_HALF_UP, Decimal

import frappe
from frappe import _
from frappe.query_builder.functions import Coalesce, Sum
from frappe.utils import add_days, getdate, now_datetime, nowdate

from frappe_books.accounting.money import as_decimal, rounded

ENTRY = "Books Loyalty Point Entry"


def set_available_points(invoice):
	if invoice.transaction_type != "sales" or not (invoice.party and invoice.get("loyalty_program")):
		return
	invoice.available_loyalty_points = get_available_points(invoice.party, invoice.loyalty_program)


def validate_invoice_loyalty(invoice):
	if invoice.transaction_type != "sales" or not invoice.get("loyalty_program"):
		return
	if invoice.redeem_loyalty_points and not invoice.return_against:
		_validate_redemption(invoice)


def _validate_redemption(invoice):
	program = frappe.get_doc("Books Loyalty Program", invoice.loyalty_program)
	_validate_redeemable(program, invoice.date)
	_lock_customer(invoice.party)
	points = int(invoice.loyalty_points or 0)
	available = get_available_points(invoice.party, program.name)
	if points <= 0:
		frappe.throw(_("Points must be greater than 0"))
	if points > available:
		frappe.throw(
			_("Customer {0} has only {1} available loyalty points.").format(invoice.party, available)
		)
	amount = redemption_amount(invoice)
	total_before_redemption = as_decimal(invoice.grand_total) + amount
	if amount > total_before_redemption:
		frappe.throw(_("Loyalty redemption cannot exceed the invoice total."))


def set_return_redemption(invoice, total_before_redemption):
	"""Give a return its share of the points its original invoice redeemed, as negative points."""
	original = frappe.db.get_value(
		invoice.doctype,
		invoice.return_against,
		["redeem_loyalty_points", "loyalty_points", "loyalty_program", "grand_total"],
		as_dict=True,
	)
	if not original:
		return
	invoice.redeem_loyalty_points = original.redeem_loyalty_points
	invoice.loyalty_points = 0
	if not original.redeem_loyalty_points:
		return
	share = abs(as_decimal(total_before_redemption)) / (
		as_decimal(original.grand_total) + redemption_amount(original)
	)
	unrestored = original.loyalty_points - _restored_points(invoice)
	invoice.loyalty_points = -min(int(_whole(original.loyalty_points * share)), unrestored)


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
	_lock_customer(invoice.party)
	program = frappe.get_doc("Books Loyalty Program", invoice.loyalty_program)
	if invoice.return_against:
		_reverse_original_points(invoice)
	elif invoice.redeem_loyalty_points:
		_redeem_points(invoice, program)
	elif _is_active(program, invoice.date):
		_earn_points(invoice, program)
	update_party_points(invoice.party)


def reverse_invoice(invoice):
	if invoice.transaction_type != "sales" or not invoice.get("loyalty_program"):
		return
	_lock_customer(invoice.party)
	frappe.db.delete(ENTRY, {"invoice": invoice.name})
	_validate_balance(invoice.party, invoice.loyalty_program)
	if invoice.redeem_loyalty_points and not invoice.return_against:
		_update_program_usage(invoice.loyalty_program, -1)
	update_party_points(invoice.party)


def get_available_points(customer, loyalty_program=None, on_date=None):
	entry = frappe.qb.DocType(ENTRY)
	query = (
		frappe.qb.from_(entry)
		.select(Sum(entry.loyalty_points))
		.where(entry.customer == customer)
		.where(_is_live(entry, on_date))
	)
	if loyalty_program:
		query = query.where(entry.loyalty_program == loyalty_program)
	return int(query.run()[0][0] or 0)


def update_party_points(customer):
	frappe.db.set_value("Books Party", customer, "loyalty_points", get_available_points(customer))


def program_status(program):
	"""Expired after its last day, Maxed at its use limit, else Active while enabled."""
	if getdate(program.to_date) < getdate(nowdate()):
		return "Expired"
	if program.maximum_use and program.used >= program.maximum_use:
		return "Maxed"
	return "Active" if program.is_enabled else "Disabled"


def expire_programs_and_points():
	frappe.db.set_value(
		"Books Loyalty Program",
		{"status": ["!=", "Expired"], "to_date": ["<", getdate(nowdate())]},
		{"is_enabled": 0, "status": "Expired"},
	)
	party = frappe.qb.DocType("Books Party")
	entry = frappe.qb.DocType(ENTRY)
	points = Coalesce(
		frappe.qb.from_(entry)
		.select(Sum(entry.loyalty_points))
		.where(entry.customer == party.name)
		.where(_is_live(entry)),
		0,
	)
	(
		frappe.qb.update(party)
		.set(party.loyalty_points, points)
		.set(party.modified, now_datetime())
		.where(party.loyalty_points != points)
		.run()
	)


def _earn_points(invoice, program):
	tier = _tier_for_total(program, invoice.grand_total)
	if not tier:
		return
	points = _whole(_whole(abs(as_decimal(invoice.grand_total))) * as_decimal(tier.collection_factor))
	duration = program.expiry_duration
	expiry_date = add_days(getdate(invoice.date), duration) if duration else None
	_insert_entry(invoice, int(points), expiry_date, tier.tier_name)


def _redeem_points(invoice, program):
	"""Take redeemed points from the soonest-expiring earned points first."""
	points = int(invoice.loyalty_points)
	for expiry_date, available in _live_balances(invoice.party, program.name):
		used = min(points, available)
		_insert_entry(invoice, -used, expiry_date)
		points -= used
		if not points:
			break
	if points:
		frappe.throw(_("Customer {0} does not have enough loyalty points.").format(invoice.party))
	_update_program_usage(program.name, 1)


def _reverse_original_points(invoice):
	if invoice.redeem_loyalty_points:
		_restore_points(invoice)
	else:
		_take_back_points(invoice)


def _restore_points(invoice):
	"""Put returned points back into the expiry dates the original redemption drew from."""
	points = -int(invoice.loyalty_points)
	for expiry_date, redeemed in _unrestored_redemptions(invoice):
		restored = min(points, redeemed)
		_insert_entry(invoice, restored, expiry_date)
		points -= restored
		if not points:
			break
	if points:
		frappe.throw(
			_("Invoice {0} did not redeem the points being returned.").format(invoice.return_against)
		)


def _unrestored_redemptions(invoice):
	"""Return (expiry date, points) the original redeemed and no return gave back, latest expiry first."""
	entry = frappe.qb.DocType(ENTRY)
	rows = (
		frappe.qb.from_(entry)
		.select(entry.expiry_date, Sum(entry.loyalty_points))
		.where(entry.invoice.isin([invoice.return_against, *_other_returns(invoice, pluck="name")]))
		.groupby(entry.expiry_date)
		.run()
	)
	redeemed = [(expiry_date, -int(points)) for expiry_date, points in rows if points < 0]
	return sorted(redeemed, key=lambda row: (row[0] is None, row[0] or date.min), reverse=True)


def _take_back_points(invoice):
	"""Take back the returned share of the points the original invoice earned."""
	earned = frappe.db.get_value(
		ENTRY,
		{"invoice": invoice.return_against, "loyalty_points": [">", 0]},
		["loyalty_points", "expiry_date"],
		as_dict=True,
	)
	original_total = frappe.db.get_value("Books Sales Invoice", invoice.return_against, "grand_total")
	if not earned or not original_total:
		return
	ratio = min(Decimal(1), abs(as_decimal(invoice.grand_total) / as_decimal(original_total)))
	taken_back = -_returned_points(invoice)
	points = min(int(_whole(as_decimal(earned.loyalty_points) * ratio)), earned.loyalty_points - taken_back)
	if points:
		_insert_entry(invoice, -points, earned.expiry_date)
		_validate_balance(invoice.party, invoice.loyalty_program)


def _other_returns(invoice, **query):
	"""Query the other submitted returns against the same original invoice."""
	filters = {"return_against": invoice.return_against, "docstatus": 1}
	if invoice.name:
		filters["name"] = ["!=", invoice.name]
	return frappe.get_all(invoice.doctype, filters=filters, **query)


def _restored_points(invoice):
	rows = _other_returns(invoice, fields=[{"SUM": "loyalty_points", "as": "points"}])
	return -int(rows[0].points or 0)


def _returned_points(invoice):
	returns = _other_returns(invoice, pluck="name")
	if not returns:
		return 0
	rows = frappe.get_all(
		ENTRY, filters={"invoice": ["in", returns]}, fields=[{"SUM": "loyalty_points", "as": "points"}]
	)
	return int(rows[0].points or 0)


def _insert_entry(invoice, points, expiry_date, tier=None):
	frappe.get_doc(
		{
			"doctype": ENTRY,
			"loyalty_program": invoice.loyalty_program,
			"loyalty_program_tier": tier,
			"customer": invoice.party,
			"invoice": invoice.name,
			"loyalty_points": points,
			"purchase_amount": invoice.grand_total,
			"expiry_date": expiry_date,
			"posting_date": getdate(invoice.date),
		}
	).insert(ignore_permissions=True)


def _live_balances(customer, loyalty_program):
	"""Return (expiry date, points) for live points, soonest expiry first."""
	entry = frappe.qb.DocType(ENTRY)
	rows = (
		frappe.qb.from_(entry)
		.select(entry.expiry_date, Sum(entry.loyalty_points))
		.where(entry.customer == customer)
		.where(entry.loyalty_program == loyalty_program)
		.where(_is_live(entry))
		.groupby(entry.expiry_date)
		.run()
	)
	balances = [(expiry_date, int(points)) for expiry_date, points in rows if points > 0]
	return sorted(balances, key=lambda row: (row[0] is None, row[0] or date.min))


def _validate_balance(customer, loyalty_program):
	if get_available_points(customer, loyalty_program) < 0:
		frappe.throw(_("Customer {0} has already redeemed these loyalty points.").format(customer))


def _is_live(entry, on_date=None):
	return entry.expiry_date.isnull() | (entry.expiry_date >= getdate(on_date or nowdate()))


def _lock_customer(customer):
	frappe.db.get_value("Books Party", customer, "name", for_update=True)


def _whole(value):
	return as_decimal(value).quantize(Decimal("1"), rounding=ROUND_HALF_UP)


def _tier_for_total(program, total):
	eligible = [
		row
		for row in program.collection_rules
		if as_decimal(row.minimum_total_spent) <= abs(as_decimal(total))
	]
	return max(eligible, key=lambda row: as_decimal(row.minimum_total_spent), default=None)


def _is_active(program, on_date):
	on_date = getdate(on_date)
	return bool(program.is_enabled) and getdate(program.from_date) <= on_date <= getdate(program.to_date)


def _validate_redeemable(program, on_date):
	if not program.is_enabled:
		frappe.throw(_("Loyalty program {0} is disabled.").format(program.name))
	if not _is_active(program, on_date):
		frappe.throw(_("Loyalty program {0} is not active on the invoice date.").format(program.name))
	if program.maximum_use and program.used >= program.maximum_use:
		frappe.throw(_("Loyalty program {0} has reached its usage limit.").format(program.name))


def _update_program_usage(program_name, delta):
	program = frappe.db.get_value(
		"Books Loyalty Program",
		program_name,
		["used", "maximum_use", "is_enabled", "to_date"],
		as_dict=True,
		for_update=True,
	)
	program.used += delta
	if program.used < 0 or (delta > 0 and program.maximum_use and program.used > program.maximum_use):
		frappe.throw(_("Loyalty program {0} usage is out of range.").format(program_name))
	if delta > 0 and program.maximum_use and program.used == program.maximum_use:
		program.is_enabled = 0
	values = {"used": program.used, "is_enabled": program.is_enabled, "status": program_status(program)}
	frappe.db.set_value("Books Loyalty Program", program_name, values)
