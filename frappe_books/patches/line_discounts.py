"""Preserve per-unit discounts as line discounts during upgrade."""

import frappe

from frappe_books.accounting.money import as_decimal


def execute():
	"""Preserve existing invoice values when flat discounts become line amounts."""
	for doctype in ("Books Sales Invoice Item", "Books Purchase Invoice Item", "Books Sales Quote Item"):
		rows = frappe.get_all(
			doctype,
			filters={"set_item_discount_amount": 1},
			fields=["name", "quantity", "item_discount_amount"],
		)
		for row in rows:
			amount = as_decimal(row.item_discount_amount) * abs(as_decimal(row.quantity))
			frappe.db.set_value(doctype, row.name, "item_discount_amount", amount, update_modified=False)
