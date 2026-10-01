# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, now_datetime

from frappe_books.commerce.pos import open_shift_name
from frappe_books.frappe_books.doctype.books_pos_opening_shift.books_pos_opening_shift import get_open_shift
from frappe_books.tests.accounting import ensure_user, ledger_entries, make_account, root_group, unique_name


class IntegrationTestBooksPosOpeningShift(IntegrationTestCase):
	def setUp(self):
		self.counter = set_pos_accounts()

	def test_submitted_shift_is_open_and_posts_float(self):
		shift = open_shift(100)

		self.assertEqual(open_shift_name(), shift.name)
		self.assertEqual(get_open_shift(), shift.name)
		entries = ledger_entries("Books Journal Entry", shift.journal_entry)
		self.assertEqual(debits(entries, self.counter), Decimal("100"))
		self.assertEqual(credits(entries, "Cash"), Decimal("100"))

	def test_shift_is_dated_when_it_opens(self):
		draft = make_opening_shift(0)
		draft.opening_date = add_days(now_datetime(), -1)
		draft.insert()
		self.assertEqual(getdate(draft.opening_date), getdate(add_days(now_datetime(), -1)))

		draft.submit()

		self.assertEqual(getdate(draft.reload().opening_date), getdate(now_datetime()))

	def test_opening_cash_cannot_be_negative(self):
		shift = make_opening_shift(100)
		shift.opening_cash[0].count = -1

		self.assertRaisesRegex(
			frappe.ValidationError, "Opening Cash Amount can not be negative.", shift.insert
		)

	def test_a_shift_needs_the_counter_cash_account(self):
		frappe.db.set_single_value("Books Pos Settings", "cash_account", None)

		message = "POS Counter Cash Account is not set. Please set it on POS Settings"
		self.assertRaisesRegex(frappe.ValidationError, message, open_shift, 0)

	def test_preview_fills_the_cash_amount_with_the_counted_cash(self):
		draft = make_opening_shift(0)
		draft.opening_cash = []
		draft.append("opening_cash", {"denomination": 50, "count": 3})

		draft.preview()

		self.assertIsNone(draft.name)
		self.assertEqual([row.amount for row in draft.opening_amounts], [150, 0])

	def test_preview_needs_the_right_to_open_a_shift(self):
		with self.set_user(ensure_user("books-pos-shift-preview-stranger@example.com")):
			self.assertRaises(frappe.PermissionError, make_opening_shift(100).preview)

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

	def test_open_shift_is_read_with_shift_permission(self):
		open_shift(0)

		with self.set_user(ensure_user("books-pos-shift-no-role@example.com")):
			self.assertRaises(frappe.PermissionError, get_open_shift)

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
			{
				"doctype": "Books Account",
				"account_name": "Cash",
				"parent_books_account": root_group("Asset"),
				"account_type": "Cash",
			}
		).insert()
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
