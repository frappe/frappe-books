"""Permission-aware database compatibility layer for the Books Vue SPA."""

from datetime import UTC, datetime
from typing import Any, Literal, TypedDict
from zoneinfo import ZoneInfo

import frappe
from frappe.model.mapper import make_mapped_doc
from frappe.utils import cast, cint, get_datetime, get_system_timezone

from frappe_books.accounting.invoice import InvoiceController
from frappe_books.ui_bridge.dispatch import call_handler
from frappe_books.ui_bridge.filters import docstatus_filter, filter_pairs, validate_filter_value
from frappe_books.ui_bridge.mapping import (
	SOURCE_META_TO_TARGET,
	custom_field_mapping,
	schema_mapping,
	source_by_doctype,
	source_field,
	source_reference,
	target_doctype,
	target_field,
	target_reference,
)

READ_METHODS = {"get", "getAll", "count", "getSingleValues", "exists", "preview", "getMapped"}
WRITE_METHODS = {"insert", "update", "rename", "delete", "deleteAll"}
PROTECTED_WRITE_SCHEMAS = {"AccountingLedgerEntry", "LoyaltyPointEntry", "StockLedgerEntry"}
NUMERIC_FIELDTYPES = {"Check", "Currency", "Float", "Int", "Long Int", "Percent"}
INTERFACE_ONLY_FIELDS = {*SOURCE_META_TO_TARGET, "submitted", "cancelled", "__expectedModified"}
# Frappe maintains nested-set indices when the document is saved.
TREE_INDEX_FIELDS = {"lft", "rgt"}
DOCSTATUS_FLAGS = {"submitted": {1, 2}, "cancelled": {2}}
INVOICE_SCHEMAS = {"SalesInvoice", "PurchaseInvoice"}
# Frappe keeps the party ledger in account and the cash or bank account in payment_account
# for every payment. The Books interface keeps the source and destination accounts instead,
# so the two fields swap for Pay payments.
PAY_ACCOUNT_SWAP = {"account": "payment_account", "paymentAccount": "account"}


class ListOptions(TypedDict, total=False):
	fields: list[str] | None
	filters: dict[str, Any] | None
	offset: int | None
	limit: int | None
	groupBy: str | list[str] | None
	orderBy: str | list[str] | None
	order: Literal["asc", "desc"] | None


class SingleValueRequest(TypedDict):
	parent: str
	fieldname: str


