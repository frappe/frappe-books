from collections import defaultdict

import frappe
from frappe.query_builder import Case
from frappe.query_builder.functions import IfNull


def execute():
	"""Fill the status and profile of existing POS shifts, and the cashier and profile of their closings."""
	_set_shift_statuses()
	_set_shift_profiles()
	_set_closing_details()


def _set_shift_statuses():
	"""Store the status `status.get_status` gives a POS shift."""
	opening = frappe.qb.DocType("Books Pos Opening Shift")
	closing = frappe.qb.DocType("Books Pos Closing Shift")
	closed = frappe.qb.from_(closing).select(closing.opening_shift).where(closing.docstatus == 1)
	status = (
		Case()
		.when(opening.docstatus == 0, "Saved")
		.when(opening.docstatus == 2, "Cancelled")
		.when(opening.name.isin(closed), "Closed")
		.else_("Open")
	)
	frappe.qb.update(opening).set(opening.status, status).run()


def _set_shift_profiles():
	"""Shifts sold with the one site-wide profile of POS Settings."""
	profile = frappe.db.get_single_value("Books Pos Settings", "pos_profile")
	if not profile:
		return
	opening = frappe.qb.DocType("Books Pos Opening Shift")
	(
		frappe.qb.update(opening)
		.set(opening.pos_profile, profile)
		.where(IfNull(opening.pos_profile, "") == "")
		.run()
	)


def _set_closing_details():
	"""A closing shows the cashier and profile of the shift it closes; one update per cashier and profile."""
	closing = frappe.qb.DocType("Books Pos Closing Shift")
	opening = frappe.qb.DocType("Books Pos Opening Shift")
	rows = (
		frappe.qb.from_(closing)
		.join(opening)
		.on(opening.name == closing.opening_shift)
		.select(closing.name, opening.owner, opening.pos_profile)
		.where(IfNull(closing.cashier, "") == "")
	).run()
	closings = defaultdict(list)
	for name, cashier, profile in rows:
		closings[(cashier, profile)].append(name)
	for (cashier, profile), names in closings.items():
		frappe.db.set_value(
			"Books Pos Closing Shift",
			{"name": ["in", names]},
			{"cashier": cashier, "pos_profile": profile},
			update_modified=False,
		)
