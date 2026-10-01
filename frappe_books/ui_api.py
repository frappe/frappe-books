"""Authenticated RPC endpoints used by the original Books Vue interface."""

import json
from typing import Any, Literal, get_args

import frappe
from frappe.model.docstatus import DocStatus
from frappe.model.document import Document

from frappe_books.ui_bridge import field_properties
from frappe_books.ui_bridge.database import BooksDatabaseBridge
from frappe_books.ui_bridge.mapping import target_doctype

LifecycleAction = Literal["submit", "cancel"]


@frappe.whitelist(methods=["POST"])
def database_call(method: str, args: list[Any] | str | None = None) -> Any:
	"""Run one Books interface data operation on the current Frappe site."""
	_parsed_args = _as_list(args)
	return BooksDatabaseBridge().call(method, _parsed_args)


@frappe.whitelist(methods=["POST"])
def get_field_properties() -> dict[str, dict[str, dict[str, Any]]]:
	"""Return the DocType data properties of every Books schema the user can read."""
	return field_properties.get_field_properties()


@frappe.whitelist(methods=["POST"])
def get_duplicate(source_schema: str, values: dict[str, Any]) -> dict[str, Any]:
	"""Return an unsaved copy of a document's values, with any unsaved edits, for Duplicate."""
	return BooksDatabaseBridge().get_duplicate(source_schema, values)


@frappe.whitelist(methods=["POST"])
def run_doc_method(
	method: str, source_schema: str, values: dict[str, Any], name: str | None = None
) -> dict[str, Any]:
	"""Run a whitelisted controller method, such as an invoice's preview, on unsaved values."""
	return BooksDatabaseBridge().run_doc_method(method, source_schema, values, name)


@frappe.whitelist(methods=["POST"])
def lifecycle_action(
	action: LifecycleAction,
	source_schema: str,
	name: str,
	modified: str,
	linked_docs: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
	"""Run accounting and stock lifecycle hooks in one server transaction.

	Frappe refuses the action if the document changed after the client read `modified`. A cancel
	first cancels `linked_docs`, the payments `get_payments_to_cancel` listed.
	"""
	# Frappe skips a bare Literal annotation because its values are strings.
	if action not in get_args(LifecycleAction):
		frappe.throw(f"Unsupported Books lifecycle action: {action}", frappe.FrappeTypeError)
	doc = frappe.get_doc(target_doctype(source_schema), name)
	doc.modified = modified
	if action == "submit":
		doc.submit()
	elif linked_docs:
		cancel_with_linked_docs(doc, linked_docs)
	else:
		doc.cancel()
	return BooksDatabaseBridge().get(source_schema, name)


def cancel_with_linked_docs(doc: Document, linked_docs: list[dict[str, Any]]) -> None:
	"""Cancel the linked documents and then `doc`, as Frappe's Cancel All does."""
	# Frappe cancels a fresh copy of `doc`, so check this one is current first, as run_doc_method does.
	doc.docstatus = DocStatus.CANCELLED
	doc._original_modified = doc.modified
	doc.check_if_latest()
	doc.cancel_with_linked_docs(linked_docs)


def _as_list(value: list[Any] | str | None) -> list[Any]:
	if value is None:
		return []
	if isinstance(value, str):
		value = json.loads(value)
	if not isinstance(value, list):
		frappe.throw("Books API arguments must be a list")
	return value
