"""Country-specific records and validation on the stable hosted schema."""

import re

import frappe
from frappe import _

from frappe_books.coa import ensure_account

INDIAN_STATES = {
	"01": "Jammu and Kashmir",
	"02": "Himachal Pradesh",
	"03": "Punjab",
	"04": "Chandigarh",
	"05": "Uttarakhand",
	"06": "Haryana",
	"07": "Delhi",
	"08": "Rajasthan",
	"09": "Uttar Pradesh",
	"10": "Bihar",
	"11": "Sikkim",
	"12": "Arunachal Pradesh",
	"13": "Nagaland",
	"14": "Manipur",
	"15": "Mizoram",
	"16": "Tripura",
	"17": "Meghalaya",
	"18": "Assam",
	"19": "West Bengal",
	"20": "Jharkhand",
	"21": "Odisha",
	"22": "Chattisgarh",
	"23": "Madhya Pradesh",
	"24": "Gujarat",
	"26": "Dadra and Nagar Haveli and Daman and Diu",
	"27": "Maharashtra",
	"29": "Karnataka",
	"30": "Goa",
	"31": "Lakshadweep",
	"32": "Kerala",
	"33": "Tamil Nadu",
	"34": "Puducherry",
	"35": "Andaman and Nicobar Islands",
	"36": "Telangana",
	"37": "Andhra Pradesh",
	"38": "Ladakh",
}
GSTIN_PATTERN = re.compile(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$")
GST_RATES = (28, 18, 12, 6, 5, 3, 0.25, 0)
# The seeded GST accounts are named after the GST head they hold.
GST_HEADS = ("CGST", "SGST", "IGST", "Exempt")


def ensure_regional_records(country):
	if country != "India":
		return
	for account in GST_HEADS:
		ensure_account(account, "Duties and Taxes", "Liability", "Tax").db_set("gst_head", account)
	for tax_type, rates in {
		"GST": GST_RATES,
		"IGST": GST_RATES,
		"Exempt-GST": (0,),
		"Exempt-IGST": (0,),
	}.items():
		for rate in rates:
			name = f"{tax_type}-{rate}"
			if frappe.db.exists("Books Tax", name):
				continue
			frappe.get_doc(
				{
					"doctype": "Books Tax",
					"name": name,
					"details": _tax_details(tax_type, rate),
				}
			).insert(ignore_permissions=True)


def populate_address(address):
	address.address_display = ", ".join(
		str(value)
		for value in (
			address.address_line1,
			address.address_line2,
			address.city,
			address.state,
			address.country,
			address.postal_code,
		)
		if value
	)
	if address.country == "India" and address.state in INDIAN_STATES.values():
		address.pos = address.state
	elif address.get("pos"):
		address.pos = None


def validate_gstin(gstin):
	gstin = (gstin or "").strip().upper()
	if not GSTIN_PATTERN.fullmatch(gstin) or gstin[:2] not in INDIAN_STATES:
		frappe.throw(_("Enter a valid 15-character Indian GSTIN."))
	return gstin


def _tax_details(tax_type, rate):
	if tax_type == "GST":
		return [
			{"account": "CGST", "rate": rate / 2},
			{"account": "SGST", "rate": rate / 2},
		]
	return [{"account": tax_type.split("-")[0], "rate": rate}]
