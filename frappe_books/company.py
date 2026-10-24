"""The one Books Company, which the setup wizard makes."""

import frappe


def default_company() -> str | None:
	return company_value("name")


def company_value(fieldname: str | list[str]):
	"""A value, or values, of the one Books Company."""
	return frappe.db.get_value("Books Company", {}, fieldname)


def save_company(values: dict):
	"""Make the one company from `values`, or update it when tests rerun the setup; its name stays."""
	name = default_company()
	company = frappe.get_doc("Books Company", name) if name else frappe.new_doc("Books Company")
	company.update(values)
	company.save(ignore_permissions=True)
	return company
