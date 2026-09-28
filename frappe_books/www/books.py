"""Boot context for the standalone Frappe Books Vue application."""

import json
import re
from urllib.parse import urlencode

import frappe
import frappe.sessions
from frappe import _
from frappe.utils.jinja_globals import is_rtl

from frappe_books.coa import chart_options
from frappe_books.permissions import get_schema_permissions, has_app_permission
from frappe_books.settings import regional_code

no_cache = 1
SCRIPT_TAG_PATTERN = re.compile(r"\<script[^<]*\</script\>", re.IGNORECASE)
CLOSING_SCRIPT_TAG_PATTERN = re.compile(r"</script\>", re.IGNORECASE)


def get_context(context):
	_require_books_access()
	context.no_cache = 1
	context.boot = _get_boot()
	# Direct visits have no token yet. Generating one stores it in the session, so the check runs.
	context.csrf_token = frappe.sessions.get_csrf_token()
	context.app_name = (
		frappe.get_website_settings("app_name") or frappe.get_system_settings("app_name") or "Frappe"
	)
	context.layout_direction = "rtl" if is_rtl() else "ltr"
	context.lang = frappe.local.lang
	context.books_boot = json.dumps(_books_boot())
	return context


def _require_books_access():
	"""Send a logged out visitor to the login page and refuse users without Books access."""
	if frappe.session.user == "Guest":
		frappe.response["status_code"] = 403
		frappe.msgprint(_("Log in to access this page."))
		frappe.redirect(f"/login?{urlencode({'redirect-to': frappe.request.path})}")
	if frappe.session.data.user_type == "Website User" or not has_app_permission():
		frappe.throw(_("You are not permitted to access this page."), frappe.PermissionError)


def _get_boot():
	try:
		boot = frappe.sessions.get()
	except Exception as exc:
		raise frappe.SessionBootFailed from exc
	boot_json = frappe.as_json(boot, indent=None, separators=(",", ":"))
	boot_json = SCRIPT_TAG_PATTERN.sub("", boot_json)
	boot_json = CLOSING_SCRIPT_TAG_PATTERN.sub("", boot_json)
	return json.dumps(boot_json)


def _books_boot():
	return {
		"country_code": regional_code(),
		"setup_complete": bool(frappe.db.get_single_value("Books Accounting Settings", "setup_complete")),
		"app_version": frappe.get_attr("frappe_books.__version__"),
		"developer_mode": bool(frappe.conf.developer_mode),
		"permissions": get_schema_permissions(),
		"charts_of_accounts": chart_options(),
	}
