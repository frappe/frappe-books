"""Run database regressions on SQLite, MariaDB, and PostgreSQL sites."""

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import getdate

from frappe_books.migrations import normalize_ledger_dates
from frappe_books.patches import sync_numeric_name_series
from frappe_books.tests.accounting import make_account


class IntegrationTestDatabaseCompatibility(IntegrationTestCase):
	def test_numeric_series_continues_after_large_legacy_names(self):
		legacy_name = "2000000000"
		for name in (legacy_name, "legacy-hash-name"):
			frappe.get_doc({"doctype": "Books Item Enquiry", "item": "Legacy enquiry"}).insert(set_name=name)

		sync_numeric_name_series.execute()
		first = frappe.get_doc({"doctype": "Books Item Enquiry", "item": "New enquiry"}).insert()
		sync_numeric_name_series.execute()
		second = frappe.get_doc({"doctype": "Books Item Enquiry", "item": "Next enquiry"}).insert()

		self.assertGreater(int(first.name), int(legacy_name))
		self.assertEqual(int(second.name), int(first.name) + 1)

	def test_ledger_date_repair_preserves_native_dates(self):
		entry = self._make_ledger_entry("2026-09-01")

		normalize_ledger_dates()
		normalize_ledger_dates()

		self.assertEqual(getdate(entry.reload().posting_date), getdate("2026-09-01"))

	def test_ledger_date_repair_truncates_legacy_sqlite_timestamps(self):
		if frappe.db.db_type != "sqlite":
			self.skipTest("Only SQLite can store a timestamp in a Date column")
		entry = self._make_ledger_entry("2026-09-01")
		ledger = frappe.qb.DocType("Books Ledger Entry")
		(
			frappe.qb.update(ledger)
			.set(ledger.posting_date, "2026-09-01 12:34:56")
			.where(ledger.name == entry.name)
		).run()

		normalize_ledger_dates()
		normalize_ledger_dates()

		stored = frappe.qb.from_(ledger).select(ledger.posting_date).where(ledger.name == entry.name).run()
		self.assertEqual(str(stored[0][0]), "2026-09-01")

	def _make_ledger_entry(self, posting_date):
		account = make_account("Database date repair")
		return frappe.get_doc(
			{
				"doctype": "Books Ledger Entry",
				"account": account.name,
				"posting_date": posting_date,
				"debit": 12.34,
			}
		).insert()
