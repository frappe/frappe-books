"""Point-of-sale shift state, reconciliation amounts, and cash journals."""

from collections import defaultdict

import frappe
from frappe import _
from frappe.query_builder import Order
from frappe.utils import get_datetime, getdate

from frappe_books.accounting.money import as_decimal, rounded


def open_shift_name(user=None):
	"""Return the user's submitted opening shift that has no submitted closing shift."""
	return _open_shift(user or frappe.session.user)


def any_open_shift():
	"""Return an open shift of any user."""
	return _open_shift()


def _open_shift(user=None):
	opening = frappe.qb.DocType("Books Pos Opening Shift")
	closing = frappe.qb.DocType("Books Pos Closing Shift")
	query = (
		frappe.qb.from_(opening)
		.left_join(closing)
		.on((closing.opening_shift == opening.name) & (closing.docstatus == 1))
		.select(opening.name)
		.where((opening.docstatus == 1) & closing.name.isnull())
		.orderby(opening.opening_date, order=Order.desc)
		.limit(1)
	)
	if user:
		query = query.where(opening.owner == user)
	names = query.run(pluck=True)
	return names[0] if names else None


def pos_profile():
	"""Return the POS profile of the user's open shift, else that of POS Settings."""
	shift = open_shift_name()
	profile = shift and frappe.db.get_value("Books Pos Opening Shift", shift, "pos_profile")
	return profile or frappe.db.get_single_value("Books Pos Settings", "pos_profile")


def pos_customer():
	"""Return the customer of the POS profile in use, else the Books Defaults POS customer."""
	profile = pos_profile()
	customer = profile and frappe.db.get_value("Books Pos Profile", profile, "pos_customer")
	return customer or frappe.db.get_single_value("Books Defaults", "pos_customer")


def counter_cash_account():
	"""Return the account that POS cash goes through until the shift closes."""
	account = frappe.db.get_single_value("Books Pos Settings", "cash_account")
	if not account:
		frappe.throw(_("POS Counter Cash Account is not set. Please set it on POS Settings"))
	return account


def is_cash_method(payment_method):
	"""Cash-type methods go through the counter, which the POS shift counts and reconciles."""
	return frappe.get_cached_value("Books Payment Method", payment_method, "type") == "Cash"


def takes_counter_cash(invoices, payment_method, user=None):
	"""Cash for POS invoices goes through the counter while the payer has an open shift, which closing it reconciles."""
	return (
		any(invoice.get("is_pos") for invoice in invoices)
		and bool(payment_method)
		and is_cash_method(payment_method)
		and bool(open_shift_name(user))
	)


def counter_payment_amounts(rows, due):
	"""Return each tendered row with the amount it pays. Cash beyond what is due is change."""
	amounts = []
	for row in rows:
		tendered = as_decimal(row.amount)
		if tendered <= 0:
			frappe.throw(_("Please enter an amount greater than zero."))
		if tendered > due and not is_cash_method(row.payment_method):
			frappe.throw(_("Non-cash payment amount cannot exceed the outstanding amount."))
		paid = min(tendered, due)
		due -= paid
		amounts.append((row, paid))
	return [(row, paid) for row, paid in amounts if paid]


def lock_pos_settings():
	"""Lock POS Settings so shift state changes run one at a time."""
	settings = frappe.get_doc("Books Pos Settings", for_update=True)
	if not settings.cash_account:
		frappe.throw(_("POS Counter Cash Account is not set. Please set it on POS Settings"))
	return settings


def transacted_amounts(from_date, to_date, user):
	"""Sum the user's submitted POS payments made from `from_date` to `to_date`, by payment method; refunds count against."""
	payment = frappe.qb.DocType("Books Payment")
	payments = (
		frappe.qb.from_(payment)
		.select(payment.payment_method, payment.payment_type, payment.amount_paid)
		.where(
			(payment.docstatus == 1)
			& (payment.owner == user)
			& payment.creation[get_datetime(from_date) : get_datetime(to_date)]
			& payment.name.isin(_pos_payment_names())
		)
	).run(as_dict=True)
	result = defaultdict(as_decimal)
	for row in payments:
		sign = -1 if row.payment_type == "Pay" else 1
		result[row.payment_method] += sign * as_decimal(row.amount_paid)
	return {method: rounded(amount) for method, amount in result.items()}


def validate_cash_rows(rows):
	for row in rows:
		if as_decimal(row.denomination) <= 0 or int(row.count or 0) < 0:
			frappe.throw(_("Cash denominations must be positive and counts cannot be negative."))


def cash_total(rows):
	return rounded(sum((as_decimal(row.denomination) * int(row.count or 0) for row in rows), as_decimal(0)))


def cash_account():
	if not frappe.db.exists("Books Account", "Cash"):
		frappe.throw(_("The standard Cash account is required for POS shifts."))
	return "Cash"


def make_cash_journal(posting_date, rows, remark):
	"""Submit a cash journal of the rows' non-zero net per account, as the counter can be the cash account."""
	net = defaultdict(as_decimal)
	for account, debit, credit in rows:
		net[account] += as_decimal(debit) - as_decimal(credit)
	accounts = [
		{"account": account, "debit": rounded(max(amount, 0)), "credit": rounded(max(-amount, 0))}
		for account, amount in net.items()
		if rounded(amount)
	]
	if not accounts:
		return None
	journal = frappe.get_doc(
		{
			"doctype": "Books Journal Entry",
			"entry_type": "Cash Entry",
			"posting_date": getdate(posting_date),
			"user_remark": remark,
			"accounts": accounts,
		}
	).insert(ignore_permissions=True)
	journal.submit()
	return journal.name


def cancel_cash_journal(name):
	if not name:
		return
	journal = frappe.get_doc("Books Journal Entry", name)
	journal.flags.ignore_permissions = True
	journal.cancel()


def _pos_payment_names():
	"""A subquery of the payments that settle POS invoices."""
	reference = frappe.qb.DocType("Books Payment For")
	invoice = frappe.qb.DocType("Books Sales Invoice")
	return (
		frappe.qb.from_(reference)
		.join(invoice)
		.on(reference.reference_name == invoice.name)
		.select(reference.parent)
		.where(
			(reference.parenttype == "Books Payment")
			& (reference.reference_type == "Books Sales Invoice")
			& (invoice.is_pos == 1)
		)
	)
