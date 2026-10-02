"""Point-of-sale shift state, reconciliation amounts, and cash journals."""

from collections import defaultdict

import frappe
from frappe import _
from frappe.query_builder import Order
from frappe.utils import getdate

from frappe_books.accounting.money import as_decimal, rounded


def open_shift_name():
	"""Return the submitted opening shift that has no submitted closing shift."""
	opening = frappe.qb.DocType("Books Pos Opening Shift")
	closing = frappe.qb.DocType("Books Pos Closing Shift")
	names = (
		frappe.qb.from_(opening)
		.left_join(closing)
		.on((closing.opening_shift == opening.name) & (closing.docstatus == 1))
		.select(opening.name)
		.where((opening.docstatus == 1) & closing.name.isnull())
		.orderby(opening.opening_date, order=Order.desc)
		.limit(1)
	).run(pluck=True)
	return names[0] if names else None


def pos_customer():
	"""Return the customer of the POS profile in use, else the Books Defaults POS customer."""
	profile = frappe.db.get_single_value("Books Pos Settings", "pos_profile")
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


def counter_payment_account(payment_method):
	"""Cash goes through the counter; other methods use their own account."""
	if is_cash_method(payment_method):
		return counter_cash_account()
	return frappe.get_cached_value("Books Payment Method", payment_method, "account")


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


def transacted_amounts(from_date, to_date):
	invoices = frappe.get_all(
		"Books Sales Invoice",
		filters={"is_pos": 1, "docstatus": 1, "date": ["between", [from_date, to_date]]},
		fields=["name", "return_against"],
	)
	if not invoices:
		return {}
	references = frappe.get_all(
		"Books Payment For",
		filters={
			"parenttype": "Books Payment",
			"reference_type": "Books Sales Invoice",
			"reference_name": ["in", [invoice.name for invoice in invoices]],
		},
		fields=["parent", "reference_name", "amount"],
	)
	methods = _submitted_payment_methods({reference.parent for reference in references})
	returns = {invoice.name for invoice in invoices if invoice.return_against}
	result = defaultdict(as_decimal)
	for reference in references:
		method = methods.get(reference.parent)
		if not method:
			continue
		sign = -1 if reference.reference_name in returns else 1
		result[method] += sign * as_decimal(reference.amount)
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


def _submitted_payment_methods(names):
	if not names:
		return {}
	return dict(
		frappe.get_all(
			"Books Payment",
			filters={"name": ["in", sorted(names)], "docstatus": 1},
			fields=["name", "payment_method"],
			as_list=True,
		)
	)
