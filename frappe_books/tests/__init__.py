"""Shared test support for Frappe Books."""

import unittest

import frappe

HAS_ERPNEXT = "erpnext" in frappe.get_installed_apps()

needs_erpnext = unittest.skipUnless(HAS_ERPNEXT, "needs ERPNext")

