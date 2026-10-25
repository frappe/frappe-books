"""A party's primary Contact and Address, and a lead's Address, made from a new record's quick-entry values as ERPNext does."""

import frappe
from frappe import _
from frappe.contacts.address_and_contact import delete_contact_and_address
from frappe.contacts.doctype.address.address import get_address_display

# The values a new party's or lead's primary Address is made from; Books' doctypes do not hold them.
ADDRESS_FIELDS = ("address_line1", "address_line2", "city", "state", "pincode", "country")
# The keys of a party's own fieldnames, as ERPNext names them.
PARTY_KEYS = {"Books Customer": "customer", "Books Supplier": "supplier"}


def party_field(party_type, suffix):
	"""A party's own fieldname, e.g. customer_primary_address for ("Books Customer", "primary_address")."""
	return f"{PARTY_KEYS[party_type]}_{suffix}"


def validate_primary_records(party):
	"""A saved party's new primary Contact or Address must be linked to it, as ERPNext checks."""
	if party.is_new():
		return
	for doctype in ("Contact", "Address"):
		fieldname = party_field(party.doctype, f"primary_{doctype.lower()}")
		name = party.get(fieldname)
		if name and party.has_value_changed(fieldname) and not _is_linked(doctype, name, party):
			frappe.throw(
				_("{0} {1} is not linked to {2} {3}").format(
					_(doctype), frappe.bold(name), _(party.doctype), frappe.bold(party.name)
				)
			)
	if not party.get(party_field(party.doctype, "primary_contact")):
		party.email_id = party.mobile_no = None


def make_primary_records(party):
	"""Link the primary Contact and Address a new party was given, else make them from its values."""
	for doctype, make in (("Contact", _make_contact), ("Address", _make_address)):
		fieldname = party_field(party.doctype, f"primary_{doctype.lower()}")
		if name := party.get(fieldname):
			_link(frappe.get_doc(doctype, name), party)
		elif record := make(party):
			party.db_set(fieldname, record.name)


def link_lead_records(customer):
	"""Link the Contacts and Addresses of the customer's lead to it, as ERPNext does."""
	if not customer.lead_name:
		return
	filters = {
		"parenttype": ("in", ("Contact", "Address")),
		"link_doctype": "Books Lead",
		"link_name": customer.lead_name,
	}
	for link in frappe.get_all("Dynamic Link", filters=filters, fields=["parenttype", "parent"]):
		_link(frappe.get_doc(link.parenttype, link.parent), customer)


def delete_primary_records(party):
	"""Delete the Contacts and Addresses only the party links to, and unlink the rest, as ERPNext does."""
	party.db_set(
		{party_field(party.doctype, f"primary_{doctype}"): None for doctype in ("contact", "address")}
	)
	delete_contact_and_address(party.doctype, party.name)


def _make_contact(party):
	if not (party.email_id or party.mobile_no):
		return None
	contact = frappe.new_doc("Contact")
	# Books parties are companies to ERPNext, whose contacts take the party name as the company name.
	contact.update({"company_name": _title(party), "is_primary_contact": 1})
	if party.email_id:
		contact.add_email(party.email_id, is_primary=1)
	if party.mobile_no:
		contact.add_phone(party.mobile_no, is_primary_mobile_no=1)
	contact = _insert(contact, party)
	party.db_set({"email_id": contact.email_id, "mobile_no": contact.mobile_no})
	return contact


def _make_address(party):
	if address := make_address(party, _title(party)):
		party.db_set("primary_address", get_address_display(address.as_dict()))
	return address


def make_lead_address(lead, method=None):
	"""Link an Address made from a new lead's quick-entry values to it, titled by its organization, else its name."""
	make_address(lead, lead.get("company_name") or lead.lead_name)


def make_address(doc, title):
	"""Make a primary billing Address linked to `doc` from its quick-entry values, in the company's country unless given."""
	if not any(doc.get(fieldname) for fieldname in _quick_entry_fields(doc)):
		return None
	address = frappe.new_doc("Address")
	address.update(
		{
			**{fieldname: doc.get(fieldname) for fieldname in ADDRESS_FIELDS},
			"country": doc.get("country") or frappe.db.get_single_value("System Settings", "country"),
			"address_title": title,
			"address_type": "Billing",
			"is_primary_address": 1,
			"is_shipping_address": 1,
		}
	)
	return _insert(address, doc)


def _quick_entry_fields(doc):
	"""The address values only a quick entry sends, not those the doctype holds, like an ERPNext Lead's city."""
	return [
		fieldname
		for fieldname in ADDRESS_FIELDS
		if fieldname != "country" and not doc.meta.has_field(fieldname)
	]


def _insert(record, doc):
	record.append("links", {"link_doctype": doc.doctype, "link_name": doc.name})
	return record.insert(ignore_permissions=doc.flags.ignore_permissions)


def _link(record, party):
	if not record.has_link(party.doctype, party.name):
		record.append("links", {"link_doctype": party.doctype, "link_name": party.name})
		record.save(ignore_permissions=party.flags.ignore_permissions)


def _is_linked(doctype, name, party):
	filters = {"parenttype": doctype, "parent": name, "link_doctype": party.doctype, "link_name": party.name}
	return frappe.db.exists("Dynamic Link", filters)


def _title(party):
	return party.get(party_field(party.doctype, "name"))
