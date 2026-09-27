"""Preserve per-unit discounts as line discounts during upgrade."""

import frappe

from frappe_books.accounting.money import as_decimal

ITEM_PARENTS = {
	"Books Sales Invoice Item": "Books Sales Invoice",
	"Books Purchase Invoice Item": "Books Purchase Invoice",
	"Books Sales Quote Item": "Books Sales Quote",
}


def execute():
	"""Preserve existing invoice values when flat discounts become line amounts."""
	for doctype, parent_doctype in ITEM_PARENTS.items():
		for row in _per_unit_rows(doctype, parent_doctype):
			amount = as_decimal(row.item_discount_amount) * abs(as_decimal(row.quantity))
			frappe.db.set_value(doctype, row.name, "item_discount_amount", amount, update_modified=False)


def _per_unit_rows(doctype, parent_doctype):
	"""Return rows whose stored totals still apply the discount per unit."""
	item = frappe.qb.DocType(doctype)
	parent = frappe.qb.DocType(parent_doctype)
	rows = (
		frappe.qb.from_(item)
		.join(parent)
		.on(item.parent == parent.name)
		.select(
			item.name,
			item.quantity,
			item.amount,
			item.item_discount_amount,
			item.item_taxed_total,
			item.item_discounted_total,
			parent.discount_after_tax,
		)
		.where(item.set_item_discount_amount == 1)
	).run(as_dict=True)
	return [row for row in rows if _line_discount(row) != as_decimal(row.item_discount_amount)]


def _line_discount(row):
	undiscounted = row.item_taxed_total if row.discount_after_tax else row.amount
	return abs(as_decimal(undiscounted)) - abs(as_decimal(row.item_discounted_total))
