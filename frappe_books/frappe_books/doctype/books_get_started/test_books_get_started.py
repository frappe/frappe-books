# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and Contributors
# See license.txt

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.tests.accounting import make_account, make_item, make_party


class IntegrationTestBooksGetStarted(IntegrationTestCase):
	def test_record_tasks_are_checked_when_read(self):
		income = make_account("Get Started Sales", root_type="Income", account_type="Income Account")
		expense = make_account("Get Started Expense", root_type="Expense", account_type="Expense Account")
		make_item(income.name, expense.name, item_usage="Both")
		make_party(make_account("Get Started Receivable", account_type="Receivable").name, role="Customer")

		checks = frappe.get_single("Books Get Started").as_dict()

		self.assertEqual(
			(checks.sales_item_created, checks.purchase_item_created, checks.customer_created), (1, 1, 1)
		)

	def test_saving_a_task_keeps_the_record_checks_computed(self):
		make_party(make_account("Get Started Payable", account_type="Payable").name, role="Supplier")

		checks = frappe.get_single("Books Get Started")
		checks.update({"print_setup": 1, "supplier_created": 0})
		checks.save()

		self.assertEqual((checks.print_setup, checks.supplier_created), (1, 1))
