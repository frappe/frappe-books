import frappe

REMARKS = [None, "", "Alpha café", "Beta", "Alpha O'Reilly"]
STATUSES = ["Saved", "Submitted", "Cancelled"]


def make_list_filter_records(tag: str) -> dict[str, list[str]]:
	"""Seed the records the browser list filter tests query, named by `tag`, and return their names."""
	if not frappe.conf.allow_tests:
		frappe.throw("List filter records need a test site")
	return {
		"JournalEntry": [make_journal_entry(index, tag) for index in range(len(REMARKS))],
		"SalesInvoice": [make_sales_invoice(index, tag) for index in range(5)],
	}


def make_journal_entry(index: int, tag: str) -> str:
	"""Even entries are Administrator's JV- entries; docstatus cycles draft, submitted, cancelled."""
	user = "Administrator" if index % 2 == 0 else "Guest"
	return insert(
		{
			"doctype": "Books Journal Entry",
			"name": f"Filter {index} {tag}",
			"user_remark": REMARKS[index],
			"posting_date": f"2024-01-{index + 1:02}",
			"entry_type": "Journal Entry" if index < 3 else "Cash Entry",
			"reference_number": str(index),
			"number_series": "JV-" if index % 2 == 0 else "BANK-",
			"docstatus": index % 3,
			"status": STATUSES[index % 3],
			"owner": user,
			"modified_by": user,
			"creation": f"2024-01-{index + 1:02} 12:00:00",
			"modified": f"2024-02-{index + 1:02} 12:00:00",
		}
	)


def make_sales_invoice(index: int, tag: str) -> str:
	return insert(
		{
			"doctype": "Books Sales Invoice",
			"name": f"Filter invoice {index} {tag}",
			"date": f"2024-01-{index + 1:02} 12:00:00",
			"number_series": "SINV-",
			"net_total": index * 100,
			"grand_total": index * 112,
			"base_grand_total": index * 224,
		}
	)


def insert(values: dict) -> str:
	"""Insert the row as given, so its audit fields and docstatus stay as set."""
	doc = frappe.get_doc(values)
	doc.db_insert()
	return doc.name
