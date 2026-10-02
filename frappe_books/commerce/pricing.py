"""Pricing-rule and coupon validation and application."""

from collections import defaultdict
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal

import frappe
from frappe import _

from frappe_books.accounting.money import as_decimal, rounded, sum_decimal
from frappe_books.settings import require_feature


def reset_pricing(invoice):
	"""Undo what pricing rules set on an invoice so they can be evaluated afresh."""
	if invoice.transaction_type != "sales" or invoice.get("return_against"):
		return
	invoice.set("items", [row for row in invoice.items if not row.is_free_item])
	invoice.set("pricing_rule_detail", [])
	invoice.is_pricing_rule_applied = 0
	rules = applied_rules(invoice.items)
	for row in invoice.items:
		if row.pricing_rule:
			_reset_row(row, rules.get(row.pricing_rule))


def applied_rules(rows):
	"""Return the pricing rules named on the rows, by name."""
	names = list({row.pricing_rule for row in rows if row.pricing_rule})
	if not names:
		return {}
	rules = frappe.get_all(
		"Books Pricing Rule",
		filters={"name": ["in", names]},
		fields=["name", "discount_type", "price_discount_type"],
	)
	return {rule.name: rule for rule in rules}


def standard_rates(invoice):
	"""Map (item, unit) to the rate a row gets when nobody edits it; unit None is the item rate."""
	items = list({row.item for row in invoice.items})
	rates = {
		(item.name, None): item.rate
		for item in frappe.get_all("Books Item", filters={"name": ["in", items]}, fields=["name", "rate"])
	}
	if invoice.price_list and frappe.db.get_single_value("Books Accounting Settings", "enable_price_list"):
		for row in frappe.get_all(
			"Books Price List Item",
			filters={"parent": invoice.price_list, "item": ["in", items]},
			fields=["item", "unit", "rate"],
		):
			rates[row.item, row.unit] = row.rate
	return rates


def validate_price_list(invoice):
	"""Sales and quotes take enabled sales price lists, purchases enabled purchase price lists.

	A return keeps its original's price list, as its rates come from the original.
	"""
	if not invoice.price_list or invoice.get("return_against"):
		return
	is_purchase = invoice.transaction_type == "purchase"
	side = "is_purchase" if is_purchase else "is_sales"
	price_list = frappe.db.get_value(
		"Books Price List", invoice.price_list, ["is_enabled", side], as_dict=True
	)
	if not price_list.is_enabled:
		frappe.throw(_("Price List {0} is disabled.").format(invoice.price_list))
	if not price_list[side]:
		frappe.throw(
			_("Price List {0} is not for {1}.").format(
				invoice.price_list, _("Purchases" if is_purchase else "Sales")
			)
		)


def standard_rate(invoice, row, rates):
	"""Return the row's standard rate per stock unit from `standard_rates` in the invoice currency, or None."""
	rate = _stock_unit_rate(row, rates)
	return in_invoice_currency(invoice, rate) if rate else None


def in_invoice_currency(invoice, amount):
	"""Convert a company-currency amount, such as a rate or a rule value, to the invoice currency."""
	return rounded(as_decimal(amount) / as_decimal(invoice.exchange_rate or 1), invoice.get("currency"))


def _stock_unit_rate(row, rates):
	"""Prefer the price of the transfer unit, then of the stock unit, then the item rate."""
	is_other_unit = row.transfer_unit and row.transfer_unit != row.unit
	if is_other_unit and (rate := rates.get((row.item, row.transfer_unit))):
		return as_decimal(rate) / as_decimal(row.unit_conversion_factor or 1)
	return rates.get((row.item, row.unit)) or rates.get((row.item, None))


def pos_setting(fieldname):
	"""Read a POS setting from the POS profile in use, or from POS settings without one."""
	profile = frappe.db.get_single_value("Books Pos Settings", "pos_profile")
	if profile:
		return frappe.db.get_value("Books Pos Profile", profile, fieldname)
	return frappe.db.get_single_value("Books Pos Settings", fieldname)


def _reset_row(row, rule):
	row.pricing_rule = None
	if not rule or rule.discount_type != "Price Discount":
		return
	if rule.price_discount_type == "rate" and not row.is_manual_rate:
		row.rate = None
	elif rule.price_discount_type == "percentage":
		row.item_discount_percent = 0
	elif rule.price_discount_type == "amount":
		row.set_item_discount_amount = 0
		row.item_discount_amount = 0


