"""Pricing-rule and coupon validation and application."""

import json
from collections import defaultdict
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal

import frappe
from frappe import _

from frappe_books.accounting.money import as_decimal, rounded, sum_decimal
from frappe_books.settings import require_feature


def price(invoice, drop_invalid_coupons=False):
	"""Fill a sale's defaults and apply its best pricing rules afresh, free rows included.

	`drop_invalid_coupons` takes off coupons that cannot apply instead of refusing them.
	"""
	_reset_pricing(invoice)
	invoice.populate_defaults()
	_apply_pricing(invoice, drop_invalid_coupons)
	invoice.populate_rows([row for row in invoice.items if row.is_free_item])


def row_pricing_rule(row):
	"""The pricing rule a row got. ERPNext keeps a row's rules as a JSON list, or comma-separated."""
	value = row.get("pricing_rules")
	if not value:
		return None
	rules = json.loads(value) if value.startswith("[") else value.split(",")
	return rules[0] if rules else None


def is_rule_priced(row, field):
	"""Whether the row's pricing rule sets its "rate" or its "discount"."""
	price_type = _price_discount_type(row_pricing_rule(row))
	if field == "rate":
		return price_type == "rate"
	return price_type in ("percentage", "amount")


def _reset_pricing(invoice):
	"""Undo what pricing rules set on an invoice so they can be evaluated afresh."""
	invoice.set("items", [row for row in invoice.items if not row.is_free_item])
	invoice.set("pricing_rules", [])
	for row in invoice.items:
		if row.pricing_rules:
			_reset_row(row)


def _price_discount_type(rule_name):
	"""Return what a price discount rule changes: rate, percentage or amount; None for other rules."""
	rule = rule_name and frappe.get_cached_value(
		"Books Pricing Rule", rule_name, ["discount_type", "price_discount_type"], as_dict=True
	)
	return rule.price_discount_type if rule and rule.discount_type == "Price Discount" else None


def price_list(invoice):
	"""The selling or buying price list of the document."""
	return invoice.get("buying_price_list" if invoice.is_purchase else "selling_price_list")


def standard_rates(invoice):
	"""Map (item, unit) to the rate a row gets when nobody edits it; unit None is the item rate."""
	items = list({row.item_code for row in invoice.items})
	rates = {
		(item.name, None): item.standard_rate
		for item in frappe.get_all(
			"Books Item", filters={"name": ["in", items]}, fields=["name", "standard_rate"]
		)
	}
	if price_list(invoice) and frappe.db.get_single_value("Books Accounting Settings", "enable_price_list"):
		for price in _item_prices(price_list(invoice), items, invoice.document_date):
			rates[price.item_code, price.uom] = price.price_list_rate
	return rates


def _item_prices(price_list, items, date):
	"""The list's Item Prices valid on `date`, latest start last, so it wins as ERPNext's does."""
	date = frappe.utils.getdate(date)
	prices = frappe.get_all(
		"Books Item Price",
		filters={"price_list": price_list, "item_code": ["in", items]},
		fields=["item_code", "uom", "price_list_rate", "valid_from", "valid_upto"],
	)
	valid = [
		price
		for price in prices
		if (not price.valid_from or price.valid_from <= date)
		and (not price.valid_upto or date <= price.valid_upto)
	]
	return sorted(valid, key=lambda price: price.valid_from or date.min)


def validate_price_list(invoice):
	"""Sales and quotes take enabled sales price lists, purchases enabled purchase price lists.

	A return keeps its original's price list, as its rates come from the original.
	"""
	name = price_list(invoice)
	if not name or invoice.get("return_against"):
		return
	side = "buying" if invoice.is_purchase else "selling"
	values = frappe.db.get_value("Books Price List", name, ["enabled", side], as_dict=True)
	if not values.enabled:
		frappe.throw(_("Price List {0} is disabled.").format(name))
	if not values[side]:
		frappe.throw(
			_("Price List {0} is not for {1}.").format(
				name, _("Purchases" if invoice.is_purchase else "Sales")
			)
		)


