from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, now_datetime, nowdate

from frappe_books.accounting.returns import map_return
from frappe_books.commerce.loyalty import expire_programs_and_points, get_available_points
from frappe_books.tests.accounting import (
	ledger_entries,
	make_account,
	make_invoice,
	make_item,
	make_party,
	unique_name,
)


class IntegrationTestLoyalty(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Commerce Receivable", account_type="Receivable")
		self.income = make_account("Commerce Sales", root_type="Income", account_type="Income Account")
		self.expense = make_account("Commerce Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		self.party = make_party(self.receivable.name)
		self.item = make_item(self.income.name, self.expense.name)

	def test_loyalty_earning_redemption_and_cancel(self):
		program = self._loyalty_program()
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			loyalty_program=program.name,
		)
		invoice.submit()
		self.assertEqual(frappe.db.get_value("Books Party", self.party.name, "loyalty_points"), 180)

		redemption = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			loyalty_program=program.name,
			redeem_loyalty_points=1,
			loyalty_points=20,
		)
		self.assertEqual(Decimal(str(redemption.grand_total)), Decimal("170"))
		self.assertEqual(Decimal(str(redemption.as_dict().loyalty_points_amount)), Decimal("10"))
		redemption.submit()
		self.assertEqual(frappe.db.get_value("Books Party", self.party.name, "loyalty_points"), 160)
		entries = ledger_entries(redemption.doctype, redemption.name)
		self.assertEqual(sum(Decimal(str(row.debit or 0)) for row in entries), Decimal("200"))
		self.assertEqual(sum(Decimal(str(row.credit or 0)) for row in entries), Decimal("200"))
		redemption.cancel()
		self.assertEqual(frappe.db.get_value("Books Party", self.party.name, "loyalty_points"), 180)

	def test_expiry_job_disables_program_and_expires_points(self):
		program = self._loyalty_program()
		frappe.db.set_value(
			"Books Loyalty Program",
			program.name,
			{"from_date": add_days(nowdate(), -2), "to_date": add_days(nowdate(), -1)},
		)
		frappe.get_doc(
			{
				"doctype": "Books Loyalty Point Entry",
				"loyalty_program": program.name,
				"customer": self.party.name,
				"invoice": self._submitted_invoice().name,
				"loyalty_points": 50,
				"purchase_amount": 50,
				"posting_date": add_days(nowdate(), -2),
				"expiry_date": add_days(nowdate(), -1),
			}
		).insert()
		frappe.db.set_value("Books Party", self.party.name, "loyalty_points", 50)

		expire_programs_and_points()

		self.assertEqual(program.db_get("is_enabled"), 0)
		self.assertEqual(program.db_get("status"), "Expired")
		self.assertEqual(frappe.db.get_value("Books Party", self.party.name, "loyalty_points"), 0)

	def test_points_expire_only_when_the_program_sets_an_expiry(self):
		for expiry_duration, available in ((None, 180), (1, 0)):
			with self.subTest(expiry_duration=expiry_duration):
				program = self._loyalty_program(
					from_date=add_days(nowdate(), -5), expiry_duration=expiry_duration
				)
				make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					self.item.name,
					self.income.name,
					date=add_days(now_datetime(), -2),
					loyalty_program=program.name,
				).submit()

				self.assertEqual(get_available_points(self.party.name, program.name), available)

	def test_status_follows_the_server_rules(self):
		for values, status in (
			({"is_enabled": 0}, "Disabled"),
			({"to_date": nowdate()}, "Active"),
			({"from_date": add_days(nowdate(), -2), "to_date": add_days(nowdate(), -1)}, "Expired"),
		):
			with self.subTest(status=status):
				self.assertEqual(self._loyalty_program(**values).status, status)

	def test_usage_says_what_books_says_at_its_fields(self):
		for values, message in (
			({"used": -1}, "Used count cannot be negative"),
			({"maximum_use": -1}, "Maximum use cannot be negative"),
			({"maximum_use": 2, "used": 3}, "Used count cannot exceed maximum use limit"),
		):
			with self.subTest(message=message), self.assertRaises(frappe.ValidationError) as raised:
				self._loyalty_program(**values)
			self.assertEqual(str(raised.exception), message)

	def test_status_is_maxed_at_the_use_limit(self):
		program = self._loyalty_program(maximum_use=1)
		self._loyalty_invoice(program).submit()
		redemption = self._loyalty_invoice(program, redeem_loyalty_points=1, loyalty_points=10).submit()
		self.assertEqual(program.db_get("status"), "Maxed")

		redemption.cancel()
		self.assertEqual(program.db_get("status"), "Disabled")

	def test_inactive_program_only_blocks_redemption(self):
		program = self._loyalty_program()
		program.db_set("is_enabled", 0)
		invoice = self._loyalty_invoice(program).submit()
		self.assertEqual(invoice.db_get("docstatus"), 1)
		self.assertEqual(get_available_points(self.party.name, program.name), 0)

		with self.assertRaisesRegex(frappe.ValidationError, "is disabled"):
			self._loyalty_invoice(program, redeem_loyalty_points=1, loyalty_points=10)

	def test_points_to_redeem_must_be_above_zero(self):
		program = self._loyalty_program()
		self._loyalty_invoice(program).submit()

		with self.assertRaisesRegex(frappe.ValidationError, "Points must be greater than 0"):
			self._loyalty_invoice(program, redeem_loyalty_points=1, loyalty_points=0)

	def test_redemption_is_capped_by_the_total_before_redemption(self):
		program = self._loyalty_program()
		self._loyalty_invoice(program).submit()
		self._loyalty_invoice(program).submit()

		redemption = self._loyalty_invoice(program, redeem_loyalty_points=1, loyalty_points=240)
		self.assertEqual(Decimal(str(redemption.grand_total)), Decimal("60"))

	def test_cancel_does_not_enable_a_disabled_program(self):
		program = self._loyalty_program(maximum_use=1)
		self._loyalty_invoice(program).submit()
		redemption = self._loyalty_invoice(program, redeem_loyalty_points=1, loyalty_points=10).submit()
		self.assertEqual(program.db_get("is_enabled"), 0)

		redemption.cancel()
		self.assertEqual(program.db_get("used"), 0)
		self.assertEqual(program.db_get("is_enabled"), 0)

	def test_redemption_uses_the_soonest_expiring_points_first(self):
		invoice = self._submitted_invoice()
		program = self._loyalty_program()
		for points, days in ((100, 5), (50, 60)):
			self._point_entry(program, invoice, points, add_days(nowdate(), days))
		self._loyalty_invoice(program, redeem_loyalty_points=1, loyalty_points=120).submit()

		self.assertEqual(get_available_points(self.party.name, program.name), 30)
		later = add_days(nowdate(), 10)
		self.assertEqual(get_available_points(self.party.name, program.name, on_date=later), 30)

	def test_return_cannot_take_back_points_already_redeemed(self):
		program = self._loyalty_program()
		invoice = self._loyalty_invoice(program).submit()
		self._loyalty_invoice(program, redeem_loyalty_points=1, loyalty_points=180).submit()
		credit_note = map_return(invoice.doctype, invoice.name).insert()

		with self.assertRaisesRegex(frappe.ValidationError, "already redeemed"):
			credit_note.submit()

	def test_returning_a_redemption_gives_the_points_back(self):
		program = self._loyalty_program()
		self._loyalty_invoice(program).submit()
		redemption = self._loyalty_invoice(program, redeem_loyalty_points=1, loyalty_points=40).submit()
		self.assertEqual(self._points(), 140)

		partial = map_return(redemption.doctype, redemption.name)
		partial.items[0].quantity = -1
		partial.insert().submit()
		self.assertEqual((partial.loyalty_points, partial.grand_total), (-20, -80))
		self.assertEqual(self._points(), 160)
		entries = ledger_entries(partial.doctype, partial.name)
		self.assertEqual(sum(row.debit for row in entries), sum(row.credit for row in entries))

		rest = map_return(redemption.doctype, redemption.name).insert().submit()
		self.assertEqual(rest.loyalty_points, -20)
		self.assertEqual(self._points(), 180)

		rest.cancel()
		self.assertEqual(self._points(), 160)
		self.assertEqual(program.db_get("used"), 1)

	def test_invoice_takes_the_customers_program(self):
		other = self._loyalty_program()
		program = self._loyalty_program()
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			loyalty_program=other.name,
		)
		self.assertEqual(invoice.loyalty_program, program.name)

		self.party.db_set("loyalty_program", None)
		invoice.save()
		self.assertIsNone(invoice.loyalty_program)

	def _points(self):
		return frappe.db.get_value("Books Party", self.party.name, "loyalty_points")

	def _loyalty_invoice(self, program, **values):
		return make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			loyalty_program=program.name,
			**values,
		)

	def _point_entry(self, program, invoice, points, expiry_date):
		frappe.get_doc(
			{
				"doctype": "Books Loyalty Point Entry",
				"loyalty_program": program.name,
				"customer": self.party.name,
				"invoice": invoice.name,
				"loyalty_points": points,
				"purchase_amount": points,
				"posting_date": nowdate(),
				"expiry_date": expiry_date,
			}
		).insert()

	def _loyalty_program(self, **values):
		"""Make a program and give it to the test customer."""
		program = frappe.get_doc(
			{
				"doctype": "Books Loyalty Program",
				"name": unique_name("Rewards"),
				"from_date": add_days(nowdate(), -1),
				"to_date": add_days(nowdate(), 30),
				"conversion_factor": 0.5,
				"expiry_duration": 30,
				"expense_account": self.expense.name,
				"collection_rules": [{"tier_name": "Base", "collection_factor": 1, "minimum_total_spent": 0}],
				**values,
			}
		).insert()
		self.party.db_set("loyalty_program", program.name)
		return program

	def _submitted_invoice(self):
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
		)
		invoice.submit()
		return invoice
