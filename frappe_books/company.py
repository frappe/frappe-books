"""The one Books Company, which the setup wizard makes; documents belong to it."""

import frappe

# Books doctypes whose ERPNext twin has `company`
COMPANY_DOCTYPES = (
	"Books Account",
	"Books Delivery Note",
	"Books Journal Entry",
	"Books Lead",
	"Books Ledger Entry",
	"Books Location",
	"Books Loyalty Point Entry",
	"Books Loyalty Program",
	"Books Payment",
	"Books Pos Closing Shift",
	"Books Pos Opening Shift",
	"Books Pos Profile",
	"Books Pricing Rule",
	"Books Purchase Invoice",
	"Books Purchase Receipt",
	"Books Quotation",
	"Books Sales Invoice",
	"Books Serial Number",
	"Books Stock Entry",
	"Books Stock Ledger Entry",
	"Books Tax",
)


def default_company() -> str | None:
	return company_value("name")


def company_value(fieldname: str | list[str]):
	"""A value, or values, of the one Books Company."""
	return frappe.db.get_value("Books Company", {}, fieldname)


def set_company(doc, method=None):
	"""A new document belongs to the one company."""
	if not doc.get("company"):
		doc.company = default_company()


def save_company(values: dict):
	"""Make the one company from `values`, or update it when tests rerun the setup; its name stays."""
	name = default_company()
	company = frappe.get_doc("Books Company", name) if name else frappe.new_doc("Books Company")
	company.update(values)
	company.save(ignore_permissions=True)
	if not name:
		claim_records(company.name)
	return company


def claim_records(company):
	"""Give the company the records made before it, like the Stores location the install adds."""
	for doctype in COMPANY_DOCTYPES:
		frappe.db.set_value(
			doctype, {"company": ("is", "not set")}, "company", company, update_modified=False
		)
