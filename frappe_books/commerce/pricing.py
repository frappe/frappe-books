"""Pricing-rule and coupon validation and application."""

from collections import defaultdict
from decimal import ROUND_CEILING, ROUND_FLOOR, ROUND_HALF_UP, Decimal

import frappe
from frappe import _

from frappe_books.accounting.money import as_decimal, rounded, sum_decimal


def validate_pricing_rule(rule):
	_validate_range(rule.min_quantity, rule.max_quantity, _("quantity"))
	_validate_range(rule.min_amount, rule.max_amount, _("amount"), strict=True)
	_validate_dates(rule.valid_from, rule.valid_to)
	if not rule.applied_items:
		frappe.throw(_("Add at least one item to the pricing rule."))
	if rule.discount_type == "Price Discount":
		_validate_price_discount(rule)
	elif rule.discount_type == "Product Discount":
		if not rule.free_item or as_decimal(rule.free_item_quantity) <= 0:
			frappe.throw(_("A product discount requires a free item and a positive quantity."))
		if rule.is_recursive and as_decimal(rule.recurse_every) <= 0:
			frappe.throw(_("Recursive product discounts require a positive recurse-every quantity."))


def validate_coupon(coupon):
	rule = frappe.get_doc("Books Pricing Rule", coupon.pricing_rule)
	if not rule.is_coupon_code_based:
		frappe.throw(_("Coupon codes can only use coupon-based pricing rules."))
	_validate_range(coupon.min_amount, coupon.max_amount, _("amount"), strict=True)
	_validate_dates(coupon.valid_from, coupon.valid_to)
	if coupon.maximum_use < 0 or coupon.used < 0:
		frappe.throw(_("Coupon usage counts cannot be negative."))
	if coupon.maximum_use and coupon.used > coupon.maximum_use:
		frappe.throw(_("Coupon usage cannot exceed its maximum use limit."))
	if as_decimal(rule.min_amount) and as_decimal(coupon.min_amount) < as_decimal(rule.min_amount):
		frappe.throw(_("Coupon minimum amount cannot be below the pricing-rule minimum."))
	if as_decimal(rule.max_amount) and as_decimal(coupon.max_amount) > as_decimal(rule.max_amount):
		frappe.throw(_("Coupon maximum amount cannot exceed the pricing-rule maximum."))
	if rule.valid_from and frappe.utils.getdate(coupon.valid_from) < frappe.utils.getdate(rule.valid_from):
		frappe.throw(_("Coupon validity cannot start before its pricing rule."))
	if rule.valid_to and frappe.utils.getdate(coupon.valid_to) > frappe.utils.getdate(rule.valid_to):
		frappe.throw(_("Coupon validity cannot end after its pricing rule."))


def reset_pricing(invoice):
	"""Undo what pricing rules set on an invoice so they can be evaluated afresh."""
	if invoice.transaction_type != "sales" or invoice.get("return_against"):
		return
	invoice.set("items", [row for row in invoice.items if not row.is_free_item])
	invoice.set("pricing_rule_detail", [])
	invoice.is_pricing_rule_applied = 0
	rows = [row for row in invoice.items if row.pricing_rule]
	if not rows:
		return
	rules = frappe.get_all(
		"Books Pricing Rule",
		filters={"name": ["in", list({row.pricing_rule for row in rows})]},
		fields=["name", "discount_type", "price_discount_type"],
	)
	rules = {rule.name: rule for rule in rules}
	for row in rows:
		_reset_row(row, rules.get(row.pricing_rule))


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
	if not frappe.db.get_single_value("Books Accounting Settings", "enable_pricing_rule"):
		return
	if _ignore_pos_pricing(invoice):
		return

	rows = list(invoice.items)
	if not rows:
		return
	coupons = _validated_coupons(invoice, sum_decimal(_row_value(row) for row in rows))
	candidates = _candidate_rules(rows)
	quantities = defaultdict(Decimal)
	for row in rows:
		quantities[row.item] += as_decimal(row.quantity)
	applied = []
	for row in rows:
		rule = _best_rule(invoice, row, quantities[row.item], candidates[row.item, row.unit], coupons)
		if rule:
			_apply_rule(invoice, row, rule)
			applied.append(rule.name)
	invoice.is_pricing_rule_applied = int(bool(applied))
	_validate_coupon_application(coupons, applied)


def _apply_rule(invoice, row, rule):
	row.pricing_rule = rule.name
	invoice.append("pricing_rule_detail", {"reference_name": rule.name, "reference_item": row.item})
	if rule.discount_type == "Price Discount":
		_apply_price_discount(row, rule)
	else:
		_append_free_item(invoice, row, rule)


