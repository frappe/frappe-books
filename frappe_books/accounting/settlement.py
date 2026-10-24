import frappe

from frappe_books.accounting.money import as_decimal, rounded
from frappe_books.status import store_status


def open_balance(invoice):
	"""Make the invoice owe its whole total less redeemed loyalty points; a submitted return owes it
	back, as a negative amount.

	A draft shows its total as positive, as the Books app does.
	"""
	total = abs(as_decimal(invoice.base_grand_total)) - abs(as_decimal(invoice.get("loyalty_amount")))
	invoice.outstanding_amount = signed(invoice, total) if invoice.docstatus == 1 else total


def settle(invoice, amount, reverse=False):
	"""Apply a payment's allocation to a submitted invoice, or take it back, and store its status."""
	settled = -signed(invoice, amount) if reverse else signed(invoice, amount)
	invoice.outstanding_amount = rounded(as_decimal(invoice.outstanding_amount) - settled)
	frappe.db.set_value(
		invoice.doctype, invoice.name, "outstanding_amount", invoice.outstanding_amount, update_modified=False
	)
	store_status(invoice)


def reload_balance(invoice):
	"""Read back what payments settled since the invoice was loaded."""
	invoice.outstanding_amount = invoice.db_get("outstanding_amount")


def clear_balance(invoice):
	"""A cancelled invoice owes nothing."""
	invoice.outstanding_amount = 0


def due(invoice):
	"""Return what is still to pay, or to refund on a return, as a positive amount."""
	return abs(as_decimal(invoice.outstanding_amount))


def signed(invoice, amount):
	"""Return an amount as it counts on the invoice's outstanding amount: negative on a return."""
	amount = as_decimal(amount)
	return -amount if invoice.get("return_against") else amount


PARTY_INVOICES = {
	"Books Customer": ("Books Sales Invoice", "customer"),
	"Books Supplier": ("Books Purchase Invoice", "supplier"),
}


def refresh_party(party_type, party):
	"""Store what the customer or supplier owes on its invoices."""
	if not party:
		return
	doctype, party_field = PARTY_INVOICES[party_type]
	rows = frappe.get_all(
		doctype,
		filters={party_field: party, "docstatus": 1},
		fields=[{"SUM": "outstanding_amount", "as": "total"}],
	)
	frappe.db.set_value(party_type, party, "outstanding_amount", rounded(as_decimal(rows[0].total)))
