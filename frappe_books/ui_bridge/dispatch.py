"""Argument checks shared by the Books interface dispatchers."""

import inspect
from collections.abc import Callable
from typing import Any

import frappe
from frappe.utils.typing_validations import transform_parameter_types


def call_handler(handler: Callable[..., Any], method: str, args: list[Any]) -> Any:
	"""Call a dispatcher method after checking its argument count and annotated types."""
	try:
		bound = inspect.signature(handler).bind(*args)
	except TypeError:
		frappe.throw(f"Invalid arguments for Books operation {method}")
	_, bound.arguments = transform_parameter_types(handler.__func__, (), bound.arguments, force_types=True)
	return handler(*bound.args, **bound.kwargs)
