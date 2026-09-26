"""Permission-aware database compatibility layer for the Books Vue SPA."""

from __future__ import annotations

from base64 import b64decode
from datetime import UTC, datetime
from typing import Any
from zoneinfo import ZoneInfo

import frappe
from frappe.utils import cast, cint, flt, get_datetime, get_system_timezone

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

READ_METHODS = {"get", "getAll", "getSingleValues", "exists", "close"}
WRITE_METHODS = {"insert", "update", "rename", "delete", "deleteAll"}
PROTECTED_WRITE_SCHEMAS = {"AccountingLedgerEntry", "StockLedgerEntry"}
NUMERIC_FIELDTYPES = {"Check", "Currency", "Float", "Int", "Long Int", "Percent"}


class BooksDatabaseBridge:
	"""Expose Frappe documents through the Books interface data contract."""

	def call(self, method: str, args: list[Any]) -> Any:
		if not isinstance(method, str) or not isinstance(args, list):
			frappe.throw("Books database operations require a method and argument list")
		if method not in READ_METHODS | WRITE_METHODS:
			frappe.throw(f"Unsupported database operation: {method}")
		if (
			method in WRITE_METHODS
			and args
			and isinstance(args[0], str)
			and args[0] in PROTECTED_WRITE_SCHEMAS
		):
			frappe.throw(f"{args[0]} records are managed by server document actions")
		return call_handler(getattr(self, _snake_case(method)), method, args)

	def get(self, source_schema: str, name: str, fields: str | list[str] | None = None) -> dict:
		if source_schema == "SingleValue":
			return self._get_single_value_row(name)
		try:
			doc = frappe.get_doc(target_doctype(source_schema), name)
		except frappe.DoesNotExistError:
			return {}
		doc.check_permission("read")
		requested = [fields] if isinstance(fields, str) else fields
		if doc.meta.issingle:
			return self._to_source_single(source_schema, doc, requested)
		return self._to_source_document(source_schema, doc, requested)

	def get_all(self, source_schema: str, options: dict[str, Any] | None = None) -> list[dict]:
		if options is not None and not isinstance(options, dict):
			frappe.throw("Books list options must be an object")
		options = frappe._dict(options or {})
		if source_schema == "SingleValue":
			return self._single_value_rows()
		target = target_doctype(source_schema)
		requested = self._requested_source_fields(source_schema, options.fields)
		target_fields = self._target_fields(source_schema, requested)
		filters = self._target_filters(source_schema, options.filters if options.filters is not None else {})
		order_by = self._order_by(source_schema, options.orderBy, options.order)
		group_by = self._group_by(source_schema, options.groupBy)
		rows = self._get_list_rows(
			target,
			filters,
			target_fields,
			offset=cint(options.offset),
			limit=_row_limit(options.limit),
			order_by=order_by,
			group_by=group_by,
		)
		return [self._row_to_source(source_schema, row, requested) for row in rows]

	def _get_list_rows(self, target, filters, fields, offset, limit, order_by, group_by):
		if frappe.get_meta(target).istable:
			rows = self._get_child_rows(target, filters, fields, order_by, group_by)
			return rows[offset : offset + limit if limit else None]

		query = {"filters": filters, "fields": fields, "order_by": order_by, "group_by": group_by}
		if limit:
			return frappe.get_list(target, start=offset, limit=limit, **query)
		# Frappe only applies an offset together with a limit.
		return frappe.get_list(target, **query)[offset:]

	def _get_child_rows(self, target, filters, fields, order_by, group_by):
		rows = []
		for parent_doctype in self._child_parent_doctypes(target):
			rows.extend(
				self._get_parent_child_rows(target, parent_doctype, filters, fields, order_by, group_by)
			)
		return rows

	def _get_parent_child_rows(self, target, parent_doctype, filters, fields, order_by, group_by):
		child_filters = [["parenttype", "=", parent_doctype], *filters]
		parent_filters = [[target, *condition] for condition in child_filters]
		parent_names = frappe.get_list(parent_doctype, filters=parent_filters, pluck="name")
		if not parent_names:
			return []

		child_filters.append(["parent", "in", parent_names])
		return frappe.get_list(
			target,
			filters=child_filters,
			fields=fields,
			order_by=order_by,
			group_by=group_by,
			parent_doctype=parent_doctype,
		)

	def _child_parent_doctypes(self, child_doctype):
		parents = []
		for parent_doctype in source_by_doctype():
			if any(
				field.options == child_doctype for field in frappe.get_meta(parent_doctype).get_table_fields()
			):
				parents.append(parent_doctype)
		return parents

	def get_single_values(self, *requests: dict | str) -> list[dict]:
		values = []
		for request in requests:
			if isinstance(request, str):
				continue
			parent = request.get("parent")
			fieldname = request.get("fieldname")
			if (
				not isinstance(parent, str)
				or not isinstance(fieldname, str)
				or parent not in schema_mapping()
			):
				continue
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
		target = target_doctype(source_schema)
		if not isinstance(values, dict):
			frappe.throw("Books insert values must be an object")
		if values.get("submitted") or values.get("cancelled"):
			frappe.throw("Use the Books document action API to submit or cancel documents")
		if frappe.get_meta(target).issingle:
			return self._update_single(source_schema, values)
		doc = frappe.get_doc({"doctype": target, **self._target_values(source_schema, values)})
		if values.get("name"):
			doc.name = values["name"]
			name_field = schema_mapping()[source_schema]["fields"].get("name")
			if name_field and name_field != "name":
				doc.set(name_field, values["name"])
		self._set_docstatus(doc, values)
		doc.insert(set_name=values.get("name"))
		return self._to_source_document(source_schema, doc)

	def update(self, source_schema: str, values: dict[str, Any]) -> dict:
		if not isinstance(values, dict):
			frappe.throw("Books update values must be an object")
		target = target_doctype(source_schema)
		if frappe.get_meta(target).issingle:
			return self._update_single(source_schema, values)
		if not isinstance(values.get("name"), str):
			frappe.throw("Books update values require a document name")
		doc = frappe.get_doc(target, values["name"])
		doc.check_permission("write")
		self._validate_expected_modified(doc, values.get("__expectedModified"))
		self._validate_docstatus_update(doc, values)
		for fieldname, value in self._target_values(source_schema, values).items():
			doc.set(fieldname, value)
		self._set_docstatus(doc, values)
		doc.save()
		return self._to_source_document(source_schema, doc)

	def rename(self, source_schema: str, old_name: str, new_name: str) -> None:
		doc = frappe.get_doc(target_doctype(source_schema), old_name)
		doc.check_permission("write")
		frappe.rename_doc(doc.doctype, old_name, new_name)

	def delete(self, source_schema: str, name: str) -> None:
		if source_schema == "SingleValue":
			self._delete_single_value(name)
			return
		doc = frappe.get_doc(target_doctype(source_schema), name)
		doc.check_permission("delete")
		frappe.delete_doc(doc.doctype, name)

	def delete_all(self, source_schema: str, filters: dict[str, Any]) -> int:
		if not isinstance(filters, dict) or not filters:
			frappe.throw("Books bulk deletion requires at least one filter")
		names = frappe.get_list(
			target_doctype(source_schema),
			filters=self._target_filters(source_schema, filters),
			pluck="name",
		)
		for name in names:
			self.delete(source_schema, name)
		return len(names)

	def exists(self, source_schema: str, name: str | None = None) -> bool:
		if source_schema == "SingleValue":
			return bool(name and self._get_single_value_row(name))
		if not isinstance(name, str):
			return False
		target = target_doctype(source_schema)
		if not frappe.db.exists(target, name):
			return False
		return bool(frappe.has_permission(target, ptype="read", doc=name))

	def close(self) -> None:
		return None

	def _to_source_document(self, source_schema: str, doc, requested=None) -> dict:
		values = self._row_to_source(source_schema, doc.as_dict(), requested)
		return self._append_source_children(source_schema, doc, values, requested)

	def _to_source_single(self, source_schema: str, doc, requested=None) -> dict:
		stored = {
			field: value
			for field, value in frappe.db.get_singles_dict(doc.doctype).items()
			if not self._is_password_field(doc.meta, field)
		}
		stored["name"] = source_schema
		known_targets = set(schema_mapping()[source_schema]["fields"].values())
		available = {
			self._source_field_for_target(source_schema, target_name)
			for target_name in stored
			if target_name in known_targets
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
			source_fieldname = self._source_field_for_target(source_schema, field.fieldname)
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
			if source_name == "submitted":
				values[source_name] = int(row.get("docstatus") or 0) in {1, 2}
			elif source_name == "cancelled":
				values[source_name] = int(row.get("docstatus") or 0) == 2
			else:
				target_name = target_field(source_schema, source_name)
				if self._is_password_field(meta, target_name):
					continue
				value = row.get(target_name)
				field = meta.get_field(target_name)
				if value and (
					target_name in {"creation", "modified"} or (field and field.fieldtype == "Datetime")
				):
					value = _iso_datetime(value)
				values[source_name] = _source_value(meta, target_name, value)
		# Numeric database IDs still identify text fields in the Books interface.
		name = row.get("name")
		values["name"] = str(name) if name is not None else None
		# Undo the Pay account swap described in _target_values.
		if source_schema == "Payment" and row.get("payment_type") == "Pay":
			if "account" in requested:
				values["account"] = _source_value(meta, "payment_account", row.get("payment_account"))
			if "paymentAccount" in requested:
				values["paymentAccount"] = _source_value(meta, "account", row.get("account"))
		if (
			source_schema in {"SalesInvoice", "PurchaseInvoice"}
			and row.get("return_against")
			and values.get("outstandingAmount") is not None
		):
			# The Books interface treats return outstanding amounts as a
			# positive refundable balance. Frappe stores credit-note outstanding
			# values with a negative accounting sign.
			values["outstandingAmount"] = abs(values["outstandingAmount"])
		return values

	def _target_values(self, source_schema: str, values: dict[str, Any]) -> dict:
		target = target_doctype(source_schema)
		meta = frappe.get_meta(target)
		mapped = {}
		for source_name, value in values.items():
			if meta.is_tree and source_name in {"lft", "rgt"}:
				# Frappe maintains nested-set indices when the document is saved.
				continue
			if source_name in SOURCE_META_TO_TARGET or source_name in {
				"submitted",
				"cancelled",
				"__expectedModified",
			}:
				continue
			if source_schema == "PaymentFor" and source_name == "amount" and value is not None:
				# The Books interface signs a refund allocation like its credit note.
				# Frappe stores every payment allocation as a positive magnitude.
				value = abs(flt(value))
			target_name = target_field(source_schema, source_name)
			field = meta.get_field(target_name)
			if not field:
				continue
			if field.fieldtype == "Table" and isinstance(value, list):
				child_source = source_by_doctype().get(field.options)
				if child_source:
					mapped[target_name] = [self._target_values(child_source, row) for row in value]
			else:
				mapped[target_name] = _target_value(meta, target_name, value)
		# Frappe keeps the party ledger in account and the cash or bank account in
		# payment_account for every payment. The Books interface keeps the source and
		# destination accounts instead, so the two fields swap for Pay payments.
		if source_schema == "Payment" and mapped.get("payment_type") == "Pay":
			mapped["account"], mapped["payment_account"] = (
				mapped.get("payment_account"),
				mapped.get("account"),
			)
		return mapped

	def _target_filters(self, source_schema: str, filters: dict) -> list[list[Any]]:
		if not isinstance(filters, dict):
			frappe.throw("Books filters must be an object")
		meta = frappe.get_meta(target_doctype(source_schema))
		translated = []
		if "submitted" in filters or "cancelled" in filters:
			translated.append(docstatus_filter(filters))
		for source_name, value in filters.items():
			if source_name in {"submitted", "cancelled"}:
				continue
			target_name = target_field(source_schema, source_name)
			for operator, comparison in filter_pairs(source_name, value):
				if operator in {"is null", "is not null"}:
					translated.append([target_name, "is", "not set" if operator == "is null" else "set"])
					continue
				values = comparison if operator in {"in", "not in"} else [comparison]
				for item in values:
					validate_filter_value(meta, target_name, operator, item)
				if operator == "includes":
					operator = "like"
					comparison = f"%{comparison}%"
				if operator in {"in", "not in"} and isinstance(comparison, list):
					comparison = [_target_value(meta, target_name, item) for item in comparison]
				else:
					comparison = _target_value(meta, target_name, comparison)
				translated.append([target_name, operator, comparison])
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
		if not isinstance(requested, list) or not all(isinstance(field, str) for field in requested):
			frappe.throw("Books list fields must be an array of strings")
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
		"""Match Books' getAll defaults: `created` (non-child schemas only) and `desc`."""
		if order not in {None, "asc", "desc"}:
			frappe.throw("Books sort order must be asc or desc")
		if not order_by and not frappe.get_meta(target_doctype(source_schema)).istable:
			order_by = "created"
		if not order_by:
			return None
		fields = [order_by] if isinstance(order_by, str) else order_by
		return ", ".join(f"{target_field(source_schema, field)} {order or 'desc'}" for field in fields)

	def _group_by(self, source_schema, group_by):
		if not group_by:
			return None
		fields = [group_by] if isinstance(group_by, str) else group_by
		return ", ".join(target_field(source_schema, field) for field in fields)

	def _source_field_for_target(self, source_schema, target_name):
		return source_field(source_schema, target_name)

	def _set_docstatus(self, doc, values):
		if values.get("cancelled"):
			doc.docstatus = 2
		elif values.get("submitted"):
			doc.docstatus = 1
		elif "submitted" in values:
			doc.docstatus = 0

	def _single_value_rows(self):
		rows = []
		for source_schema, config in schema_mapping().items():
			meta = frappe.get_meta(config["doctype"])
			if not meta.issingle or not frappe.has_permission(config["doctype"], ptype="read"):
				continue
			for source_name, target_name in config["fields"].items():
				if self._is_password_field(meta, target_name):
					continue
				value = frappe.db.get_single_value(config["doctype"], target_name)
				if value is not None:
					rows.append(
						{
							"name": f"{source_schema}::{source_name}",
							"parent": source_schema,
							"fieldname": source_name,
							"value": _source_value(meta, target_name, value),
						}
					)
		return rows

	def _get_single_value_row(self, name):
		return next((row for row in self._single_value_rows() if row["name"] == name), {})

	def _delete_single_value(self, name):
		if "::" not in name:
			return
		source_schema, source_name = name.split("::", 1)
		target = target_doctype(source_schema)
		if not frappe.has_permission(target, ptype="write"):
			frappe.throw("Not permitted", frappe.PermissionError)
		frappe.db.set_single_value(target, target_field(source_schema, source_name), None)

	def _update_single(self, source_schema, values, doc=None):
		doc = doc or frappe.get_single(target_doctype(source_schema))
		doc.check_permission("write")
		for fieldname, value in self._target_values(source_schema, values).items():
			doc.set(fieldname, value)
		doc.save()
		return self.get(source_schema, source_schema)

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


def _row_limit(value: Any) -> int | None:
	if value in (None, ""):
		return None
	return max(cint(value), 1)


def _snake_case(value: str) -> str:
	return "".join(f"_{char.lower()}" if char.isupper() else char for char in value).lstrip("_")


def _target_value(meta, fieldname: str, value: Any) -> Any:
	value = _normalize_attach_image(meta, fieldname, value)
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
	value = _normalize_attach_image(meta, fieldname, value)
	if _stores_doctype_name(meta, fieldname):
		return source_reference(value)
	return value


def _normalize_attach_image(meta, fieldname: str, value: Any) -> Any:
	field = meta.get_field(fieldname)
	if not field or field.fieldtype != "Attach Image" or not isinstance(value, str):
		return value
	if not value.startswith("data:image/") or ";base64," not in value:
		return value

	payload = value.split(",", 1)[1]
	if not payload.startswith("ZGF0YTppbWFn"):
		return value
	try:
		decoded = b64decode(payload, validate=True).decode()
	except ValueError:
		return value
	return decoded if decoded.startswith("data:image/") else value


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
