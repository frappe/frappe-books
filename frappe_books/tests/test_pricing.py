from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, nowdate

from frappe_books.tests.accounting import (
	ensure_user,
	foreign_currency,
	make_account,
	make_invoice,
	make_item,
	make_party,
	unique_name,
)


class IntegrationTestPricing(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Commerce Receivable", account_type="Receivable")
		self.income = make_account("Commerce Sales", root_type="Income", account_type="Income Account")
		self.expense = make_account("Commerce Expense", root_type="Expense", account_type="Expense Account")
		frappe.db.set_single_value("Books Accounting Settings", "discount_account", self.expense.name)
		self.party = make_party(self.receivable.name)
		self.item = make_item(self.income.name, self.expense.name)

	def test_price_discount_and_coupon_usage(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		rule = self._pricing_rule(
			is_coupon_code_based=1,
			price_discount_type="percentage",
			discount_percentage=25,
		)
		coupon = frappe.get_doc(
			{
				"doctype": "Books Coupon Code",
				"coupon_name": "Save Twenty Five",
				"pricing_rule": rule.name,
				"valid_from": add_days(nowdate(), -1),
				"valid_to": add_days(nowdate(), 1),
				"maximum_use": 2,
			}
		).insert()
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			coupons=[{"coupons": coupon.name}],
		)

		self.assertEqual(coupon.name, "SAVETWEN")
		self.assertEqual(Decimal(str(invoice.grand_total)), Decimal("150"))
		self.assertEqual(invoice.items[0].pricing_rule, rule.name)
		invoice.submit()
		self.assertEqual(frappe.db.get_value("Books Coupon Code", coupon.name, "used"), 1)
		invoice.cancel()
		self.assertEqual(frappe.db.get_value("Books Coupon Code", coupon.name, "used"), 0)

	def test_coupon_accepts_iso_date_values(self):
		valid_from = getdate(add_days(nowdate(), -1))
		valid_to = getdate(add_days(nowdate(), 30))
		rule = self._pricing_rule(
			is_coupon_code_based=1,
			price_discount_type="percentage",
			discount_percentage=10,
			valid_from=valid_from,
			valid_to=valid_to,
		)
		coupon = frappe.get_doc(
			{
				"doctype": "Books Coupon Code",
				"coupon_name": unique_name("ISO Date Coupon"),
				"pricing_rule": rule.name,
				"valid_from": valid_from.isoformat(),
				"valid_to": valid_to.isoformat(),
				"maximum_use": 1,
			}
		).insert()

		self.assertEqual(getdate(coupon.valid_from), valid_from)
		self.assertEqual(getdate(coupon.valid_to), valid_to)

	def test_coupon_validity_is_one_day_or_more(self):
		rule = self._pricing_rule(is_coupon_code_based=1)
		self._coupon(rule, valid_from=nowdate(), valid_to=nowdate())
		with self.assertRaisesRegex(frappe.ValidationError, "on or before Valid To"):
			self._coupon(rule, valid_from=nowdate(), valid_to=add_days(nowdate(), -1))

	def test_rule_limits_say_what_books_says_at_their_fields(self):
		for values, message in (
			(
				{"min_quantity": 6, "max_quantity": 5},
				"Minimum Quantity should be less than the Maximum Quantity.",
			),
			({"min_amount": 10, "max_amount": 10}, "Minimum Amount should be less than the Maximum Amount."),
			(
				{"valid_from": nowdate(), "valid_to": add_days(nowdate(), -1)},
				"Valid From Date should be less than Valid To Date.",
			),
		):
			with self.subTest(message=message), self.assertRaises(frappe.ValidationError) as raised:
				self._pricing_rule(**values)
			self.assertEqual(str(raised.exception), message)

	def test_an_edited_upper_limit_says_what_books_says_at_it(self):
		rule = self._pricing_rule(
			min_quantity=2, max_quantity=5, min_amount=10, max_amount=20, valid_from=nowdate()
		)
		for values, message in (
			({"max_quantity": 1}, "Maximum Quantity should be greater than the Minimum Quantity."),
			({"max_amount": 10}, "Maximum Amount should be greater than the Minimum Amount."),
			({"valid_to": add_days(nowdate(), -1)}, "Valid To Date should be greater than Valid From Date."),
		):
			edited = frappe.get_doc("Books Pricing Rule", rule.name).update(values)
			with self.subTest(message=message), self.assertRaises(frappe.ValidationError) as raised:
				edited.save()
			self.assertEqual(str(raised.exception), message)

	def test_product_discount_adds_free_item(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		free_item = make_item(self.income.name, self.expense.name)
		rule = self._pricing_rule(
			discount_type="Product Discount",
			free_item=free_item.name,
			free_item_quantity=1,
			free_item_unit="Unit",
		)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
		)

		self.assertEqual(len(invoice.items), 2)
		free_row = next(row for row in invoice.items if row.is_free_item)
		self.assertEqual(free_row.item, free_item.name)
		self.assertEqual(free_row.pricing_rule, rule.name)
		self.assertEqual(invoice.grand_total, 180)

	def test_free_item_comes_in_the_rule_unit(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		box = frappe.get_doc({"doctype": "Books Uom", "name": unique_name("Box")}).insert()
		free_item = make_item(
			self.income.name, self.expense.name, uom_conversions=[{"uom": box.name, "conversion_factor": 12}]
		)
		self._pricing_rule(
			discount_type="Product Discount",
			free_item=free_item.name,
			free_item_quantity=1,
			free_item_unit=box.name,
		)
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, self.item.name, self.income.name
		)

		free_row = next(row for row in invoice.items if row.is_free_item)
		self.assertEqual(free_row.transfer_unit, box.name)
		self.assertEqual(free_row.transfer_quantity, 1)
		self.assertEqual(free_row.quantity, 12)
		with self.assertRaisesRegex(frappe.ValidationError, "not applicable"):
			self._pricing_rule(
				discount_type="Product Discount",
				free_item=self.item.name,
				free_item_quantity=1,
				free_item_unit=box.name,
			)

	def test_recursive_rule_gives_its_quantity_for_every_stock_units(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		box = frappe.get_doc({"doctype": "Books Uom", "name": unique_name("Box")}).insert()
		item = make_item(
			self.income.name, self.expense.name, uom_conversions=[{"uom": box.name, "conversion_factor": 12}]
		)
		self._pricing_rule(
			applied_items=[{"item": item.name}],
			discount_type="Product Discount",
			free_item=item.name,
			free_item_quantity=2,
			is_recursive=1,
			recurse_every=12,
		)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			item.name,
			self.income.name,
			items=[{"item": item.name, "transfer_unit": box.name, "transfer_quantity": 3, "rate": 10}],
		)

		free_row = next(row for row in invoice.items if row.is_free_item)
		self.assertEqual(free_row.quantity, 6)

	def test_rule_values_reset_when_rule_stops_applying(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		for values in (
			{"price_discount_type": "percentage", "discount_percentage": 25},
			{"price_discount_type": "rate", "discount_rate": 80},
		):
			with self.subTest(values=values):
				self.item = make_item(self.income.name, self.expense.name, rate=100)
				rule = self._pricing_rule(min_quantity=2, **values)
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					self.item.name,
					self.income.name,
				)
				invoice.items[0].update({"rate": None, "item_discount_percent": 0})
				invoice.save()
				self.assertEqual(invoice.items[0].pricing_rule, rule.name)
				self.assertEqual(invoice.grand_total, 150 if "discount_percentage" in values else 160)

				invoice.items[0].quantity = 1
				invoice.save()
				self.assertFalse(invoice.items[0].pricing_rule)
				self.assertEqual(invoice.grand_total, 100)

	def test_rule_values_and_limits_are_in_company_currency(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		for values, rate, fieldname, expected in (
			({"price_discount_type": "rate", "discount_rate": 80}, None, "rate", 40),
			({"price_discount_type": "amount", "discount_amount": 10}, 100, "item_discount_amount", 5),
			(
				{"price_discount_type": "percentage", "discount_percentage": 10, "min_amount": 150},
				100,
				"item_discount_percent",
				10,
			),
		):
			with self.subTest(values=values):
				self.item = make_item(self.income.name, self.expense.name, rate=100)
				self._pricing_rule(**values)
				invoice = make_invoice(
					"Books Sales Invoice",
					make_party(self.receivable.name, currency=foreign_currency()).name,
					self.receivable.name,
					self.item.name,
					self.income.name,
					exchange_rate=2,
				)
				invoice.items[0].update({"rate": rate, "quantity": 1, "item_discount_percent": 0})
				invoice.save()

				self.assertEqual(invoice.items[0].get(fieldname), expected)

	def test_empty_rate_comes_from_price_list_in_invoice_currency(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_price_list", 1)
		item = make_item(self.income.name, self.expense.name, rate=100)
		price_list = frappe.get_doc(
			{
				"doctype": "Books Price List",
				"name": unique_name("Price List"),
				"is_enabled": 1,
				"is_sales": 1,
				"price_list_item": [{"item": item.name, "unit": "Unit", "rate": 90}],
			}
		).insert()
		for price_list_name, rate in ((price_list.name, 45), (None, 50)):
			with self.subTest(price_list=price_list_name):
				invoice = make_invoice(
					"Books Sales Invoice",
					make_party(self.receivable.name, currency=foreign_currency()).name,
					self.receivable.name,
					item.name,
					self.income.name,
					price_list=price_list_name,
					exchange_rate=2,
				)
				invoice.items[0].rate = None
				invoice.save()
				self.assertEqual(invoice.items[0].rate, rate)

	def test_invoice_takes_only_an_enabled_price_list_for_its_side(self):
		payable = make_account("Commerce Payable", root_type="Liability", account_type="Payable")
		supplier = make_party(payable.name, role="Supplier")
		for values, doctype, party, account, message in (
			({"is_enabled": 0}, "Books Sales Invoice", self.party, self.receivable, "is disabled"),
			(
				{"is_sales": 0, "is_purchase": 1},
				"Books Sales Quote",
				self.party,
				self.receivable,
				"not for Sales",
			),
			({}, "Books Purchase Invoice", supplier, payable, "not for Purchases"),
		):
			price_list = frappe.get_doc(
				{"doctype": "Books Price List", "name": unique_name("Price List"), **values}
			).insert()
			with self.subTest(doctype=doctype), self.assertRaisesRegex(frappe.ValidationError, message):
				make_invoice(
					doctype,
					party.name,
					account.name,
					self.item.name,
					self.income.name,
					price_list=price_list.name,
				)

	def test_price_list_rate_is_charged_per_stock_unit(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_price_list", 1)
		box = frappe.get_doc({"doctype": "Books Uom", "name": unique_name("Box")}).insert()
		item = make_item(
			self.income.name,
			self.expense.name,
			rate=100,
			uom_conversions=[{"uom": box.name, "conversion_factor": 12}],
		)
		for unit, price, rate in ((box.name, 120, 10), ("Unit", 9, 9)):
			with self.subTest(unit=unit):
				price_list = frappe.get_doc(
					{
						"doctype": "Books Price List",
						"name": unique_name("Price List"),
						"is_enabled": 1,
						"is_sales": 1,
						"price_list_item": [{"item": item.name, "unit": unit, "rate": price}],
					}
				).insert()
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					item.name,
					self.income.name,
					price_list=price_list.name,
				)
				invoice.items[0].update({"rate": None, "transfer_unit": box.name, "transfer_quantity": 2})
				invoice.save()

				self.assertEqual(invoice.items[0].rate, rate)
				self.assertEqual(invoice.items[0].amount, rate * 24)

	def test_rule_without_unit_applies_in_the_item_unit(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		rule = self._pricing_rule(applied_items=[{"item": self.item.name}])
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, self.item.name, self.income.name
		)

		self.assertEqual(rule.applied_items[0].unit, "Unit")
		self.assertEqual(invoice.items[0].pricing_rule, rule.name)

	def test_price_list_holds_one_price_per_item_and_unit(self):
		price_list = frappe.get_doc(
			{
				"doctype": "Books Price List",
				"name": unique_name("Price List"),
				"price_list_item": [
					{"item": self.item.name, "rate": 90},
					{"item": self.item.name, "rate": 80},
				],
			}
		)
		with self.assertRaisesRegex(frappe.ValidationError, "already has a price"):
			price_list.insert()

	def test_price_list_item_without_unit_gets_the_item_unit(self):
		price_list = frappe.get_doc(
			{
				"doctype": "Books Price List",
				"name": unique_name("Price List"),
				"is_enabled": 1,
				"is_sales": 1,
				"price_list_item": [{"item": self.item.name, "rate": 90}],
			}
		).insert()

		self.assertEqual(price_list.price_list_item[0].unit, "Unit")

	def test_stale_coupon_save_cannot_reset_usage(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		rule = self._pricing_rule(is_coupon_code_based=1)
		coupon = self._coupon(rule, maximum_use=1)
		make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			coupons=[{"coupons": coupon.name}],
		).submit()

		coupon.min_amount = 1
		with self.assertRaises(frappe.TimestampMismatchError):
			coupon.save()

	def test_return_does_not_use_a_coupon(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		coupon = self._coupon(self._pricing_rule(is_coupon_code_based=1), maximum_use=1)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			coupons=[{"coupons": coupon.name}],
		).submit()
		credit_note = frappe.copy_doc(invoice)
		credit_note.update({"docstatus": 0, "return_against": invoice.name})
		credit_note.items[0].quantity = -2
		credit_note.insert().submit()

		self.assertEqual(coupon.db_get("used"), 1)

	def _coupon(self, rule, **values):
		return frappe.get_doc(
			{
				"doctype": "Books Coupon Code",
				"coupon_name": unique_name("Coupon"),
				"pricing_rule": rule.name,
				"valid_from": add_days(nowdate(), -1),
				"valid_to": add_days(nowdate(), 1),
				**values,
			}
		).insert()

	def test_price_list_and_pricing_rule_previews_fill_units_without_saving(self):
		sugar = make_item(self.income.name, self.expense.name, unit="Kg")
		price_list = frappe.new_doc("Books Price List")
		price_list.name = unique_name("Preview Prices")
		price_list.append("price_list_item", {"item": sugar.name, "rate": 5})
		rule = frappe.new_doc("Books Pricing Rule")
		rule.append("applied_items", {"item": sugar.name})

		price_list.preview()
		rule.preview()

		self.assertEqual(price_list.price_list_item[0].unit, "Kg")
		self.assertEqual(rule.applied_items[0].unit, "Kg")
		self.assertFalse(frappe.db.exists("Books Price List", price_list.name))

	def test_previews_need_the_right_to_make_the_document(self):
		with self.set_user(ensure_user("books-pricing-preview@example.com")):
			for doctype in ("Books Price List", "Books Pricing Rule"):
				with self.assertRaises(frappe.PermissionError):
					frappe.new_doc(doctype).preview()

	def _pricing_rule(self, **values):
		data = {
			"doctype": "Books Pricing Rule",
			"title": unique_name("Promotion"),
			"applied_items": [{"item": self.item.name, "unit": "Unit"}],
			"discount_type": "Price Discount",
			"price_discount_type": "amount",
			"discount_amount": 10,
			"priority": "10",
			**values,
		}
		return frappe.get_doc(data).insert()