class BooksDatabaseBridge:
	"""Expose Frappe documents through the Books interface data contract."""

	def call(self, method: str, args: list[Any]) -> Any:
		if method not in READ_METHODS | WRITE_METHODS:
			frappe.throw(f"Unsupported database operation: {method}")
		return call_handler(getattr(self, _snake_case(method)), method, args)

	def get(self, source_schema: str, name: str, fields: str | list[str] | None = None) -> dict:
		try:
			doc = frappe.get_doc(target_doctype(source_schema), name)
		except frappe.DoesNotExistError:
			return {}
		doc.check_permission("read")
		requested = [fields] if isinstance(fields, str) else fields
		return self._to_readable_source(source_schema, doc, requested)

	def get_all(self, source_schema: str, options: ListOptions | None = None) -> list[dict]:
		options = frappe._dict(options or {})
		requested = self._requested_source_fields(source_schema, options.fields)
		rows = self._get_list_rows(
			target_doctype(source_schema),
			fields=self._target_fields(source_schema, requested),
			filters=self._target_filters(source_schema, options.filters or {}),
			order_by=self._order_by(source_schema, options.orderBy, options.order),
			group_by=self._group_by(source_schema, options.groupBy),
			offset=options.offset,
			limit=options.limit,
		)
		return [self._row_to_source(source_schema, row, requested) for row in rows]

	def count(self, source_schema: str, filters: dict[str, Any] | None = None) -> int:
		rows = self._get_list_rows(
			target_doctype(source_schema),
			fields=[{"COUNT": "*", "as": "count"}],
			filters=self._target_filters(source_schema, filters or {}),
			offset=None,
			limit=None,
		)
		return sum(row.count for row in rows)

	def _get_list_rows(self, target, **query):
		if not frappe.get_meta(target).istable:
			return frappe.get_list(target, **query)
		parents = self._child_parent_doctypes(target)
		if len(parents) > 1 and (query["offset"] or query["limit"]):
			frappe.throw(f"Filter {target} rows by one parent document type to page through them")
		rows = []
		for parent_doctype in parents:
			filters = [["parenttype", "=", parent_doctype], *query["filters"]]
			rows += frappe.get_list(target, **{**query, "filters": filters}, parent_doctype=parent_doctype)
		return rows

	def _child_parent_doctypes(self, child_doctype):
		parents = []
		for parent_doctype in source_by_doctype():
			if any(
				field.options == child_doctype for field in frappe.get_meta(parent_doctype).get_table_fields()
			):
				parents.append(parent_doctype)
		return parents

	def get_single_values(self, requests: list[SingleValueRequest]) -> list[dict]:
		values = []
		for request in requests:
			parent, fieldname = request["parent"], request["fieldname"]
			target = target_doctype(parent)
			target_name = target_field(parent, fieldname)
			meta = frappe.get_meta(target)
			if not frappe.has_permission(target, ptype="read") or self._is_password_field(meta, target_name):
				continue
			value = frappe.db.get_single_value(target, target_name)
			values.append(
				{
					"parent": parent,
					"fieldname": fieldname,
					"value": _source_value(meta, target_name, value),
				}
			)
		return values

	def insert(self, source_schema: str, values: dict[str, Any]) -> dict:
		target = _writable_doctype(source_schema)
		if values.get("submitted") or values.get("cancelled"):
			frappe.throw("Use the Books document action API to submit or cancel documents")
		if frappe.get_meta(target).issingle:
			return self._update_single(source_schema, values)
		doc = frappe.get_doc({"doctype": target, **self._target_values(source_schema, values)})
		# The server names series, autoincrement and random documents; the client names the rest.
		name = values.get("name") if _is_named_by_user(doc.meta) else None
		name_field = schema_mapping()[source_schema]["fields"].get("name")
		if name and name_field != "name":
			doc.set(name_field, name)
		doc.insert(set_name=name)
		return self._to_readable_source(source_schema, doc)

	def update(self, source_schema: str, values: dict[str, Any]) -> dict:
		target = _writable_doctype(source_schema)
		if frappe.get_meta(target).issingle:
			return self._update_single(source_schema, values)
		if not isinstance(values.get("name"), str):
			frappe.throw("Books update values require a document name")
		doc = frappe.get_doc(target, values["name"])
		doc.check_permission("write")
		self._validate_expected_modified(doc, values.get("__expectedModified"))
		self._validate_docstatus_update(doc, values)
		self._set_target_values(doc, source_schema, values)
		doc.save()
		return self._to_readable_source(source_schema, doc)

	def preview(self, source_schema: str, values: dict[str, Any], name: str | None = None) -> dict:
		"""Return the values a save would calculate for a new or edited invoice, without saving."""
		target = target_doctype(source_schema)
		doc = frappe.get_doc({"doctype": target, **self._target_values(source_schema, values), "name": name})
		if not isinstance(doc, InvoiceController):
			frappe.throw(f"Books cannot preview {source_schema} documents")
		if name:
			frappe.get_doc(target, name).check_permission("write")
		else:
			doc.check_permission("create")
		doc.calculate()
		return self._to_readable_source(source_schema, doc)

	def get_mapped(self, method: str, source_name: str) -> dict:
		"""Return the unsaved document a whitelisted mapper, like make_return, builds."""
		doc = make_mapped_doc(method, source_name)
		return self._to_readable_source(source_by_doctype()[doc.doctype], doc)

	def rename(self, source_schema: str, old_name: str, new_name: str) -> None:
		frappe.rename_doc(_writable_doctype(source_schema), old_name, new_name)

	def delete(self, source_schema: str, name: str) -> None:
		frappe.delete_doc(_writable_doctype(source_schema), name)

	def delete_all(self, source_schema: str, filters: dict[str, Any]) -> int:
		if not filters:
			frappe.throw("Books bulk deletion requires at least one filter")
		names = frappe.get_list(
			_writable_doctype(source_schema),
			filters=self._target_filters(source_schema, filters),
			pluck="name",
		)
		for name in names:
			self.delete(source_schema, name)
		return len(names)

	def exists(self, source_schema: str, name: str | None = None) -> bool:
		if not name:
			return False
		target = target_doctype(source_schema)
		if not frappe.db.exists(target, name):
			return False
		return bool(frappe.has_permission(target, ptype="read", doc=name))

	def _to_readable_source(self, source_schema: str, doc, requested=None) -> dict:
		doc.apply_fieldlevel_read_permissions()
		if doc.meta.issingle:
			return self._to_source_single(source_schema, doc, requested)
		return self._to_source_document(source_schema, doc, requested)

	def _to_source_document(self, source_schema: str, doc, requested=None) -> dict:
		values = self._row_to_source(source_schema, doc.as_dict(), requested)
		return self._append_source_children(source_schema, doc, values, requested)

	def _to_source_single(self, source_schema: str, doc, requested=None) -> dict:
		stored = {
			field: value
			for field, value in frappe.db.get_singles_dict(doc.doctype).items()
			if hasattr(doc, field) and not self._is_password_field(doc.meta, field)
		}
		stored["name"] = source_schema
		known_targets = set(schema_mapping()[source_schema]["fields"].values())
		available = {
			source_field(source_schema, target_name) for target_name in stored if target_name in known_targets
		}
		available.discard("name")
		if requested:
			available.intersection_update(requested)
		values = self._row_to_source(source_schema, stored, sorted(available))
		return self._append_source_children(source_schema, doc, values, requested)

	def _append_source_children(self, source_schema, doc, values, requested=None):
		for field in doc.meta.get_table_fields():
			source_name = source_by_doctype().get(field.options)
			if not source_name:
				continue
			source_fieldname = source_field(source_schema, field.fieldname)
			if requested and source_fieldname not in requested:
				continue
			values[source_fieldname] = [
				self._to_source_document(source_name, child) for child in doc.get(field.fieldname)
			]
		return values

	def _row_to_source(self, source_schema: str, row: dict, requested=None) -> dict:
		if requested is None:
			requested = self._default_source_fields(source_schema)
		meta = frappe.get_meta(target_doctype(source_schema))
		values = {}
		for source_name in requested:
			target_name = target_field(source_schema, source_name)
			if not self._is_password_field(meta, target_name):
				values[source_name] = _source_row_value(meta, source_name, target_name, row)
		# Numeric database IDs still identify text fields in the Books interface.
		name = row.get("name")
		values["name"] = str(name) if name is not None else None
		_apply_source_conventions(source_schema, meta, row, values)
		return values

	def _target_values(self, source_schema: str, values: dict[str, Any]) -> dict:
		meta = frappe.get_meta(target_doctype(source_schema))
		mapped = {}
		for source_name, value in values.items():
			if source_name in INTERFACE_ONLY_FIELDS or (meta.is_tree and source_name in TREE_INDEX_FIELDS):
				continue
			target_name = target_field(source_schema, source_name)
			field = meta.get_field(target_name)
			if field and field.fieldtype == "Table" and isinstance(value, list):
				mapped[target_name] = self._target_rows(field.options, value)
			elif field:
				mapped[target_name] = _target_value(meta, target_name, value)
		_apply_target_conventions(source_schema, mapped)
		return mapped

	def _target_rows(self, child_doctype: str, rows: list[dict]) -> list[dict]:
		child_source = source_by_doctype()[child_doctype]
		return [{**self._target_values(child_source, row), "name": row.get("name")} for row in rows]

	def _target_filters(self, source_schema: str, filters: dict) -> list[list[Any]]:
		meta = frappe.get_meta(target_doctype(source_schema))
		translated = []
		if "submitted" in filters or "cancelled" in filters:
			translated.append(docstatus_filter(filters))
		for source_name, value in filters.items():
			if source_name in {"submitted", "cancelled"}:
				continue
			target_name = target_field(source_schema, source_name)
			translated.extend(
				_target_condition(meta, target_name, operator, comparison)
				for operator, comparison in filter_pairs(source_name, value)
			)
		return translated

	def _target_fields(self, source_schema: str, requested: list[str]) -> list[str]:
		meta = frappe.get_meta(target_doctype(source_schema))
		fields = {
			target_field(source_schema, fieldname)
			for fieldname in requested
			if not (meta.get_field(target_field(source_schema, fieldname)) or frappe._dict()).get("fieldtype")
			== "Table"
		}
		fields.add("name")
		if source_schema == "Payment" and {"account", "paymentAccount"}.intersection(requested):
			fields.update({"account", "payment_account", "payment_type"})
		if source_schema in {"SalesInvoice", "PurchaseInvoice"} and "outstandingAmount" in requested:
			fields.add("return_against")
		return sorted(fields)

	def _requested_source_fields(self, source_schema: str, requested) -> list[str]:
		if requested is None or requested == [] or requested == ["*"]:
			return self._default_source_fields(source_schema)
		if "*" in requested:
			frappe.throw("The Books wildcard field must be requested on its own")
		return requested

	def _default_source_fields(self, source_schema: str) -> list[str]:
		meta = frappe.get_meta(target_doctype(source_schema))
		fields = [
			source_name
			for source_name, target_name in schema_mapping()[source_schema]["fields"].items()
			if (meta.get_field(target_name) or frappe._dict()).get("fieldtype") not in {"Table", "Password"}
		]
		return list(
			dict.fromkeys(
				[
					"name",
					*fields,
					*custom_field_mapping(source_schema),
					"createdBy",
					"modifiedBy",
					"created",
					"modified",
					"submitted",
					"cancelled",
				]
			)
		)

	def _order_by(self, source_schema, order_by, order):
		if not order_by:
			return None
		fields = [order_by] if isinstance(order_by, str) else order_by
		return ", ".join(f"{target_field(source_schema, field)} {order or 'asc'}" for field in fields)

	def _group_by(self, source_schema, group_by):
		if not group_by:
			return None
		fields = [group_by] if isinstance(group_by, str) else group_by
		return ", ".join(target_field(source_schema, field) for field in fields)

	def _update_single(self, source_schema, values):
		doc = frappe.get_single(target_doctype(source_schema))
		doc.check_permission("write")
		self._set_target_values(doc, source_schema, values)
		doc.save()
		return self.get(source_schema, source_schema)

	def _set_target_values(self, doc, source_schema, values):
		mapped = self._target_values(source_schema, values)
		# Rows of this document update in place. Any other client row name becomes a new row.
		own_rows = {row.name for row in doc.get_all_children()}
		for field in doc.meta.get_table_fields():
			for row in mapped.get(field.fieldname) or []:
				if row["name"] not in own_rows:
					row["name"] = None
		doc.update(mapped)

	def _validate_docstatus_update(self, doc, values):
		if not doc.meta.is_submittable:
			return
		desired = 2 if values.get("cancelled") else 1 if values.get("submitted") else 0
		if ("submitted" in values or "cancelled" in values) and desired != doc.docstatus:
			frappe.throw("Use the Books document action API to change document status")

	def _validate_expected_modified(self, doc, expected):
		if expected is None or doc.meta.issingle:
			return
		if not isinstance(expected, str):
			frappe.throw("The expected Books modification time must be a string")
		try:
			expected_datetime = datetime.fromisoformat(expected.replace("Z", "+00:00"))
		except ValueError:
			frappe.throw("The expected Books modification time is invalid")
		if expected_datetime.tzinfo is None:
			expected_datetime = expected_datetime.replace(tzinfo=ZoneInfo(get_system_timezone()))
		current_datetime = _aware_datetime(doc.modified)
		if _javascript_datetime(current_datetime) != _javascript_datetime(expected_datetime):
			frappe.throw(
				f"{doc.doctype} {doc.name} changed after it was opened. Reload and try again.",
				frappe.TimestampMismatchError,
			)

	def _is_password_field(self, meta, fieldname):
		field = meta.get_field(fieldname)
		return bool(field and field.fieldtype == "Password")


