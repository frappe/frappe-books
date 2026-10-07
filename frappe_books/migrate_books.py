import frappe
import json
import sqlite3
import re
import os
from frappe.utils import now

def get_mapping(table):
    if table == "PrintTemplate":
        return "Print Format"
    
    # Tables to completely skip
    skip_tables = [
        "DocType", "PatchRun", "SingleValue", "ERPNextSyncQueue", 
        "FetchFromERPNextQueue", "IntegrationErrorLog",
    ]
    if table in skip_tables:
        return None
        
    s1 = re.sub('(.)([A-Z][a-z]+)', r'\1 \2', table)
    spaced = re.sub('([a-z0-9])([A-Z])', r'\1 \2', s1)
    
    spaced = spaced.replace("POS", "Pos")
    spaced = spaced.replace("UOM", "Uom")
    
    # Custom overrides
    overrides = {
        "Accounting Ledger Entry": "Books Ledger Entry",
        "Stock Ledger Entry": "Books Stock Ledger Entry",
    }
    if spaced in overrides:
        return overrides[spaced]
        
    return "Books " + spaced


# Per-doctype field renames: {sqlite_col: mariadb_col}
FIELD_RENAMES = {
    "Books Account": {
        "rootType":      "root_type",
        "parentAccount": "parent_books_account",
        "accountType":   "account_type",
        "isGroup":       "is_group",
    },
    "Books Party": {
        "defaultAccount":    "default_account",
        "gstType":           "gst_type",
        "fromLead":          "from_lead",
        "loyaltyProgram":    "loyalty_program",
        "loyaltyPoints":     "loyalty_points",
        "outstandingAmount": "outstanding_amount",
    },
    "Books Item": {
        "itemCode":        "item_code",
        "itemGroup":       "item_group",
        "itemType":        "item_type",
        "incomeAccount":   "income_account",
        "expenseAccount":  "expense_account",
        "hsnCode":         "hsn_code",
        "trackItem":       "track_item",
        "hasBatch":        "has_batch",
        "hasSerialNumber": "has_serial_number",
    },
    "Books Payment": {
        "numberSeries":   "number_series",
        "paymentType":    "payment_type",
        "paymentAccount": "payment_account",
        "paymentMethod":  "payment_method",
        "clearanceDate":  "clearance_date",
        "referenceId":    "reference_id",
        "referenceDate":  "reference_date",
        "referenceType":  "reference_type",
    },
    "Books Sales Invoice": {
        "numberSeries":         "number_series",
        "priceList":            "price_list",
        "netTotal":             "net_total",
        "grandTotal":           "grand_total",
        "baseGrandTotal":       "base_grand_total",
        "setDiscountAmount":    "set_discount_amount",
        "discountAmount":       "discount_amount",
        "discountPercent":      "discount_percent",
        "entryCurrency":        "entry_currency",
        "exchangeRate":         "exchange_rate",
        "discountAfterTax":     "discount_after_tax",
        "makeAutoPayment":      "make_auto_payment",
        "outstandingAmount":    "outstanding_amount",
        "isReturned":           "is_returned",
        "backReference":        "back_reference",
        "returnAgainst":        "return_against",
        "loyaltyProgram":       "loyalty_program",
        "redeemLoyaltyPoints":  "redeem_loyalty_points",
        "loyaltyPoints":        "loyalty_points",
        "isPOS":                "is_pos",
        "isPricingRuleApplied": "is_pricing_rule_applied",
        "isFullyReturned":      "is_fully_returned",
    },
    "Books Purchase Invoice": {
        "numberSeries":      "number_series",
        "priceList":         "price_list",
        "netTotal":          "net_total",
        "grandTotal":        "grand_total",
        "discountAmount":    "discount_amount",
        "discountPercent":   "discount_percent",
        "exchangeRate":      "exchange_rate",
        "discountAfterTax":  "discount_after_tax",
        "outstandingAmount": "outstanding_amount",
        "isReturned":        "is_returned",
        "returnAgainst":     "return_against",
    },
    "Books Journal Entry": {
        "numberSeries":    "number_series",
        "entryType":       "entry_type",
        "referenceNumber": "reference_number",
        "referenceDate":   "reference_date",
        "userRemark":      "user_remark",
    },
    "Books Number Series": {
        "referenceType": "reference_type",
        "startAt":       "start_at",
        "padZeros":      "pad_zeros",
    },
}


