"""Authenticated RPC endpoints used by the original Books Vue interface."""

from __future__ import annotations

import json
from typing import Any, Literal

import frappe

from frappe_books.setup_service import run_setup
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries
from frappe_books.ui_bridge.database import BooksDatabaseBridge
from frappe_books.ui_bridge.mapping import target_doctype


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
def lifecycle_action(action: Literal["submit", "cancel"], source_schema: str, name: str) -> dict[str, Any]:
	"""Run accounting and stock lifecycle hooks in one server transaction."""
	doc = frappe.get_doc(target_doctype(source_schema), name)
	if action == "submit":
		doc.submit()
	else:
		doc.cancel()
	return BooksDatabaseBridge().get(source_schema, name)


@frappe.whitelist(methods=["POST"])
def complete_setup(options: dict[str, Any] | str) -> dict[str, Any]:
	"""Complete site setup from the original Books setup-wizard interface."""
	if isinstance(options, str):
		options = json.loads(options)
	if not isinstance(options, dict):
		frappe.throw("Books setup options must be an object")
	wizard = frappe.get_single("Books Setup Wizard")
	wizard.check_permission("write")
	wizard.update(
		{
			"logo": options.get("logo"),
			"company_name": options.get("companyName"),
			"country": options.get("country"),
			"fullname": options.get("fullname"),
			"email": options.get("email"),
			"bank_name": options.get("bankName"),
			"currency": options.get("currency"),
			"fiscal_year_start": options.get("fiscalYearStart"),
			"fiscal_year_end": options.get("fiscalYearEnd"),
			"chart_of_accounts": options.get("chartOfAccounts"),
		}
	)
	wizard.save()
	return run_setup(wizard)


def _as_list(value: list[Any] | str | None) -> list[Any]:
	if value is None:
		return []
	if isinstance(value, str):
		value = json.loads(value)
	if not isinstance(value, list):
		frappe.throw("Books API arguments must be a list")
	return value
