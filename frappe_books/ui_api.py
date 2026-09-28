"""Authenticated RPC endpoints used by the original Books Vue interface."""

import json
from typing import Any, Literal, get_args

import frappe

from frappe_books import printing
from frappe_books.ui_bridge import field_properties
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries
from frappe_books.ui_bridge.database import BooksDatabaseBridge
from frappe_books.ui_bridge.mapping import target_doctype

LifecycleAction = Literal["submit", "cancel"]


@frappe.whitelist(methods=["POST"])
def database_call(method: str, args: list[Any] | str | None = None) -> Any:
	"""Run one Books interface data operation on the current Frappe site."""
	_parsed_args = _as_list(args)
	return BooksDatabaseBridge().call(method, _parsed_args)


@frappe.whitelist(methods=["POST"])
def bespoke_call(method: str, args: list[Any] | str | None = None) -> Any:
	"""Run one aggregate query required by dashboards, reports, or inventory."""
	return BooksBespokeQueries().call(method, _as_list(args))


@frappe.whitelist(methods=["POST"])
def get_field_properties() -> dict[str, dict[str, dict[str, Any]]]:
	"""Return the DocType data properties of every Books schema the user can read."""
	return field_properties.get_field_properties()


@frappe.whitelist(methods=["POST"])
def lifecycle_action(action: LifecycleAction, source_schema: str, name: str) -> dict[str, Any]:
	"""Run accounting and stock lifecycle hooks in one server transaction."""
	# Frappe skips a bare Literal annotation because its values are strings.
	if action not in get_args(LifecycleAction):
		frappe.throw(f"Unsupported Books lifecycle action: {action}", frappe.FrappeTypeError)
	doc = frappe.get_doc(target_doctype(source_schema), name)
	if action == "submit":
		doc.submit()
	else:
		doc.cancel()
	return BooksDatabaseBridge().get(source_schema, name)


@frappe.whitelist(methods=["POST"])
def get_print_totals(source_schema: str, name: str) -> dict[str, Any]:
	"""Return the totals a print template shows besides the document's own fields."""
	doc = frappe.get_doc(target_doctype(source_schema), name)
	doc.check_permission("print")
	return printing.get_print_totals(doc)


def _as_list(value: list[Any] | str | None) -> list[Any]:
	if value is None:
		return []
	if isinstance(value, str):
		value = json.loads(value)
	if not isinstance(value, list):
		frappe.throw("Books API arguments must be a list")
	return value