def _is_named_by_user(meta) -> bool:
	autoname = (meta.autoname or "").lower()
	return autoname == "prompt" or autoname.startswith("field:")


def _writable_doctype(source_schema: str) -> str:
	if source_schema in PROTECTED_WRITE_SCHEMAS:
		frappe.throw(f"{source_schema} records are managed by server document actions")
	return target_doctype(source_schema)


def _snake_case(value: str) -> str:
	return "".join(f"_{char.lower()}" if char.isupper() else char for char in value).lstrip("_")


def _source_row_value(meta, source_name: str, target_name: str, row: dict) -> Any:
	if source_name in DOCSTATUS_FLAGS:
		return cint(row.get("docstatus")) in DOCSTATUS_FLAGS[source_name]
	value = row.get(target_name)
	field = meta.get_field(target_name)
	if value and (target_name in {"creation", "modified"} or (field and field.fieldtype == "Datetime")):
		return _iso_datetime(value)
	return _source_value(meta, target_name, value)


def _apply_source_conventions(source_schema: str, meta, row: dict, values: dict) -> None:
	if source_schema == "Payment" and row.get("payment_type") == "Pay":
		for source_name, target_name in PAY_ACCOUNT_SWAP.items():
			if source_name in values:
				values[source_name] = _source_value(meta, target_name, row.get(target_name))
	if source_schema in INVOICE_SCHEMAS and row.get("return_against") and values.get("outstandingAmount"):
		# The Books interface treats return outstanding amounts as a positive refundable balance.
		# Frappe stores credit-note outstanding values with a negative accounting sign.
		values["outstandingAmount"] = abs(values["outstandingAmount"])


