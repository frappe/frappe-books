"""The tabs accessory mode forms end with: Custom, one per app, Other apps."""

import frappe

CUSTOM = "custom"
OTHER = "other"


def get_custom_field_tabs(doctypes: list[str]) -> dict[str, dict[str, str]]:
	"""The tab of each Custom Field of `doctypes`, by doctype and fieldname.

	A user's field goes in Custom, an app's in its app title's tab (through its
	module), and an app's field with no module in Other apps.
	"""
	fields = frappe.get_all(
		"Custom Field",
		filters={"dt": ("in", doctypes)},
		fields=["dt", "fieldname", "is_system_generated", "module"],
	)
	apps = _get_module_apps({field.module for field in fields if field.module})
	tabs = {}
	for field in fields:
		tabs.setdefault(field.dt, {})[field.fieldname] = _get_tab(field, apps)
	return tabs


def get_app_titles() -> list[str]:
	"""Each installed app's title, in install order, which orders the app tabs."""
	return [_get_app_title(app) for app in frappe.get_installed_apps()]


def _get_tab(field, apps: dict[str, str]) -> str:
	if not field.is_system_generated:
		return CUSTOM

	app = apps.get(field.module)
	return _get_app_title(app) if app else OTHER


def _get_module_apps(modules: set[str]) -> dict[str, str]:
	if not modules:
		return {}

	return dict(
		frappe.get_all(
			"Module Def", filters={"name": ("in", list(modules))}, fields=["name", "app_name"], as_list=True
		)
	)


def _get_app_title(app: str) -> str:
	return (frappe.get_hooks("app_title", app_name=app) or [app])[0]