def apply_pricing(invoice):
	if invoice.transaction_type != "sales" or invoice.get("return_against"):
		return
	if not _applies_pricing_rules(invoice):
		# A coupon's discount is a pricing rule, so the coupon would be used up for nothing.
		if invoice.get("coupons"):
			require_feature("enable_coupon_code")
			frappe.throw(_("Coupons cannot be applied, as pricing rules do not apply to this invoice."))
		return

	rows = list(invoice.items)
	if not rows:
		return
	coupons = _validated_coupons(invoice, sum_decimal(_row_value(row) for row in rows))
	applied = _apply_rules(invoice, rows, coupons)
	invoice.is_pricing_rule_applied = int(bool(applied))
	_validate_coupon_application(coupons, {name for _item, name in applied})


def _apply_rules(invoice, rows, coupons):
	"""Apply each row's best rule, and each item's free row once; return the (item, rule name)s applied."""
	candidates = _candidate_rules(rows)
	quantities, amounts = _rule_totals(rows, candidates)
	applied = {}
	for row in rows:
		rules = candidates[row.item, row.transfer_unit]
		rule = _best_rule(invoice, row.item, quantities, amounts, rules, coupons)
		if rule:
			_apply_rule(invoice, row, rule)
			applied[row.item, rule.name] = rule
	for key, rule in applied.items():
		invoice.append("pricing_rule_detail", {"reference_name": rule.name, "reference_item": key[0]})
		if rule.discount_type == "Product Discount":
			_append_free_item(invoice, rule, quantities[key])
	return applied


def _rule_totals(rows, candidates):
	"""Sum, by (item, rule name), the stock quantity and amount of the item's rows in the rule's units."""
	quantities = defaultdict(Decimal)
	amounts = defaultdict(Decimal)
	for row in rows:
		for rule in candidates[row.item, row.transfer_unit]:
			quantities[row.item, rule.name] += as_decimal(row.quantity)
			amounts[row.item, rule.name] += _row_value(row)
	return quantities, amounts


def _apply_rule(invoice, row, rule):
	row.pricing_rule = rule.name
	if rule.discount_type == "Price Discount":
		_apply_price_discount(invoice, row, rule)


def update_coupon_usage(invoice, delta):
	if invoice.transaction_type != "sales" or invoice.get("return_against"):
		return
	for name in {row.coupons for row in invoice.get("coupons", []) if row.coupons}:
		coupon = frappe.db.get_value(
			"Books Coupon Code", name, ["used", "maximum_use"], as_dict=True, for_update=True
		)
		used = coupon.used + delta
		if used < 0:
			frappe.throw(_("Coupon {0} usage cannot drop below zero.").format(name))
		if delta > 0 and coupon.maximum_use and used > coupon.maximum_use:
			frappe.throw(_("Coupon {0} has reached its use limit.").format(name))
		frappe.db.set_value("Books Coupon Code", name, "used", used)


def _validated_coupons(invoice, order_value):
	names = [row.coupons for row in invoice.get("coupons", []) if row.coupons]
	if len(names) != len(set(names)):
		frappe.throw(_("The same coupon cannot be applied more than once."))
	if not names:
		return {}
	coupons = frappe.get_all("Books Coupon Code", filters={"name": ["in", names]}, fields=["*"])
	for coupon in coupons:
		if not coupon.is_enabled:
			frappe.throw(_("Coupon {0} is disabled.").format(coupon.name))
		if coupon.maximum_use and coupon.used >= coupon.maximum_use:
			frappe.throw(_("Coupon {0} has reached its use limit.").format(coupon.name))
		if not _within_limits(coupon, invoice.date, _in_company_currency(invoice, order_value)):
			frappe.throw(_("Coupon {0} is not valid for this invoice.").format(coupon.name))
	return {coupon.pricing_rule: coupon for coupon in coupons}


def _candidate_rules(rows):
	"""Return enabled rules keyed by the (item, unit) they apply to; a row's unit is its transfer unit."""
	links = frappe.get_all(
		"Books Pricing Rule Item",
		filters={"item": ["in", list({row.item for row in rows})]},
		fields=["parent", "item", "unit"],
	)
	if not links:
		return defaultdict(list)
	rules = frappe.get_all(
		"Books Pricing Rule",
		filters={"name": ["in", list({link.parent for link in links})], "is_enabled": 1},
		fields=["*"],
	)
	rules = {rule.name: rule for rule in rules}
	candidates = defaultdict(dict)
	for link in links:
		if link.parent in rules:
			candidates[link.item, link.unit][link.parent] = rules[link.parent]
	return defaultdict(list, {key: list(value.values()) for key, value in candidates.items()})


def _best_rule(invoice, item, quantities, amounts, rules, coupons):
	"""Return the highest-priority rule whose `_rule_totals` for the item qualify."""
	rules = [
		rule
		for rule in rules
		if bool(rule.is_coupon_code_based) == (rule.name in coupons)
		and _qualifies(invoice, rule, quantities[item, rule.name], amounts[item, rule.name])
	]
	if not rules:
		return None
	rules.sort(key=lambda rule: int(rule.priority or 0), reverse=True)
	if len(rules) > 1 and rules[0].priority == rules[1].priority:
		frappe.throw(
			_("Pricing rules {0} and {1} have the same priority for item {2}.").format(
				rules[0].name, rules[1].name, item
			)
		)
	return rules[0]