def _apply_target_conventions(source_schema: str, mapped: dict) -> None:
	if source_schema == "PaymentFor" and mapped.get("amount") is not None:
		# The Books interface signs a refund allocation like its credit note.
		# Frappe stores every payment allocation as a positive magnitude.
		mapped["amount"] = abs(mapped["amount"])
	if source_schema == "Payment" and mapped.get("payment_type") == "Pay":
		mapped["account"], mapped["payment_account"] = mapped.get("payment_account"), mapped.get("account")


def _target_condition(meta, target_name: str, operator: str, comparison: Any) -> list[Any]:
	if operator in {"is null", "is not null"}:
		return [target_name, "is", "not set" if operator == "is null" else "set"]
	is_list = operator in {"in", "not in"}
	for item in comparison if is_list else [comparison]:
		validate_filter_value(meta, target_name, operator, item)
	if operator == "includes":
		return [target_name, "like", f"%{comparison}%"]
	if is_list:
		return [target_name, operator, [_target_value(meta, target_name, item) for item in comparison]]
	return [target_name, operator, _target_value(meta, target_name, comparison)]


def _target_value(meta, fieldname: str, value: Any) -> Any:
	if _stores_doctype_name(meta, fieldname):
		return target_reference(value)
	field = meta.get_field(fieldname)
	if field and field.fieldtype in NUMERIC_FIELDTYPES:
		return _numeric_value(field.fieldtype, value)
	return value


def _numeric_value(fieldtype: str, value: Any) -> Any:
	if value is None and fieldtype != "Check":
		return None
	if fieldtype == "Long Int":
		return cint(value)
	return cast(fieldtype, value)


def _source_value(meta, fieldname: str, value: Any) -> Any:
	if _stores_doctype_name(meta, fieldname):
		return source_reference(value)
	return value


def _stores_doctype_name(meta, fieldname: str) -> bool:
	if fieldname == "parenttype":
		return True
	field = meta.get_field(fieldname)
	return bool(field and field.fieldtype == "Link" and field.options == "DocType")


def _iso_datetime(value) -> str:
	return _aware_datetime(value).isoformat()


def _aware_datetime(value) -> datetime:
	datetime_value = get_datetime(value)
	if datetime_value.tzinfo is None:
		datetime_value = datetime_value.replace(tzinfo=ZoneInfo(get_system_timezone()))
	return datetime_value


def _javascript_datetime(value: datetime) -> datetime:
	utc_value = value.astimezone(UTC)
	return utc_value.replace(microsecond=utc_value.microsecond // 1000 * 1000)
