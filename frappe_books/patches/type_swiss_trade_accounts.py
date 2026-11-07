import frappe

# The Swiss chart shipped without these types, so its sites had no receivable or payable for invoices.
SWISS_ACCOUNT_TYPES = {
	"1100-Trade Receivables (Debtors)": "Receivable",
	"2000-Trade Payables (Creditors)": "Payable",
	"1200-Merchandise": "Stock",
	"4200-Merchandise Expense": "Cost of Goods Sold",
}


def execute():
	"""Type the Swiss chart's trade ledgers, unless the site already has a ledger of that type."""
	for name, account_type in SWISS_ACCOUNT_TYPES.items():
		if frappe.db.exists("Books Account", {"account_type": account_type, "is_group": 0}):
			continue
		frappe.db.set_value(
			"Books Account",
			{"name": name, "is_group": 0, "account_type": ("is", "not set")},
			"account_type",
			account_type,
		)
