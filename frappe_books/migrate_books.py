import frappe
import sqlite3
import re

def camel_to_snake(name):
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1_\2', name)
    return re.sub('([a-z0-9])([A-Z])', r'\1_\2', s1).lower()

MAPPING = {
    "for": "item_usage",
    "parentSchemaName": "parenttype",
    "parentFieldname": "parentfield",
    "date": "posting_date" # Only used by Journal Entry, others use date
}

def execute():
    # Make sure we're in the correct context
    frappe.init(site="books.localhost", sites_path="sites")
    frappe.connect()

    # Provide the path to the sqlite file
    conn = sqlite3.connect("../Sahajanand Digital.books 2.db")
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [r[0] for r in cursor.fetchall()]

    # Ordered mapping to avoid reference issues
    table_order = [
        "Color", "Currency", "UOM", "NumberSeries", "Account", "Address", "ItemGroup",
        "Party", "Item", "Tax", "PriceList", "Location", "CustomField", "CustomForm",
        "PaymentMethod", "LoyaltyProgram", "CouponCode", "SalesQuote", "SalesOrder",
        "SalesInvoice", "PurchaseReceipt", "PurchaseInvoice", "JournalEntry", "Payment", "PrintTemplate"
    ]
    
    for t in tables:
        if t not in table_order and not t.endswith("Item") and not t.endswith("Detail"):
            table_order.append(t)
            
    for t in tables:
        # Convert PascalCase to Space Separated Title Case
        spaced_t = re.sub(r"([A-Z])", r" \1", t).strip()
        # Handle exceptions
        spaced_t = spaced_t.replace("U O M", "Uom")
        spaced_t = spaced_t.replace("P O S", "Pos")
        spaced_t = spaced_t.replace("E R P Next", "ERPNext")
        doctype = f"Books {spaced_t}"
        
        if doctype == "Books Pos Closing Shift": pass
        elif doctype == "Books Pos Opening Shift": pass
        elif doctype == "Books Pos Profile": pass
        elif doctype == "Books Accounting Ledger Entry": doctype = "Books Ledger Entry"
        
        if not frappe.db.exists("DocType", doctype):
            continue
            
        print(f"Migrating {t} to {doctype}...")
        valid_columns = frappe.get_meta(doctype).get_valid_columns()
        
        cursor.execute(f"SELECT * FROM `{t}`")
        rows = cursor.fetchall()
        for row in rows:
            d = dict(row)
            doc_dict = {}
            for k, v in d.items():
                if k == "name": doc_dict["name"] = v
                elif k == "created": doc_dict["creation"] = v
                elif k == "modified": doc_dict["modified"] = v
                elif k == "createdBy": doc_dict["owner"] = v
                elif k == "modifiedBy": doc_dict["modified_by"] = v
                else:
                    snake_key = camel_to_snake(k)
                    if k in MAPPING:
                        snake_key = MAPPING[k]
                    
                    if doctype == "Books Ledger Entry":
                        if k == "referenceType": snake_key = "voucher_type"
                        elif k == "referenceName": snake_key = "voucher_no"
                        elif k == "date": snake_key = "posting_date"
                    
                    if snake_key in valid_columns:
                        doc_dict[snake_key] = v
                    elif k == "date" and "date" in valid_columns:
                        doc_dict["date"] = v
                        
                    if k == "quantity" and "qty" in valid_columns:
                        doc_dict["qty"] = v
                        
            if not doc_dict.get("name"):
                continue

            if doctype == "PrintTemplate": doctype = "Print Format"
            try:

            if doctype == "Print Format":
                html = doc_dict["html"]
                if html:
                    # Basic Vue to Jinja conversion for Frappe Books Desktop Templates
                    html = re.sub(r'v-if="([^"]+)"', r'{% if  %}', html)
                    html = html.replace('v-else', '{% else %}')
                    html = re.sub(r'v-for="([^"]+) in ([^"]+)"', r'{% for  in  %}', html)
                    html = re.sub(r':key="[^"]+"', '', html)
                    
                    html = html.replace('doc.netTotal', 'books_format(doc.net_total, "Currency", doc.currency)')
                    html = html.replace('doc.grandTotal', 'books_format(doc.grand_total, "Currency", doc.currency)')
                    html = html.replace('doc.totalDiscount', 'books_format(doc.total_discount, "Currency", doc.currency)')
                    html = html.replace('doc.discountAfterTax', 'doc.discount_after_tax')
                    html = html.replace('row.hsnCode', 'row.hsn_code')
                    html = html.replace('print.companyName', '(print.company_name or "") | e')
                    html = html.replace('print.displayLogo', 'print.display_logo')
                    html = html.replace('print.logo', '{{ print.logo }}')
                    html = html.replace('print.gstin', 'print.gstin')
                    html = html.replace('print.address', 'print.address')
                    html = html.replace('print.phone', 'print.phone')
                    html = html.replace('print.email', 'print.email')
                    
                    # Fix totals
                    html = html.replace('doc.grandTotalInWords', 'totals.grand_total_in_words')
                    html = html.replace('doc.amountInWords', 'totals.amount_paid_in_words')
                    
                    # Remove JS function calls like t`Item` -> _("Item")
                    html = re.sub(r't\`([^\`]+)\`', r'{{ _("") }}', html)
                    
                    # Tailwind & Scaling fixes
                    scale_css = "<style>@media print { html, body { font-size: 12px !important; } .page-break-avoid, section, footer, .flex { page-break-inside: avoid !important; break-inside: avoid !important; } }</style>\n"
                    tailwind_link = '<link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">\n'
                    html = html.replace('h-full', '').replace('h-screen', '')
                    html = tailwind_link + scale_css + "{%- set print = get_print_settings() -%}\n{%- set totals = get_print_totals(doc) if doc else None -%}\n" + html
                    
                    doc_dict["html"] = html
                    doc_dict["custom_format"] = 1
                    
                    # Fallback doc_type if not available
                    if "doc_type" not in doc_dict or not doc_dict["doc_type"]:
                        doc_dict["doc_type"] = "Books Sales Invoice"
                    doc_dict["print_format_for"] = "DocType"

                # add missing standard fields
                doc_dict["creation"] = doc_dict.get("creation") or frappe.utils.now()
                doc_dict["modified"] = doc_dict.get("modified") or frappe.utils.now()
                doc_dict["owner"] = doc_dict.get("owner") or "Administrator"
                doc_dict["modified_by"] = doc_dict.get("modified_by") or "Administrator"
                doc_dict["docstatus"] = doc_dict.get("docstatus", 0)
                
                # Handling NULLs
                if "loyalty_points" in valid_columns and (doc_dict.get("loyalty_points") is None or doc_dict.get("loyalty_points") == ""):
                    doc_dict["loyalty_points"] = 0
                if "discount_percent" in valid_columns and (doc_dict.get("discount_percent") is None or doc_dict.get("discount_percent") == ""):
                    doc_dict["discount_percent"] = 0.0
                
                # Also map parenttype if this is a child table
                if "parenttype" in doc_dict and doc_dict["parenttype"]:
                    ptype = doc_dict["parenttype"]
                    spaced_pt = re.sub(r"([A-Z])", r" \1", ptype).strip()
                    if not spaced_pt.startswith("Books "):
                        spaced_pt = "Books " + spaced_pt
                    doc_dict["parenttype"] = spaced_pt
                        
                # map docstatus
                if "submitted" in d and d["submitted"]: doc_dict["docstatus"] = 1
                if "cancelled" in d and d["cancelled"]: doc_dict["docstatus"] = 2
                        
                fields = list(doc_dict.keys())
                
                # Fix datetime strings for MariaDB compatibility
                fixed_values = []
                for k in fields:
                    v = doc_dict[k]
                    if isinstance(v, str) and len(v) > 18 and v[10] == 'T' and v.endswith('Z'):
                        v = v.replace('T', ' ').replace('Z', '')
                    fixed_values.append(v)
                    
                if frappe.db.exists(doctype, doc_dict["name"]):
                    # UPDATE
                    update_str = ", ".join([f"`{c}` = %s" for c in fields if c != "name"])
                    update_values = tuple(fixed_values[i] for i, c in enumerate(fields) if c != "name")
                    frappe.db.sql(f"UPDATE `tab{doctype}` SET {update_str} WHERE name = %s", update_values + (doc_dict["name"],))
                else:
                    # INSERT
                    values = tuple(fixed_values)
                    placeholders = ", ".join(["%s"] * len(fields))
                    columns = ", ".join([f"`{c}`" for c in fields])
                    frappe.db.sql(f"INSERT INTO `tab{doctype}` ({columns}) VALUES ({placeholders})", values)
            except Exception as e:
                with open("migration_errors.txt", "a") as f:
                    f.write(f"Error {doctype} {doc_dict.get('name')}: {e}\n")
                    
    frappe.db.commit()
    with open("migration_errors.txt", "a") as f:
        f.write("Migration complete!\n")


    # --- POST MIGRATION CLEANUP ---
    print("\n--- Starting Post-Migration Cleanup & Ledger Rebuild ---")
    
    # 1. Update Statuses
    print("Fixing Document Statuses...")
    for dt in ["Books Sales Invoice", "Books Purchase Invoice", "Books Payment", "Books Journal Entry"]:
        docs = frappe.get_all(dt, pluck="name")
        for name in docs:
            doc = frappe.get_doc(dt, name)
            if hasattr(doc, "set_status"):
                doc.set_status(update=True)
                doc.db_update()
                
    # 2. Delete the raw imported ledgers to prevent duplicates
    print("Clearing raw imported ledgers...")
    frappe.db.sql("DELETE FROM `tabBooks Ledger Entry`")
    frappe.db.commit()
    
    # 3. Recalculate missing discount totals
    print("Recalculating invoice totals...")
    for dt in ["Books Sales Invoice", "Books Purchase Invoice", "Books Payment", "Books Journal Entry"]:
        docs = frappe.get_all(dt, pluck="name")
        for name in docs:
            doc = frappe.get_doc(dt, name)
            if hasattr(doc, "calculate"):
                if doctype == "PrintTemplate": doctype = "Print Format"
            try:

            if doctype == "Print Format":
                html = doc_dict["html"]
                if html:
                    # Basic Vue to Jinja conversion for Frappe Books Desktop Templates
                    html = re.sub(r'v-if="([^"]+)"', r'{% if  %}', html)
                    html = html.replace('v-else', '{% else %}')
                    html = re.sub(r'v-for="([^"]+) in ([^"]+)"', r'{% for  in  %}', html)
                    html = re.sub(r':key="[^"]+"', '', html)
                    
                    html = html.replace('doc.netTotal', 'books_format(doc.net_total, "Currency", doc.currency)')
                    html = html.replace('doc.grandTotal', 'books_format(doc.grand_total, "Currency", doc.currency)')
                    html = html.replace('doc.totalDiscount', 'books_format(doc.total_discount, "Currency", doc.currency)')
                    html = html.replace('doc.discountAfterTax', 'doc.discount_after_tax')
                    html = html.replace('row.hsnCode', 'row.hsn_code')
                    html = html.replace('print.companyName', '(print.company_name or "") | e')
                    html = html.replace('print.displayLogo', 'print.display_logo')
                    html = html.replace('print.logo', '{{ print.logo }}')
                    html = html.replace('print.gstin', 'print.gstin')
                    html = html.replace('print.address', 'print.address')
                    html = html.replace('print.phone', 'print.phone')
                    html = html.replace('print.email', 'print.email')
                    
                    # Fix totals
                    html = html.replace('doc.grandTotalInWords', 'totals.grand_total_in_words')
                    html = html.replace('doc.amountInWords', 'totals.amount_paid_in_words')
                    
                    # Remove JS function calls like t`Item` -> _("Item")
                    html = re.sub(r't\`([^\`]+)\`', r'{{ _("") }}', html)
                    
                    # Tailwind & Scaling fixes
                    scale_css = "<style>@media print { html, body { font-size: 12px !important; } .page-break-avoid, section, footer, .flex { page-break-inside: avoid !important; break-inside: avoid !important; } }</style>\n"
                    tailwind_link = '<link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">\n'
                    html = html.replace('h-full', '').replace('h-screen', '')
                    html = tailwind_link + scale_css + "{%- set print = get_print_settings() -%}\n{%- set totals = get_print_totals(doc) if doc else None -%}\n" + html
                    
                    doc_dict["html"] = html
                    doc_dict["custom_format"] = 1
                    
                    # Fallback doc_type if not available
                    if "doc_type" not in doc_dict or not doc_dict["doc_type"]:
                        doc_dict["doc_type"] = "Books Sales Invoice"
                    doc_dict["print_format_for"] = "DocType"

                    doc.calculate()
                    for item in doc.get("items", []):
                        if not item.get("item_discounted_total"):
                            item.item_discounted_total = item.amount
                        if not item.get("item_taxed_total"):
                            item.item_taxed_total = item.amount
                    doc.db_update_all()
                except Exception:
                    pass
                    
    # 4. Rebuild Ledgers Natively
    print("Rebuilding General Ledger Natively...")
    for dt in ["Books Sales Invoice", "Books Purchase Invoice", "Books Payment", "Books Journal Entry"]:
        docs = frappe.get_all(dt, filters={"docstatus": 1}, pluck="name")
        for name in docs:
            doc = frappe.get_doc(dt, name)
            if hasattr(doc, "get_ledger_posting"):
                if doctype == "PrintTemplate": doctype = "Print Format"
            try:

            if doctype == "Print Format":
                html = doc_dict["html"]
                if html:
                    # Basic Vue to Jinja conversion for Frappe Books Desktop Templates
                    html = re.sub(r'v-if="([^"]+)"', r'{% if  %}', html)
                    html = html.replace('v-else', '{% else %}')
                    html = re.sub(r'v-for="([^"]+) in ([^"]+)"', r'{% for  in  %}', html)
                    html = re.sub(r':key="[^"]+"', '', html)
                    
                    html = html.replace('doc.netTotal', 'books_format(doc.net_total, "Currency", doc.currency)')
                    html = html.replace('doc.grandTotal', 'books_format(doc.grand_total, "Currency", doc.currency)')
                    html = html.replace('doc.totalDiscount', 'books_format(doc.total_discount, "Currency", doc.currency)')
                    html = html.replace('doc.discountAfterTax', 'doc.discount_after_tax')
                    html = html.replace('row.hsnCode', 'row.hsn_code')
                    html = html.replace('print.companyName', '(print.company_name or "") | e')
                    html = html.replace('print.displayLogo', 'print.display_logo')
                    html = html.replace('print.logo', '{{ print.logo }}')
                    html = html.replace('print.gstin', 'print.gstin')
                    html = html.replace('print.address', 'print.address')
                    html = html.replace('print.phone', 'print.phone')
                    html = html.replace('print.email', 'print.email')
                    
                    # Fix totals
                    html = html.replace('doc.grandTotalInWords', 'totals.grand_total_in_words')
                    html = html.replace('doc.amountInWords', 'totals.amount_paid_in_words')
                    
                    # Remove JS function calls like t`Item` -> _("Item")
                    html = re.sub(r't\`([^\`]+)\`', r'{{ _("") }}', html)
                    
                    # Tailwind & Scaling fixes
                    scale_css = "<style>@media print { html, body { font-size: 12px !important; } .page-break-avoid, section, footer, .flex { page-break-inside: avoid !important; break-inside: avoid !important; } }</style>\n"
                    tailwind_link = '<link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">\n'
                    html = html.replace('h-full', '').replace('h-screen', '')
                    html = tailwind_link + scale_css + "{%- set print = get_print_settings() -%}\n{%- set totals = get_print_totals(doc) if doc else None -%}\n" + html
                    
                    doc_dict["html"] = html
                    doc_dict["custom_format"] = 1
                    
                    # Fallback doc_type if not available
                    if "doc_type" not in doc_dict or not doc_dict["doc_type"]:
                        doc_dict["doc_type"] = "Books Sales Invoice"
                    doc_dict["print_format_for"] = "DocType"

                    posting = doc.get_ledger_posting()
                    if posting: posting.post()
                except Exception:
                    pass
            elif hasattr(doc, "post_gl_entries"):
                if doctype == "PrintTemplate": doctype = "Print Format"
            try:

            if doctype == "Print Format":
                html = doc_dict["html"]
                if html:
                    # Basic Vue to Jinja conversion for Frappe Books Desktop Templates
                    html = re.sub(r'v-if="([^"]+)"', r'{% if  %}', html)
                    html = html.replace('v-else', '{% else %}')
                    html = re.sub(r'v-for="([^"]+) in ([^"]+)"', r'{% for  in  %}', html)
                    html = re.sub(r':key="[^"]+"', '', html)
                    
                    html = html.replace('doc.netTotal', 'books_format(doc.net_total, "Currency", doc.currency)')
                    html = html.replace('doc.grandTotal', 'books_format(doc.grand_total, "Currency", doc.currency)')
                    html = html.replace('doc.totalDiscount', 'books_format(doc.total_discount, "Currency", doc.currency)')
                    html = html.replace('doc.discountAfterTax', 'doc.discount_after_tax')
                    html = html.replace('row.hsnCode', 'row.hsn_code')
                    html = html.replace('print.companyName', '(print.company_name or "") | e')
                    html = html.replace('print.displayLogo', 'print.display_logo')
                    html = html.replace('print.logo', '{{ print.logo }}')
                    html = html.replace('print.gstin', 'print.gstin')
                    html = html.replace('print.address', 'print.address')
                    html = html.replace('print.phone', 'print.phone')
                    html = html.replace('print.email', 'print.email')
                    
                    # Fix totals
                    html = html.replace('doc.grandTotalInWords', 'totals.grand_total_in_words')
                    html = html.replace('doc.amountInWords', 'totals.amount_paid_in_words')
                    
                    # Remove JS function calls like t`Item` -> _("Item")
                    html = re.sub(r't\`([^\`]+)\`', r'{{ _("") }}', html)
                    
                    # Tailwind & Scaling fixes
                    scale_css = "<style>@media print { html, body { font-size: 12px !important; } .page-break-avoid, section, footer, .flex { page-break-inside: avoid !important; break-inside: avoid !important; } }</style>\n"
                    tailwind_link = '<link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">\n'
                    html = html.replace('h-full', '').replace('h-screen', '')
                    html = tailwind_link + scale_css + "{%- set print = get_print_settings() -%}\n{%- set totals = get_print_totals(doc) if doc else None -%}\n" + html
                    
                    doc_dict["html"] = html
                    doc_dict["custom_format"] = 1
                    
                    # Fallback doc_type if not available
                    if "doc_type" not in doc_dict or not doc_dict["doc_type"]:
                        doc_dict["doc_type"] = "Books Sales Invoice"
                    doc_dict["print_format_for"] = "DocType"

                    doc.post_gl_entries()
                except Exception:
                    pass
                    
    frappe.db.commit()
    print("Migration and Cleanup completely finished!")

if __name__ == "__main__":
    import sys
    import os
    sys.path.insert(0, os.path.abspath("apps/frappe"))
    execute()

