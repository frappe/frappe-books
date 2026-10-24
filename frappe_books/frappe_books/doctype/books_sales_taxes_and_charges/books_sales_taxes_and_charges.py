# Copyright (c) 2026, Frappe Technologies Pvt. Ltd. and contributors
# For license information, please see license.txt

from frappe.model.document import Document


class BooksSalesTaxesandCharges(Document):
	# begin: auto-generated types
	# This code is auto-generated. Do not modify anything in this block.

	from typing import TYPE_CHECKING

	if TYPE_CHECKING:
		from frappe.types import DF

		account_head: DF.Link
		charge_type: DF.Literal["On Net Total", "Actual", "On Previous Row Amount", "On Previous Row Total"]
		description: DF.SmallText | None
		parent: DF.Data
		parentfield: DF.Data
		parenttype: DF.Data
		rate: DF.Float
		row_id: DF.Data | None
		set_by_item_tax_template: DF.Check
		tax_amount: DF.Currency
		total: DF.Currency
	# end: auto-generated types

	_DOCTYPE_NAME = "Books Sales Taxes and Charges"