def standard_rate(invoice, row, rates):
	"""Return the row's standard rate per its unit from `standard_rates` in the invoice currency, or None."""
	rate = _unit_rate(row, rates)
	return in_invoice_currency(invoice, rate) if rate else None


def in_invoice_currency(invoice, amount):
	"""Convert a company-currency amount, such as a rate or a rule value, to the invoice currency."""
	return rounded(as_decimal(amount) / as_decimal(invoice.conversion_rate or 1), invoice.get("currency"))


def _unit_rate(row, rates):
	"""Prefer the price of the row's unit, then the stock unit's or the item rate times the conversion factor."""
	if row.uom and row.uom != row.stock_uom and (rate := rates.get((row.item_code, row.uom))):
		return as_decimal(rate)
	rate = rates.get((row.item_code, row.stock_uom)) or rates.get((row.item_code, None))
	return as_decimal(rate) * as_decimal(row.conversion_factor or 1) if rate else None


def pos_setting(fieldname):
	"""Read a POS setting from the POS profile in use, or from POS settings without one."""
	profile = frappe.db.get_single_value("Books Pos Settings", "pos_profile")
	if profile:
		return frappe.db.get_value("Books Pos Profile", profile, fieldname)
	return frappe.db.get_single_value("Books Pos Settings", fieldname)


def _reset_row(row):
	price_type = _price_discount_type(row_pricing_rule(row))
	row.pricing_rules = None
	if price_type == "rate" and not row.is_manual_rate:
		row.price_list_rate = None
	elif price_type == "percentage":
		row.discount_percentage = 0
	elif price_type == "amount":
		row.discount_amount = 0


def _apply_pricing(invoice, drop_invalid_coupons):
	if not _applies_pricing_rules(invoice):
		# A coupon's discount is a pricing rule, so the coupon would be used up for nothing.
		if invoice.get("coupon_code"):
			require_feature("enable_coupon_code")
			message = _("Coupons cannot be applied, as pricing rules do not apply to this invoice.")
			_reject_coupon(invoice, message, drop_invalid_coupons)
		return

	rows = list(invoice.items)
	if not rows:
		return
	order_value = sum_decimal(_row_value(row) for row in rows)
	coupons = _validated_coupon(invoice, order_value, drop_invalid_coupons)
	applied = _apply_rules(invoice, rows, coupons)
	_validate_coupon_application(invoice, coupons, {name for _item, name in applied}, drop_invalid_coupons)


def _apply_rules(invoice, rows, coupons):
	"""Apply each row's best rule, and each item's free row once; return the (item, rule name)s applied."""
	candidates = _candidate_rules(rows)
	quantities, amounts = _rule_totals(rows, candidates)
	applied = {}
	for row in rows:
		rules = candidates[row.item_code, row.uom]
		rule = _best_rule(invoice, row.item_code, quantities, amounts, rules, coupons)
		if rule:
			_apply_rule(invoice, row, rule)
			applied[row.item_code, rule.name] = rule
	for key, rule in applied.items():
		invoice.append("pricing_rules", {"pricing_rule": rule.name, "item_code": key[0]})
		if rule.discount_type == "Product Discount":
			_append_free_item(invoice, rule, quantities[key])
	return applied


def _rule_totals(rows, candidates):
	"""Sum, by (item, rule name), the stock quantity and amount of the item's rows in the rule's units."""
	quantities = defaultdict(Decimal)
	amounts = defaultdict(Decimal)
	for row in rows:
		for rule in candidates[row.item_code, row.uom]:
			quantities[row.item_code, rule.name] += as_decimal(row.stock_qty)
			amounts[row.item_code, rule.name] += _row_value(row)
	return quantities, amounts


def _apply_rule(invoice, row, rule):
	row.pricing_rules = json.dumps([rule.name])
	if rule.discount_type == "Price Discount":
		_apply_price_discount(invoice, row, rule)