def rename_fields(doctype, doc_dict):
    """Rename camelCase SQLite fields to snake_case MariaDB fields."""
    import re
    new_dict = {}
    
    global_overrides = {
        "parentAccount": "parent_books_account",
        "parentFieldname": "parentfield",
        "parentSchemaName": "parenttype",
        "createdBy": "owner",
        "modifiedBy": "modified_by",
        "created": "creation",
        "modified": "modified",
        "isPOS": "is_pos",
        "docType": "doc_type",
    }
    
    renames = FIELD_RENAMES.get(doctype, {})
    
    for k, v in doc_dict.items():
        if k in renames:
            new_k = renames[k]
        elif k in global_overrides:
            new_k = global_overrides[k]
        else:
            new_k = re.sub(r'([a-z0-9])([A-Z])', r'\1_\2', k).lower()
        
        # If this is the parenttype column, rewrite the value to match the new Doctype name
        if new_k in ("parenttype", "doc_type", "reference_type") and v:
            mapped_type = get_mapping(v)
            if mapped_type:
                v = mapped_type

        new_dict[new_k] = v
        
    return new_dict


def execute(file_url=None, file_path=None):
    if not file_path:
        if file_url:
            file_path = frappe.get_site_path(file_url.strip('/'))
        else:
            file_path = "frappe-books.db"
    
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Database file not found at {file_path}")

    conn = sqlite3.connect(file_path)
    cursor = conn.cursor()

    cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
    tables = [row[0] for row in cursor.fetchall()]

    # To resolve foreign key issues, we import parents first, then children, etc.
    # But for a direct SQL dump, we can just insert everything and disable constraints temporarily if needed.
    # MariaDB doesn't mind inserting child rows if constraints aren't strict.

    for table in tables:
        doctype = get_mapping(table)
        if not doctype:
            continue
            
        cursor.execute(f"PRAGMA table_info(`{table}`)")
        columns = [c[1] for c in cursor.fetchall()]

        try:
            cursor.execute(f"SELECT * FROM `{table}`")
        except sqlite3.OperationalError:
            continue
            
        rows = cursor.fetchall()
        
        for row in rows:
            doc_dict = dict(zip(columns, row))
            if not doc_dict.get("name"):
                continue

            # Rename camelCase SQLite fields → snake_case MariaDB fields
            doc_dict = rename_fields(doctype, doc_dict)

            if doctype == "Print Format":
                html = doc_dict.get("html", "")
                if html:
                    html = re.sub(r'v-if="([^"]+)"', r'{% if \1 %}', html)
                    html = html.replace('v-else', '{% else %}')
                    html = re.sub(r'v-for="([^"]+) in ([^"]+)"', r'{% for \1 in \2 %}', html)
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
                    
                    html = html.replace('doc.grandTotalInWords', 'totals.grand_total_in_words')
                    html = html.replace('doc.amountInWords', 'totals.amount_paid_in_words')
                    html = re.sub(r't\`([^\`]+)\`', r'{{ _("\1") }}', html)
                    
                    scale_css = "<style>@media print { html, body { font-size: 12px !important; } .page-break-avoid, section, footer, .flex { page-break-inside: avoid !important; break-inside: avoid !important; } }</style>\n"
                    tailwind_link = '<link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">\n'
                    html = tailwind_link + scale_css + "{%- set print = get_print_settings() -%}\n{%- set totals = get_print_totals(doc) if doc else None -%}\n" + html
                    
                    doc_dict["html"] = html
                    doc_dict["custom_format"] = 1
                    
                    if "doc_type" not in doc_dict or not doc_dict["doc_type"]:
                        doc_dict["doc_type"] = "Books Sales Invoice"
                    doc_dict["print_format_for"] = "DocType"

            # Payment: copy `amount` into `amount_paid` if missing (old desktop schema had only `amount`)
            if doctype == "Books Payment" and not doc_dict.get("amount_paid"):
                doc_dict["amount_paid"] = doc_dict.get("amount", 0)

            if "name" in doc_dict:
                del doc_dict["name"]

            fields = list(doc_dict.keys())
            fields.append("name")
            
            fixed_values = []
            for f in fields:
                if f == "name":
                    fixed_values.append(row[columns.index("name")] if "name" in columns else frappe.generate_hash(length=10))
                elif f in doc_dict:
                    v = doc_dict[f]
                    if isinstance(v, dict) or isinstance(v, list):
                        v = json.dumps(v)
                    elif isinstance(v, str) and re.match(r'^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}', v):
                        # Convert SQLite ISO 8601 to MariaDB Datetime
                        v = v.replace("T", " ").replace("Z", "")
                    fixed_values.append(v)
                else:
                    fixed_values.append(None)

            # Validate identifiers to prevent SQL injection
            if not re.match(r'^[a-zA-Z0-9_\s]+$', doctype):
                raise ValueError(f"Invalid doctype name: {doctype}")
            
            for c in fields:
                if not re.match(r'^[a-zA-Z0-9_]+$', c):
                    raise ValueError(f"Invalid column name: {c}")

            # Ensure target table actually exists in MariaDB before attempting insert
            if not frappe.db.table_exists(doctype):
                continue

            valid_cols = frappe.db.get_table_columns(doctype)
            meta = frappe.get_meta(doctype)
            final_fields = []
            final_values = []
            
            for i, c in enumerate(fields):
                if c in valid_cols:
                    v = fixed_values[i]
                    if v is None:
                        df = meta.get_field(c)
                        if df and df.fieldtype in ("Int", "Float", "Currency", "Percent", "Check"):
                            v = 0
                        elif c in ("docstatus", "idx"):
                            v = 0
                    final_fields.append(c)
                    final_values.append(v)

            if not final_fields:
                continue

            name_idx = final_fields.index("name")
            if frappe.db.exists(doctype, final_values[name_idx]):
                update_str = ", ".join([f"`{c}` = %s" for c in final_fields if c != "name"])
                update_values = tuple(final_values[i] for i, c in enumerate(final_fields) if c != "name")
                frappe.db.sql(f"UPDATE `tab{doctype}` SET {update_str} WHERE name = %s", update_values + (final_values[name_idx],))
            else:
                placeholders = ", ".join(["%s"] * len(final_fields))
                cols = ", ".join([f"`{c}`" for c in final_fields])
                frappe.db.sql(f"INSERT INTO `tab{doctype}` ({cols}) VALUES ({placeholders})", tuple(final_values))

            
    frappe.db.commit()

    print("Recalculating invoice totals...")
    for dt in ["Books Sales Invoice", "Books Purchase Invoice", "Books Payment", "Books Journal Entry"]:
        docs = frappe.get_all(dt, pluck="name")
        for name in docs:
            doc = frappe.get_doc(dt, name)
            if hasattr(doc, "calculate"):
                try:
                    doc.calculate()
                    doc.db_update()
                except Exception:
                    pass


                
    frappe.db.commit()

    print("Migrating settings (logo, phone, email, company...)...")
    migrate_settings(conn)
    frappe.db.commit()

    print("Migration and Cleanup completely finished!")


