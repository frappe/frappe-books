import frappe
from frappe.query_builder.functions import Count, IfNull, Max


def execute():
	"""Give each batch without an item the one item its stock moved, as a batch now needs its item."""
	batch = frappe.qb.DocType("Books Batch")
	sle = frappe.qb.DocType("Books Stock Ledger Entry")
	batch_items = (
		frappe.qb.from_(sle)
		.join(batch)
		.on(batch.name == sle.batch)
		.select(sle.batch, Max(sle.item))
		.where(IfNull(batch.item, "") == "")
		.groupby(sle.batch)
		.having(Count(sle.item).distinct() == 1)
	).run()
	for name, item in batch_items:
		frappe.db.set_value("Books Batch", name, "item", item, update_modified=False)