def update_coupon_usage(invoice, delta):
	if invoice.transaction_type != "sales":
		return
	for row in invoice.get("coupons", []):
		if not row.coupons:
			continue
		coupon = frappe.get_doc("Books Coupon Code", row.coupons)
		used = max(0, int(coupon.used or 0) + delta)
		if delta > 0 and coupon.maximum_use and used > coupon.maximum_use:
			frappe.throw(_("Coupon {0} has reached its use limit.").format(coupon.name))
		frappe.db.set_value("Books Coupon Code", coupon.name, "used", used, update_modified=False)


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
		if not _within_limits(coupon, invoice.date, order_value):
			frappe.throw(_("Coupon {0} is not valid for this invoice.").format(coupon.name))
	return {coupon.pricing_rule: coupon for coupon in coupons}


def _candidate_rules(rows):
	"""Return enabled rules keyed by the (item, unit) they apply to."""
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


def _best_rule(invoice, row, quantity, rules, coupons):
	rules = [
		rule
		for rule in rules
		if bool(rule.is_coupon_code_based) == (rule.name in coupons)
		and _within_limits(rule, invoice.date, as_decimal(row.rate) * quantity, quantity)
	]
	if not rules:
		return None
	rules.sort(key=lambda rule: int(rule.priority or 0), reverse=True)
	if len(rules) > 1 and rules[0].priority == rules[1].priority:
		frappe.throw(
			_("Pricing rules {0} and {1} have the same priority for item {2}.").format(
				rules[0].name, rules[1].name, row.item
			)
		)
	return rules[0]


def _row_value(row):
	return as_decimal(row.rate) * as_decimal(row.quantity)


def _apply_price_discount(row, rule):
	if rule.price_discount_type == "rate":
		if not row.is_manual_rate:
			row.rate = rounded(rule.discount_rate)
	elif rule.price_discount_type == "percentage":
		row.set_item_discount_amount = 0
		row.item_discount_percent = rule.discount_percentage
	elif rule.price_discount_type == "amount":
		row.set_item_discount_amount = 1
		row.item_discount_amount = rounded(rule.discount_amount)
	else:
		frappe.throw(_("Pricing rule {0} has no price discount type.").format(rule.name))


def _append_free_item(invoice, source_row, rule):
	quantity = as_decimal(rule.free_item_quantity)
	if rule.is_recursive:
		quantity = as_decimal(source_row.quantity) / as_decimal(rule.recurse_every)
	if rule.round_free_item_qty:
		rounding = {
			"floor": ROUND_FLOOR,
			"ceil": ROUND_CEILING,
			"round": ROUND_HALF_UP,
		}.get(rule.rounding_method, ROUND_HALF_UP)
		quantity = quantity.quantize(Decimal("1"), rounding=rounding)
	if quantity <= 0:
		frappe.throw(_("Pricing rule {0} produces a zero free-item quantity.").format(rule.name))
	invoice.append(
		"items",
		{
			"item": rule.free_item,
			"unit": rule.free_item_unit,
			"quantity": quantity,
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
	if as_decimal(record.min_amount) > 0 and amount <= as_decimal(record.min_amount):
		return False
	if as_decimal(record.max_amount) > 0 and amount >= as_decimal(record.max_amount):
		return False
	date = frappe.utils.getdate(date)
	return not (
		(record.valid_from and date < frappe.utils.getdate(record.valid_from))
		or (record.valid_to and date > frappe.utils.getdate(record.valid_to))
	)


def _ignore_pos_pricing(invoice):
	if not invoice.get("is_pos"):
		return False
	profile_name = frappe.db.get_single_value("Books Pos Settings", "pos_profile")
	if profile_name:
		return bool(frappe.db.get_value("Books Pos Profile", profile_name, "ignore_pricing_rule"))
	return bool(frappe.db.get_single_value("Books Pos Settings", "ignore_pricing_rule"))


def _validate_price_discount(rule):
	value_by_type = {
		"rate": rule.discount_rate,
		"percentage": rule.discount_percentage,
		"amount": rule.discount_amount,
	}
	if rule.price_discount_type not in value_by_type:
		frappe.throw(_("Select a price discount type."))
	value = as_decimal(value_by_type[rule.price_discount_type])
	if value < 0:
		frappe.throw(_("Discount values cannot be negative."))
	if rule.price_discount_type == "percentage" and value > 100:
		frappe.throw(_("Discount percentage cannot exceed 100."))


def _validate_range(minimum, maximum, label, strict=False):
	minimum = as_decimal(minimum)
	maximum = as_decimal(maximum)
	if minimum < 0 or maximum < 0:
		frappe.throw(_("Pricing {0} limits cannot be negative.").format(label))
	if minimum and maximum and (minimum >= maximum if strict else minimum > maximum):
		frappe.throw(_("Minimum {0} must be less than maximum {0}.").format(label))


def _validate_dates(valid_from, valid_to):
	if valid_from and valid_to and frappe.utils.getdate(valid_from) > frappe.utils.getdate(valid_to):
		frappe.throw(_("Valid From must be on or before Valid To."))