def update_coupon_usage(invoice, delta):
	name = invoice.get("coupon_code")
	if not name:
		return
	coupon = frappe.db.get_value(
		"Books Coupon Code", name, ["used", "maximum_use"], as_dict=True, for_update=True
	)
	used = coupon.used + delta
	if used < 0:
		frappe.throw(_("Coupon {0} usage cannot drop below zero.").format(name))
	if delta > 0 and coupon.maximum_use and used > coupon.maximum_use:
		frappe.throw(_("Coupon {0} has reached its use limit.").format(name))
	frappe.db.set_value("Books Coupon Code", name, "used", used)


def _validated_coupon(invoice, order_value, drop_invalid):
	"""Return the invoice's coupon by its pricing rule, if it can apply."""
	name = invoice.get("coupon_code")
	coupon = name and frappe.db.get_value("Books Coupon Code", name, "*", as_dict=True)
	if not coupon:
		return {}
	if error := _coupon_error(invoice, coupon, order_value):
		_reject_coupon(invoice, error, drop_invalid)
		return {}
	return {coupon.pricing_rule: coupon}


def _coupon_error(invoice, coupon, order_value):
	"""Why the coupon cannot be used on the invoice, or None."""
	if not coupon.is_enabled:
		return _("Coupon {0} is disabled.").format(coupon.name)
	if coupon.maximum_use and coupon.used >= coupon.maximum_use:
		return _("Coupon {0} has reached its use limit.").format(coupon.name)
	if not _within_limits(coupon, invoice.document_date, _in_company_currency(invoice, order_value)):
		return _("Coupon {0} is not valid for this invoice.").format(coupon.name)
	return None


def _reject_coupon(invoice, message, drop):
	"""Take the coupon off the invoice when dropping invalid coupons, else refuse the invoice."""
	if not drop:
		frappe.throw(message)
	invoice.coupon_code = None


def _candidate_rules(rows):
	"""Return enabled rules keyed by the (item, unit) they apply to; a row's unit is its transfer unit."""
	links = frappe.get_all(
		"Books Pricing Rule Item",
		filters={"item": ["in", list({row.item_code for row in rows})]},
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
	return _within_limits(rule, invoice.document_date, amount, quantity) and (
		rule.discount_type == "Price Discount" or _free_quantity(rule, quantity) > 0
	)


def _row_value(row):
	"""The row's amount before its discount."""
	return as_decimal(row.price_list_rate) * as_decimal(row.qty)


def _in_company_currency(invoice, amount):
	return as_decimal(amount) * as_decimal(invoice.conversion_rate or 1)


def _apply_price_discount(invoice, row, rule):
	if rule.price_discount_type == "rate":
		# The rule rate is per the row's unit, which the rule matched, as the row's rate is.
		if not row.is_manual_rate:
			row.price_list_rate = in_invoice_currency(invoice, rule.discount_rate)
	elif rule.price_discount_type == "percentage":
		row.discount_percentage = rule.discount_percentage
	elif rule.price_discount_type == "amount":
		# The rule takes its amount off the row, at most the row's amount; rows hold it per unit.
		row.discount_percentage = 0
		row_amount = abs(_row_value(row))
		discount = min(in_invoice_currency(invoice, rule.discount_amount), row_amount)
		quantity = abs(as_decimal(row.qty))
		row.discount_amount = rounded(discount / quantity, invoice.get("currency")) if quantity else 0
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
			"item_code": rule.free_item,
			"uom": rule.free_item_unit,
			"qty": _free_quantity(rule, quantity),
			"price_list_rate": 0,
			"is_free_item": 1,
			"pricing_rules": json.dumps([rule.name]),
		},
	)


def _validate_coupon_application(invoice, coupons, applied_rules, drop_invalid):
	for rule_name, coupon in coupons.items():
		if rule_name not in applied_rules:
			message = _("Coupon {0} does not apply to any invoice item.").format(coupon.name)
			_reject_coupon(invoice, message, drop_invalid)


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