def _qualifies(invoice, rule, quantity, amount):
	"""The quantity and amount are within the rule's limits, and a product discount gives something."""
	amount = _in_company_currency(invoice, amount)
	return _within_limits(rule, invoice.date, amount, quantity) and (
		rule.discount_type == "Price Discount" or _free_quantity(rule, quantity) > 0
	)


def _row_value(row):
	return as_decimal(row.rate) * as_decimal(row.quantity)


def _in_company_currency(invoice, amount):
	return as_decimal(amount) * as_decimal(invoice.exchange_rate or 1)


def _apply_price_discount(invoice, row, rule):
	if rule.price_discount_type == "rate":
		# The rule rate is per the row's transfer unit, which the rule matched; rows are priced per stock unit.
		if not row.is_manual_rate:
			rate = as_decimal(rule.discount_rate) / as_decimal(row.unit_conversion_factor or 1)
			row.rate = in_invoice_currency(invoice, rate)
	elif rule.price_discount_type == "percentage":
		row.set_item_discount_amount = 0
		row.item_discount_percent = rule.discount_percentage
	elif rule.price_discount_type == "amount":
		row.set_item_discount_amount = 1
		row_amount = rounded(_row_value(row), invoice.get("currency"))
		row.item_discount_amount = min(in_invoice_currency(invoice, rule.discount_amount), row_amount)
	else:
		frappe.throw(_("Pricing rule {0} has no price discount type.").format(rule.name))


def _free_quantity(rule, quantity):
	"""Return the free quantity a product discount gives for `quantity` stock units of its item."""
	free_quantity = as_decimal(rule.free_item_quantity)
	if rule.is_recursive:
		free_quantity *= quantity / as_decimal(rule.recurse_every)
	if rule.round_free_item_qty:
		rounding = {
			"floor": ROUND_FLOOR,
			"ceil": ROUND_CEILING,
			"round": ROUND_HALF_UP,
		}.get(rule.rounding_method, ROUND_HALF_UP)
		free_quantity = free_quantity.quantize(Decimal("1"), rounding=rounding)
	return free_quantity


def _append_free_item(invoice, rule, quantity):
	invoice.append(
		"items",
		{
			"item": rule.free_item,
			"transfer_unit": rule.free_item_unit,
			"transfer_quantity": _free_quantity(rule, quantity),
			"rate": 0,
			"is_free_item": 1,
			"pricing_rule": rule.name,
		},
	)


def _validate_coupon_application(coupons, applied_rules):
	for rule_name, coupon in coupons.items():
		if rule_name not in applied_rules:
			frappe.throw(_("Coupon {0} does not apply to any invoice item.").format(coupon.name))


def _within_limits(record, date, amount, quantity=None):
	amount = as_decimal(amount)
	if quantity is not None:
		quantity = as_decimal(quantity)
		if as_decimal(record.min_quantity) > 0 and quantity < as_decimal(record.min_quantity):
			return False
		if as_decimal(record.max_quantity) > 0 and quantity > as_decimal(record.max_quantity):
			return False
	if as_decimal(record.min_amount) > 0 and amount < as_decimal(record.min_amount):
		return False
	if as_decimal(record.max_amount) > 0 and amount > as_decimal(record.max_amount):
		return False
	date = frappe.utils.getdate(date)
	return not (
		(record.valid_from and date < frappe.utils.getdate(record.valid_from))
		or (record.valid_to and date > frappe.utils.getdate(record.valid_to))
	)


def _applies_pricing_rules(invoice):
	"""Pricing rules are on, and the POS profile or settings of a POS invoice do not ignore them."""
	if not frappe.db.get_single_value("Books Accounting Settings", "enable_pricing_rule"):
		return False
	return not (invoice.get("is_pos") and pos_setting("ignore_pricing_rule"))


def validate_range(minimum, maximum, label, strict=False, message=None):
	minimum = as_decimal(minimum)
	maximum = as_decimal(maximum)
	if minimum < 0 or maximum < 0:
		frappe.throw(_("Pricing {0} limits cannot be negative.").format(label))
	if minimum and maximum and (minimum >= maximum if strict else minimum > maximum):
		frappe.throw(message or _("Minimum {0} must be less than maximum {0}.").format(label))


def validate_dates(valid_from, valid_to, message=None):
	if not (valid_from and valid_to):
		return
	if frappe.utils.getdate(valid_from) > frappe.utils.getdate(valid_to):
		frappe.throw(message or _("Valid From must be on or before Valid To."))
