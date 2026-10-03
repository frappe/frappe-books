import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.accounting import settlement
from frappe_books.accounting.returns import map_return
from frappe_books.tests.accounting import make_account, make_invoice, make_item, make_party, make_tax


class IntegrationTestSettlement(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Receivable", account_type="Receivable").name
		self.income = make_account("Sales", root_type="Income", account_type="Income Account").name
		expense = make_account("Expense", root_type="Expense", account_type="Expense Account").name
		tax = make_tax(make_account("Tax", root_type="Liability", account_type="Tax").name)
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", expense)
		self.party = make_party(self.receivable).name
		self.item = make_item(self.income, expense, tax.name).name

	def test_allocations_settle_an_invoice_and_reversing_one_restores_it(self):
		# 2 x 100 less 10% is 180, with 10% tax 198.
		invoice = self.submit_invoice()
		self.assertEqual(stored_balance(invoice), (198, "Unpaid"))

		for amount, reverse, balance in (
			(50, False, (148, "Partly Paid")),
			(148, False, (0, "Paid")),
			(148, True, (148, "Partly Paid")),
		):
			with self.subTest(amount=amount, reverse=reverse):
				settlement.settle(invoice.reload(), amount, reverse)
				self.assertEqual(stored_balance(invoice), balance)

	def test_a_credit_note_owes_its_total_back(self):
		credit_note = map_return("Books Sales Invoice", self.submit_invoice().name).insert()
		# A draft shows its total as positive, as the Books app does.
		self.assertEqual(credit_note.outstanding_amount, 198)

		credit_note.submit()
		self.assertEqual(stored_balance(credit_note), (-198, "Return"))
		self.assertEqual(settlement.due(credit_note), 198)

		settlement.settle(credit_note, 198)
		self.assertEqual(stored_balance(credit_note), (0, "Return"))

	def test_party_owes_its_open_invoices_and_a_cancelled_one_owes_nothing(self):
		invoice, other = self.submit_invoice(), self.submit_invoice()
		settlement.settle(other.reload(), 98)
		settlement.refresh_party(self.party)
		self.assertEqual(frappe.db.get_value("Books Party", self.party, "outstanding_amount"), 298)

		invoice.cancel()
		self.assertEqual(invoice.db_get("outstanding_amount"), 0)
		self.assertEqual(frappe.db.get_value("Books Party", self.party, "outstanding_amount"), 100)

	def submit_invoice(self):
		return make_invoice(
			"Books Sales Invoice", self.party, self.receivable, self.item, self.income, make_auto_payment=0
		).submit()


def stored_balance(invoice):
	return tuple(frappe.db.get_value(invoice.doctype, invoice.name, ["outstanding_amount", "status"]))
