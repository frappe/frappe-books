# Frappe Books: V1 (Desktop) to V2 (Web) Migration Guide

This guide outlines the complete process for migrating your data and custom templates from the older Frappe Books Desktop app (Electron/SQLite) to the new Frappe Books Web app (Frappe Framework/MariaDB).

## Overview of the Changes
The architecture of Frappe Books changed significantly between the Desktop version and the Web version:
1. **Database:** SQLite → MariaDB.
2. **Templating:** Vue 2 → Jinja.
3. **Ledgers:** `AccountingLedgerEntry` → `Books Ledger Entry`.
4. **Dates:** `date` fields for journals are now `posting_date`.
5. **State Management:** Records now adhere to standard Frappe `docstatus` workflow (0 = Saved, 1 = Submitted).

---

## 1. Prerequisites
- Your v1 SQLite database file (e.g., `frappe-books.db`).
- A running instance of the new Frappe Books v2 (Frappe Framework).

## 2. Core Data Migration
The NATIVE `migrate_books.py` script provided in the Frappe Books v2 repository is a good starting point, but it requires a few critical modifications to work perfectly:

**A. Totals and Duplicates:**
If you run the script multiple times, make sure it `UPDATE`s existing records instead of skipping them to avoid duplicated child items and incorrect dashboard totals. 

**B. Ledger Sync:**
By default, bypassing the Frappe ORM with raw SQL inserts prevents the auto-generation of ledger entries. You must explicitly migrate the `AccountingLedgerEntry` table to the new `Books Ledger Entry` table so your expenses and dashboards populate.
*Mapping:*
- `referenceType` ➔ `voucher_type`
- `referenceName` ➔ `voucher_no`
- `date` ➔ `posting_date`

**C. Journal Entry Dates:**
Ensure you map the old `date` field to the new `posting_date` field for Journal Entries, or they will appear date-less.

## 3. Fixing Document Statuses
In Frappe, setting `docstatus=1` makes a document "Submitted", but it doesn't automatically calculate the string `status` field (e.g., "Unpaid", "Paid", "Saved") if you bypassed the ORM during migration.

To fix this, you must run a script after the migration that forces the ORM to recalculate the statuses:
```python
import frappe
for dt in ["Books Sales Invoice", "Books Payment", "Books Journal Entry"]:
    docs = frappe.get_all(dt, pluck="name")
    for name in docs:
        doc = frappe.get_doc(dt, name)
        doc.set_status(update=True)
        doc.db_update()
frappe.db.commit()
```

## 4. Migrating Custom Print Templates (Vue to Jinja)
If you had highly customized invoice templates in the Desktop app, they were written using Vue 2 and Tailwind CSS. The new web app uses standard Frappe Jinja templates.

### Conversion Rules:
1. Replace Vue directives: `v-if="X"` becomes `{% if X %}`.
2. Replace loops: `v-for="row in doc.items"` becomes `{% for row in doc.items %}`.
3. Change camelCase variables to snake_case (`doc.netTotal` ➔ `doc.net_total`).
4. **Amount in Words:** Change `doc.grandTotalInWords` to `totals.grand_total_in_words` (or `totals.amount_paid_in_words` for Payments).
5. Ensure `{%- set print = get_print_settings() -%}` and `{%- set totals = get_print_totals(doc) -%}` are at the top of your template.

### Restoring Tailwind CSS and A4 Scaling:
Frappe Books Web does not load Tailwind CSS globally for print formats. If your custom templates rely on Tailwind, you must inject the CDN link directly into the template HTML.

Furthermore, Chrome's print dialog scales differently than the old Electron app, which can cause large Tailwind elements to spill over onto a second page. To fix this, inject this block at the top of your templates:
```html
<link href="https://cdnjs.cloudflare.com/ajax/libs/tailwindcss/2.2.19/tailwind.min.css" rel="stylesheet">
<style>
  @media print {
    /* Scale down the layout to mimic Electron's native print zoom */
    html, body {
      font-size: 12px !important; 
    }
    /* Prevent crucial blocks from being chopped in half */
    .page-break-avoid, section, footer, .flex {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  }
</style>
```
*Note: Make sure to remove any `h-full` or `h-screen` classes from your outer `<main>` tags, as these will artificially clip the invoice height in PDF generators!*

---
## Automation Tools
I have provided two scripts in this Migration Kit to completely automate this process for the community:

1. **`core_sqlite_migrator.py`**: A vastly improved version of the official migration script. It correctly maps `AccountingLedgerEntry`, stops duplicate child items by using `UPDATE` instead of blind `INSERT`s, and fixes the `posting_date` bug on Journal Entries. Run this FIRST to pull data from your old SQLite file into MariaDB.
2. **`migrator.py`**: The Post-Migration Cleanup tool. Run this SECOND. It explicitly calls the Frappe ORM to recalculate missing statuses ("Unpaid", "Paid") and instantly injects the Tailwind CSS v2 and PDF scaling fixes into all of your Custom Print Formats.
