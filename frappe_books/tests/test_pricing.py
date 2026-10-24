from decimal import Decimal

import frappe
from frappe.tests import IntegrationTestCase
from frappe.utils import add_days, getdate, nowdate

from frappe_books.accounting.money import company_currency
from frappe_books.commerce.pricing import row_pricing_rule
from frappe_books.frappe_books.doctype.books_pos_opening_shift.test_books_pos_opening_shift import (
	start_pos_shift,
)
from frappe_books.tests.accounting import (
	ensure_user,
	foreign_currency,
	make_account,
	make_customer,
	make_invoice,
	make_item,
	make_price_list,
	make_supplier,
	set_company_value,
	unique_name,
)


class IntegrationTestPricing(IntegrationTestCase):
	def setUp(self):
		self.receivable = make_account("Commerce Receivable", account_type="Receivable")
		self.income = make_account("Commerce Sales", root_type="Income", account_type="Income Account")
		self.expense = make_account("Commerce Expense", root_type="Expense", account_type="Expense Account")
		set_company_value("default_discount_account", self.expense.name)
		self.party = make_customer(self.receivable.name)
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
			coupon_code=coupon.name,
		)

		self.assertEqual(coupon.name, "SAVETWEN")
		self.assertEqual(Decimal(str(invoice.grand_total)), Decimal("150"))
		self.assertEqual(row_pricing_rule(invoice.items[0]), rule.name)
		self.assertEqual([row.pricing_rule for row in invoice.pricing_rules], [rule.name])
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
		self.assertEqual(free_row.item_code, free_item.name)
		self.assertEqual(row_pricing_rule(free_row), rule.name)
		self.assertEqual(invoice.grand_total, 180)

	def test_free_item_comes_in_the_rule_unit(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		box = frappe.get_doc({"doctype": "Books UOM", "uom_name": unique_name("Box")}).insert()
		free_item = make_item(
			self.income.name, self.expense.name, uoms=[{"uom": box.name, "conversion_factor": 12}]
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
		self.assertEqual(free_row.uom, box.name)
		self.assertEqual(free_row.qty, 1)
		self.assertEqual(free_row.stock_qty, 12)
		with self.assertRaisesRegex(frappe.ValidationError, "not applicable"):
			self._pricing_rule(
				discount_type="Product Discount",
				free_item=self.item.name,
				free_item_quantity=1,
				free_item_unit=box.name,
			)

	def test_recursive_rule_gives_its_quantity_for_every_stock_units(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		box = frappe.get_doc({"doctype": "Books UOM", "uom_name": unique_name("Box")}).insert()
		item = make_item(
			self.income.name, self.expense.name, uoms=[{"uom": box.name, "conversion_factor": 12}]
		)
		self._pricing_rule(
			applied_items=[{"item": item.name, "unit": box.name}],
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
			items=[{"item_code": item.name, "uom": box.name, "qty": 3, "price_list_rate": 120}],
		)

		free_row = next(row for row in invoice.items if row.is_free_item)
		self.assertEqual(free_row.stock_qty, 6)

	def test_rule_applies_to_rows_in_its_unit_at_its_unit_rate(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		box = frappe.get_doc({"doctype": "Books UOM", "uom_name": unique_name("Box")}).insert()
		item = make_item(
			self.income.name,
			self.expense.name,
			standard_rate=15,
			uoms=[{"uom": box.name, "conversion_factor": 12}],
		)
		rule = self._pricing_rule(
			applied_items=[{"item": item.name, "unit": box.name}],
			price_discount_type="rate",
			discount_rate=120,
		)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			item.name,
			self.income.name,
			items=[
				{"item_code": item.name, "uom": box.name, "qty": 1},
				{"item_code": item.name, "qty": 1},
			],
		)

		box_row, unit_row = invoice.items
		self.assertEqual(
			(row_pricing_rule(box_row), box_row.price_list_rate, box_row.stock_uom_rate), (rule.name, 120, 10)
		)
		self.assertEqual((row_pricing_rule(unit_row), unit_row.price_list_rate), (None, 15))

	def test_rule_takes_only_units_its_items_have(self):
		box = frappe.get_doc({"doctype": "Books UOM", "uom_name": unique_name("Box")}).insert()
		item = make_item(
			self.income.name, self.expense.name, uoms=[{"uom": box.name, "conversion_factor": 12}]
		)
		self._pricing_rule(applied_items=[{"item": item.name, "unit": unit} for unit in ("Unit", box.name)])
		with self.assertRaisesRegex(frappe.ValidationError, "not applicable"):
			self._pricing_rule(applied_items=[{"item": self.item.name, "unit": box.name}])

	def test_rule_counts_only_the_rows_in_its_units(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		box = frappe.get_doc({"doctype": "Books UOM", "uom_name": unique_name("Box")}).insert()
		for units, free_quantity in (((box.name,), 2), ((box.name, "Unit"), 3)):
			with self.subTest(units=units):
				item = make_item(
					self.income.name,
					self.expense.name,
					uoms=[{"uom": box.name, "conversion_factor": 12}],
				)
				self._pricing_rule(
					applied_items=[{"item": item.name, "unit": unit} for unit in units],
					discount_type="Product Discount",
					free_item=item.name,
					free_item_quantity=1,
					is_recursive=1,
					recurse_every=12,
				)
				box_row = {"item_code": item.name, "uom": box.name, "qty": 1, "price_list_rate": 120}
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					item.name,
					self.income.name,
					items=[box_row, box_row, {"item_code": item.name, "qty": 12, "price_list_rate": 10}],
				)

				free_rows = [row for row in invoice.items if row.is_free_item]
				self.assertEqual([row.stock_qty for row in free_rows], [free_quantity])
				self.assertEqual(len(invoice.pricing_rules), 1)

	def test_rule_whose_free_quantity_rounds_to_zero_is_skipped(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		self._pricing_rule(
			discount_type="Product Discount",
			free_item=self.item.name,
			free_item_quantity=1,
			is_recursive=1,
			recurse_every=5,
			round_free_item_qty=1,
			rounding_method="floor",
		)
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, self.item.name, self.income.name
		)

		self.assertEqual(len(invoice.items), 1)
		self.assertFalse(invoice.items[0].pricing_rules)
		self.assertFalse(invoice.pricing_rules)

	def test_free_item_counts_the_item_on_every_row_once(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		for values, free_quantity in (
			({"min_quantity": 5}, 1),
			(
				{"is_recursive": 1, "recurse_every": 5, "round_free_item_qty": 1, "rounding_method": "floor"},
				1,
			),
		):
			with self.subTest(values=values):
				self.item = make_item(self.income.name, self.expense.name)
				self._pricing_rule(
					discount_type="Product Discount", free_item=self.item.name, free_item_quantity=1, **values
				)
				row = {"item_code": self.item.name, "qty": 3, "price_list_rate": 10}
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					self.item.name,
					self.income.name,
					items=[row, row],
				)

				free_rows = [row for row in invoice.items if row.is_free_item]
				self.assertEqual([row.stock_qty for row in free_rows], [free_quantity])
				self.assertEqual(len(invoice.pricing_rules), 1)

	def test_rule_discount_amount_is_capped_at_the_row_amount(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		self._pricing_rule(price_discount_type="amount", discount_amount=10)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			items=[{"item_code": self.item.name, "qty": 1, "price_list_rate": 4}],
		)

		self.assertEqual(invoice.items[0].discount_amount, 4)
		self.assertEqual(invoice.grand_total, 0)

	def test_rule_amount_limits_include_the_limit(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		for values in ({"min_amount": 200}, {"max_amount": 200}):
			with self.subTest(values=values):
				self.item = make_item(self.income.name, self.expense.name)
				rule = self._pricing_rule(**values)
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					self.item.name,
					self.income.name,
				)

				self.assertEqual(row_pricing_rule(invoice.items[0]), rule.name)

	def test_rule_amount_is_the_item_total_over_its_rows(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		self._pricing_rule(min_amount=160)
		invoice = make_invoice(
			"Books Sales Invoice",
			self.party.name,
			self.receivable.name,
			self.item.name,
			self.income.name,
			items=[{"item_code": self.item.name, "qty": 1, "price_list_rate": rate} for rate in (100, 50)],
		)

		self.assertEqual([row_pricing_rule(row) for row in invoice.items], [None, None])

	def test_rule_values_reset_when_rule_stops_applying(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		for values in (
			{"price_discount_type": "percentage", "discount_percentage": 25},
			{"price_discount_type": "rate", "discount_rate": 80},
		):
			with self.subTest(values=values):
				self.item = make_item(self.income.name, self.expense.name, standard_rate=100)
				rule = self._pricing_rule(min_quantity=2, **values)
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					self.item.name,
					self.income.name,
				)
				invoice.items[0].update({"price_list_rate": None, "discount_percentage": 0})
				invoice.save()
				self.assertEqual(row_pricing_rule(invoice.items[0]), rule.name)
				self.assertEqual(invoice.grand_total, 150 if "discount_percentage" in values else 160)

				invoice.items[0].qty = 1
				invoice.save()
				self.assertFalse(invoice.items[0].pricing_rules)
				self.assertEqual(invoice.grand_total, 100)

	def test_rule_values_and_limits_are_in_company_currency(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		for values, rate, fieldname, expected in (
			({"price_discount_type": "rate", "discount_rate": 80}, None, "price_list_rate", 40),
			({"price_discount_type": "amount", "discount_amount": 10}, 100, "discount_amount", 5),
			(
				{"price_discount_type": "percentage", "discount_percentage": 10, "min_amount": 150},
				100,
				"discount_percentage",
				10,
			),
		):
			with self.subTest(values=values):
				self.item = make_item(self.income.name, self.expense.name, standard_rate=100)
				self._pricing_rule(**values)
				invoice = make_invoice(
					"Books Sales Invoice",
					make_customer(self.receivable.name, default_currency=foreign_currency()).name,
					self.receivable.name,
					self.item.name,
					self.income.name,
					conversion_rate=2,
				)
				invoice.items[0].update({"price_list_rate": rate, "qty": 1, "discount_percentage": 0})
				invoice.save()

				self.assertEqual(invoice.items[0].get(fieldname), expected)

	def test_empty_rate_comes_from_price_list_in_invoice_currency(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_price_list", 1)
		item = make_item(self.income.name, self.expense.name, standard_rate=100)
		price_list = make_price_list((item.name, "Unit", 90))
		for price_list_name, rate in ((price_list.name, 45), (None, 50)):
			with self.subTest(price_list=price_list_name):
				invoice = make_invoice(
					"Books Sales Invoice",
					make_customer(self.receivable.name, default_currency=foreign_currency()).name,
					self.receivable.name,
					item.name,
					self.income.name,
					selling_price_list=price_list_name,
					conversion_rate=2,
				)
				invoice.items[0].price_list_rate = None
				invoice.save()
				self.assertEqual(invoice.items[0].price_list_rate, rate)

	def test_invoice_takes_only_an_enabled_price_list_for_its_side(self):
		payable = make_account("Commerce Payable", root_type="Liability", account_type="Payable")
		supplier = make_supplier(payable.name)
		for values, doctype, party, account, message in (
			({"enabled": 0}, "Books Sales Invoice", self.party, self.receivable, "is disabled"),
			(
				{"selling": 0, "buying": 1},
				"Books Quotation",
				self.party,
				self.receivable,
				"not for Sales",
			),
			({}, "Books Purchase Invoice", supplier, payable, "not for Purchases"),
		):
			price_list = make_price_list(**values)
			field = "buying_price_list" if doctype == "Books Purchase Invoice" else "selling_price_list"
			with self.subTest(doctype=doctype), self.assertRaisesRegex(frappe.ValidationError, message):
				make_invoice(
					doctype,
					party.name,
					account.name,
					self.item.name,
					self.income.name,
					**{field: price_list.name},
				)

	def test_price_list_rate_is_charged_per_the_rows_unit(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_price_list", 1)
		box = frappe.get_doc({"doctype": "Books UOM", "uom_name": unique_name("Box")}).insert()
		item = make_item(
			self.income.name,
			self.expense.name,
			standard_rate=100,
			uoms=[{"uom": box.name, "conversion_factor": 12}],
		)
		# A box has its own price, else 12 times the unit's.
		for unit, price, rate in ((box.name, 120, 120), ("Unit", 9, 108)):
			with self.subTest(unit=unit):
				price_list = make_price_list((item.name, unit, price))
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					item.name,
					self.income.name,
					selling_price_list=price_list.name,
				)
				invoice.items[0].update(
					{"price_list_rate": None, "uom": box.name, "qty": 2, "discount_percentage": 0}
				)
				invoice.save()

				self.assertEqual(invoice.items[0].price_list_rate, rate)
				self.assertEqual(invoice.items[0].amount, rate * 2)

	def test_rule_without_unit_applies_in_the_item_unit(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		rule = self._pricing_rule(applied_items=[{"item": self.item.name}])
		invoice = make_invoice(
			"Books Sales Invoice", self.party.name, self.receivable.name, self.item.name, self.income.name
		)

		self.assertEqual(rule.applied_items[0].unit, "Unit")
		self.assertEqual(row_pricing_rule(invoice.items[0]), rule.name)

	def test_price_list_holds_one_price_per_item_unit_and_start(self):
		price_list = make_price_list((self.item.name, None, 90))
		with self.assertRaisesRegex(frappe.ValidationError, "Item Price appears multiple times"):
			make_item_price(price_list.name, self.item.name, price_list_rate=80)

	def test_invoice_takes_the_latest_item_price_valid_on_its_date(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_price_list", 1)
		price_list = make_price_list((self.item.name, None, 90))
		starts = add_days(nowdate(), 10)
		make_item_price(price_list.name, self.item.name, price_list_rate=70, valid_from=starts)
		make_item_price(
			price_list.name,
			self.item.name,
			price_list_rate=50,
			valid_from=add_days(nowdate(), -30),
			valid_upto=add_days(nowdate(), -1),
		)
		for date, rate in ((nowdate(), 90), (starts, 70)):
			with self.subTest(date=date):
				invoice = make_invoice(
					"Books Sales Invoice",
					self.party.name,
					self.receivable.name,
					self.item.name,
					self.income.name,
					posting_date=date,
					selling_price_list=price_list.name,
				)
				invoice.items[0].price_list_rate = None
				invoice.save()
				self.assertEqual(invoice.items[0].price_list_rate, rate)

	def test_item_price_dates_and_list_are_checked(self):
		price_list = make_price_list()
		with self.assertRaisesRegex(frappe.ValidationError, "must be after"):
			make_item_price(
				price_list.name, self.item.name, valid_from=nowdate(), valid_upto=add_days(nowdate(), -1)
			)
		price_list.db_set("enabled", 0)
		with self.assertRaisesRegex(frappe.ValidationError, "does not exist or is disabled"):
			make_item_price(price_list.name, self.item.name)

	def test_item_prices_follow_their_price_list(self):
		price_list = make_price_list((self.item.name, None, 90))
		price_list.buying = 1
		price_list.save()

		price = frappe.get_all(
			"Books Item Price", {"price_list": price_list.name}, ["selling", "buying", "currency"]
		)
		self.assertEqual([tuple(row.values()) for row in price], [(1, 1, company_currency())])

	def test_price_list_is_in_the_company_currency(self):
		with self.assertRaisesRegex(frappe.ValidationError, "company currency"):
			make_price_list(currency=foreign_currency())

	def test_item_price_without_unit_gets_the_item_unit(self):
		price_list = make_price_list()

		self.assertEqual(make_item_price(price_list.name, self.item.name).uom, "Unit")

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
			coupon_code=coupon.name,
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
			coupon_code=coupon.name,
		).submit()
		credit_note = frappe.copy_doc(invoice)
		credit_note.update({"docstatus": 0, "return_against": invoice.name})
		credit_note.items[0].qty = -2
		credit_note.insert().submit()

		self.assertEqual(coupon.db_get("used"), 1)

	def test_coupons_need_pricing_rules_that_apply(self):
		coupon = self._coupon(self._pricing_rule(is_coupon_code_based=1))
		start_pos_shift()
		frappe.db.set_single_value("Books Pos Settings", {"pos_profile": None, "ignore_pricing_rule": 1})
		for enable_pricing_rule, is_pos in ((0, 0), (1, 1)):
			with self.subTest(enable_pricing_rule=enable_pricing_rule, is_pos=is_pos):
				frappe.db.set_single_value(
					"Books Accounting Settings", "enable_pricing_rule", enable_pricing_rule
				)
				invoice = frappe.get_doc(
					{
						"doctype": "Books Sales Invoice",
						"customer": self.party.name,
						"debit_to": self.receivable.name,
						"is_pos": is_pos,
						"items": [{"item_code": self.item.name, "price_list_rate": 100, "qty": 1}],
						"coupon_code": coupon.name,
					}
				)
				self.assertRaisesRegex(frappe.ValidationError, "pricing rules", invoice.insert)

	def test_pos_preview_drops_coupons_the_cart_no_longer_allows(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		coupon = self._coupon(self._pricing_rule(is_coupon_code_based=1))
		other_item = make_item(self.income.name, self.expense.name)
		start_pos_shift()
		frappe.db.set_single_value("Books Pos Settings", {"pos_profile": None, "ignore_pricing_rule": 0})

		def sale(is_pos):
			return frappe.get_doc(
				{
					"doctype": "Books Sales Invoice",
					"customer": self.party.name,
					"debit_to": self.receivable.name,
					"is_pos": is_pos,
					"items": [{"item_code": other_item.name, "price_list_rate": 100, "qty": 1}],
					"coupon_code": coupon.name,
				}
			)

		pos_sale = sale(1)
		pos_sale.preview()
		self.assertFalse(pos_sale.coupon_code)

		message = "does not apply to any invoice item"
		self.assertRaisesRegex(frappe.ValidationError, message, sale(1).preview, check_coupons=True)
		self.assertRaisesRegex(frappe.ValidationError, message, sale(0).preview)
		self.assertRaisesRegex(frappe.ValidationError, message, sale(1).insert)

	def test_pos_profile_that_forbids_edits_keeps_rule_prices(self):
		frappe.db.set_single_value("Books Accounting Settings", "enable_pricing_rule", 1)
		frappe.db.set_single_value(
			"Books Pos Settings",
			{"pos_profile": None, "ignore_pricing_rule": 0, "can_change_rate": 0, "can_edit_discount": 0},
		)
		for values, total in (
			({"price_discount_type": "rate", "discount_rate": 80}, 80),
			({"price_discount_type": "percentage", "discount_percentage": 25}, 75),
		):
			with self.subTest(values=values):
				self.item = make_item(self.income.name, self.expense.name, standard_rate=100)
				self._pricing_rule(**values)
				invoice = frappe.get_doc(
					{
						"doctype": "Books Sales Invoice",
						"customer": self.party.name,
						"debit_to": self.receivable.name,
						"is_pos": 1,
						"items": [{"item_code": self.item.name, "qty": 1}],
					}
				).insert()
				self.assertEqual(invoice.grand_total, total)

	def _coupon(self, rule, **values):
		return frappe.get_doc(
			{
				"doctype": "Books Coupon Code",
				# The code is the name's first eight characters, so all eight must be unique.
				"coupon_name": frappe.generate_hash(length=8),
				"pricing_rule": rule.name,
				"valid_from": add_days(nowdate(), -1),
				"valid_to": add_days(nowdate(), 1),
				**values,
			}
		).insert()

	def test_price_list_and_pricing_rule_previews_fill_values_without_saving(self):
		sugar = make_item(self.income.name, self.expense.name, stock_uom="Kg")
		price_list = frappe.new_doc("Books Price List")
		price_list.price_list_name = unique_name("Preview Prices")
		rule = frappe.new_doc("Books Pricing Rule")
		rule.append("applied_items", {"item": sugar.name})

		price_list.preview()
		rule.preview()

		self.assertEqual(price_list.currency, company_currency())
		self.assertEqual(rule.applied_items[0].unit, "Kg")
		self.assertFalse(frappe.db.exists("Books Price List", price_list.price_list_name))

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


def make_item_price(price_list, item, **values):
	return frappe.get_doc(
		{
			"doctype": "Books Item Price",
			"price_list": price_list,
			"item_code": item,
			"price_list_rate": 90,
			**values,
		}
	).insert()