def migrate_settings(conn):
    """
    Read the old desktop SingleValue table and push values into
    the appropriate Frappe Books single-doctype fields.
    """
    cursor = conn.cursor()
    cursor.execute("SELECT parent, fieldname, value FROM SingleValue")
    rows = cursor.fetchall()

    # Map: (sqlite_parent, sqlite_fieldname) -> (frappe_doctype, frappe_fieldname)
    # camelCase -> snake_case and old doctype name -> new Books doctype name
    SETTINGS_MAP = {
        # ── Print Settings ──────────────────────────────────────────────
        ("PrintSettings", "companyName"):   ("Books Print Settings", "company_name"),
        ("PrintSettings", "phone"):         ("Books Print Settings", "phone"),
        ("PrintSettings", "email"):         ("Books Print Settings", "email"),
        ("PrintSettings", "address"):       ("Books Print Settings", "address"),
        ("PrintSettings", "gstin"):         ("Books Print Settings", "gstin"),
        ("PrintSettings", "logo"):          ("Books Print Settings", "logo"),
        ("PrintSettings", "displayLogo"):   ("Books Print Settings", "display_logo"),
        ("PrintSettings", "color"):         ("Books Print Settings", "color"),
        ("PrintSettings", "font"):          ("Books Print Settings", "font"),
        ("PrintSettings", "amountInWords"): ("Books Print Settings", "amount_in_words"),
        ("PrintSettings", "displayTime"):   ("Books Print Settings", "display_time"),
        ("PrintSettings", "termsAndConditions"): ("Books Print Settings", "terms_and_conditions"),

        # ── Accounting Settings ──────────────────────────────────────────
        ("AccountingSettings", "companyName"):      ("Books Accounting Settings", "company_name"),
        ("AccountingSettings", "fullname"):         ("Books Accounting Settings", "fullname"),
        ("AccountingSettings", "email"):            ("Books Accounting Settings", "email"),
        ("AccountingSettings", "gstin"):            ("Books Accounting Settings", "gstin"),
        ("AccountingSettings", "country"):          ("Books Accounting Settings", "country"),
        ("AccountingSettings", "bankName"):         ("Books Accounting Settings", "bank_name"),
        ("AccountingSettings", "fiscalYearStart"):  ("Books Accounting Settings", "fiscal_year_start"),
        ("AccountingSettings", "fiscalYearEnd"):    ("Books Accounting Settings", "fiscal_year_end"),
        ("AccountingSettings", "currency"):         ("Books Accounting Settings", "currency"),
        ("AccountingSettings", "writeOffAccount"):  ("Books Accounting Settings", "write_off_account"),
        ("AccountingSettings", "roundOffAccount"):  ("Books Accounting Settings", "round_off_account"),
        ("AccountingSettings", "discountAccount"):  ("Books Accounting Settings", "discount_account"),
        ("AccountingSettings", "enableLead"):                      ("Books Accounting Settings", "enable_lead"),
        ("AccountingSettings", "enablePricingRule"):               ("Books Accounting Settings", "enable_pricing_rule"),
        ("AccountingSettings", "enableLoyaltyProgram"):            ("Books Accounting Settings", "enable_loyalty_program"),
        ("AccountingSettings", "enableCouponCode"):                ("Books Accounting Settings", "enable_coupon_code"),
        ("AccountingSettings", "enablePartialPayment"):            ("Books Accounting Settings", "enable_partial_payment"),
        ("AccountingSettings", "enableitemGroup"):                 ("Books Accounting Settings", "enableitem_group"),
        ("AccountingSettings", "enableItemEnquiry"):               ("Books Accounting Settings", "enable_item_enquiry"),
        ("AccountingSettings", "enablePointOfSaleWithOutInventory"):("Books Accounting Settings", "enable_point_of_sale_with_out_inventory"),

        # ── Defaults ─────────────────────────────────────────────────────
        ("Defaults", "salesInvoicePrintTemplate"):  ("Books Defaults", "sales_invoice_print_template"),
        ("Defaults", "purchaseInvoicePrintTemplate"):("Books Defaults", "purchase_invoice_print_template"),
        ("Defaults", "paymentPrintTemplate"):       ("Books Defaults", "payment_print_template"),
        ("Defaults", "salesQuotePrintTemplate"):    ("Books Defaults", "sales_quote_print_template"),
        ("Defaults", "posPrintTemplate"):           ("Books Defaults", "pos_print_template"),
        ("Defaults", "shipmentPrintTemplate"):      ("Books Defaults", "shipment_print_template"),
        ("Defaults", "salesPaymentAccount"):        ("Books Defaults", "sales_payment_account"),
        ("Defaults", "purchasePaymentAccount"):     ("Books Defaults", "purchase_payment_account"),
        ("Defaults", "saveButtonColour"):           ("Books Defaults", "save_button_colour"),
        ("Defaults", "cancelButtonColour"):         ("Books Defaults", "cancel_button_colour"),
        ("Defaults", "submitButtonColour"):         ("Books Defaults", "save_button_colour"),
        ("Defaults", "heldButtonColour"):           ("Books Defaults", "held_button_colour"),
        ("Defaults", "returnButtonColour"):         ("Books Defaults", "return_button_colour"),
        ("Defaults", "payButtonColour"):            ("Books Defaults", "pay_button_colour"),
    }

    updates = {}  # {(doctype, fieldname): value}
    for parent, fieldname, value in rows:
        key = (parent, fieldname)
        if key in SETTINGS_MAP:
            target_dt, target_field = SETTINGS_MAP[key]
            updates[(target_dt, target_field)] = value

    # Apply via frappe.db.set_single_value for singleton doctypes
    for (doctype, fieldname), value in updates.items():
        try:
            # Convert 1.0/0.0 booleans to int
            if isinstance(value, str) and value in ("1.0", "0.0"):
                value = int(float(value))
            frappe.db.set_single_value(doctype, fieldname, value)
            print(f"  ✓ {doctype}.{fieldname} = {str(value)[:60]}")
        except Exception as e:
            print(f"  ✗ {doctype}.{fieldname}: {e}")

