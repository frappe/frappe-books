import frappe
from frappe.query_builder.functions import IfNull


def execute():
	"""POS sales printed with the one site-wide profile of POS Settings; record it, as a sale now prints with its own."""
	profile = frappe.db.get_single_value("Books Pos Settings", "pos_profile")
	if not profile:
		return
	invoice = frappe.qb.DocType("Books Sales Invoice")
	(
		frappe.qb.update(invoice)
		.set(invoice.pos_profile, profile)
		.where(invoice.is_pos == 1)
		.where(IfNull(invoice.pos_profile, "") == "")
		.run()
	)
