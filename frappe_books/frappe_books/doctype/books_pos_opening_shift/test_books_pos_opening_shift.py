# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import now_datetime

from frappe_books.commerce.pos import open_shift_name
from frappe_books.tests.accounting import ledger_entries, make_account, unique_name
from frappe_books.ui_bridge.bespoke import BooksBespokeQueries


class IntegrationTestBooksPosOpeningShift(IntegrationTestCase):
	def setUp(self):
		self.counter = set_pos_accounts()

	def test_submitted_shift_is_open_and_posts_float(self):
		shift = open_shift(100)

		self.assertEqual(open_shift_name(), shift.name)
		self.assertEqual(BooksBespokeQueries().call("getOpenPOSShift", []), shift.name)
		entries = ledger_entries("Books Journal Entry", shift.journal_entry)
		self.assertEqual(debits(entries, self.counter), Decimal("100"))
		self.assertEqual(credits(entries, "Cash"), Decimal("100"))

	def test_draft_shift_is_not_open(self):
		make_opening_shift(100).insert()

		self.assertIsNone(open_shift_name())

	def test_only_one_shift_can_be_open(self):
		open_shift(0)

		with self.assertRaisesRegex(frappe.ValidationError, "already open"):
			open_shift(0)

	def test_submitted_shift_cannot_be_edited_or_deleted(self):
		shift = open_shift(100)

		shift.opening_date = now_datetime()
		self.assertRaises(frappe.UpdateAfterSubmitError, shift.save)
		self.assertRaises(frappe.ValidationError, frappe.delete_doc, shift.doctype, shift.name)

	def test_cancel_reverses_float_and_closes_shift(self):
		shift = open_shift(100)

		shift.cancel()

		self.assertIsNone(open_shift_name())
		self.assertEqual(frappe.db.get_value("Books Journal Entry", shift.journal_entry, "docstatus"), 2)

	def test_point_of_sale_cannot_be_disabled_while_shift_is_open(self):
		settings = frappe.get_single("Books Inventory Settings")
		settings.enable_point_of_sale = 1
		settings.save()
		open_shift(0)

		settings.enable_point_of_sale = 0
		self.assertRaisesRegex(frappe.ValidationError, "Close the open POS shift", settings.save)

	def test_user_cannot_cancel_shift(self):
		shift = open_shift(0)
		user = make_user("Books User")

		with self.set_user(user):
			self.assertRaises(frappe.PermissionError, frappe.get_doc(shift.doctype, shift.name).cancel)


def set_pos_accounts():
	"""Configure POS accounts and start without an open shift, as tests in a class share one transaction."""
	while shift := open_shift_name():
		frappe.get_doc("Books Pos Opening Shift", shift).cancel()
	counter = make_account("POS Counter", account_type="Cash")
	write_off = make_account("POS Write Off", root_type="Expense", account_type="Expense Account")
	frappe.db.set_single_value(
		"Books Pos Settings",
		{
			"cash_account": counter.name,
			"write_off_account": write_off.name,
			"default_account": counter.name,
			"can_change_rate": 1,
			"can_edit_discount": 1,
		},
	)
	if not frappe.db.exists("Books Account", "Cash"):
		frappe.get_doc(
			{"doctype": "Books Account", "account_name": "Cash", "root_type": "Asset", "account_type": "Cash"}
		).insert()
	if not frappe.db.exists("Books Payment Method", "Bank"):
		frappe.get_doc({"doctype": "Books Payment Method", "name": "Bank", "type": "Bank"}).insert()
	return counter.name


def start_pos_shift():
	"""Configure POS accounts and open an empty shift, as POS invoices need one."""
	set_pos_accounts()
	return open_shift(0)


def make_opening_shift(cash):
	return frappe.get_doc(
		{
			"doctype": "Books Pos Opening Shift",
			"opening_date": now_datetime(),
			"opening_cash": [{"denomination": cash, "count": 1}] if cash else [],
			"opening_amounts": [
				{"payment_method": "Cash", "amount": cash},
				{"payment_method": "Bank", "amount": 0},
			],
		}
	)


def open_shift(cash):
	shift = make_opening_shift(cash).insert()
	shift.submit()
	return shift


def make_user(role):
	return (
		frappe.get_doc(
			{
				"doctype": "User",
				"email": f"{frappe.generate_hash(length=8)}@example.com",
				"first_name": unique_name("POS"),
				"roles": [{"role": role}],
			}
		)
		.insert()
		.name
	)


def debits(entries, account):
	return sum(Decimal(str(row.debit or 0)) for row in entries if row.account == account)


def credits(entries, account):
	return sum(Decimal(str(row.credit or 0)) for row in entries if row.account == account)
