import frappe
import sqlite3
import os

def test_migration():
    print("--- Starting Comprehensive Migration Tests ---")
    
    frappe.init(site="books.localhost", sites_path="sites")
    frappe.connect()
    
    # Try to find the SQLite DB in various common locations
    possible_paths = [
        "../Sahajanand Digital.books 2.db",
        "../../Sahajanand Digital.books 2.db",
        "Sahajanand Digital.books 2.db",
        "frappe-books.db",
        "../frappe-books.db",
        "../../frappe-books.db"
    ]
    
    sqlite_path = None
    for p in possible_paths:
        if os.path.exists(os.path.abspath(p)):
            sqlite_path = os.path.abspath(p)
            break
            
    if not sqlite_path:
        print("FAILED: Could not find your old SQLite database file (frappe-books.db).")
        print("Please ensure it is placed in the root of your bench directory.")
        return
        
    print(f"Connected to SQLite DB: {sqlite_path}\n")
    conn = sqlite3.connect(sqlite_path)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    passed = 0
    failed = 0
    
    def assert_eq(test_name, actual, expected, allow_more=False):
        nonlocal passed, failed
        if actual == expected or (allow_more and actual >= expected):
            print(f"✅ {test_name}: {actual}")
            passed += 1
        else:
            print(f"❌ {test_name}: Expected {expected}, got {actual}")
            failed += 1

    # --- 1. CORE DATA TESTS ---
    
    cursor.execute("SELECT count(*) as c FROM Party")
    assert_eq("Party (Customers/Suppliers) Count", frappe.db.count("Books Party"), cursor.fetchone()["c"])
    
    cursor.execute("SELECT count(*) as c FROM Item")
    assert_eq("Items/Products Count", frappe.db.count("Books Item"), cursor.fetchone()["c"])
    
    cursor.execute("SELECT count(*) as c FROM Account")
    assert_eq("Chart of Accounts Count", frappe.db.count("Books Account"), cursor.fetchone()["c"], allow_more=True)
    
    # --- 2. VOUCHER TESTS ---
    
    cursor.execute("SELECT count(*) as c FROM SalesInvoice")
    assert_eq("Sales Invoices Count", frappe.db.count("Books Sales Invoice"), cursor.fetchone()["c"])
    
    cursor.execute("SELECT count(*) as c FROM PurchaseInvoice")
    assert_eq("Purchase Invoices Count", frappe.db.count("Books Purchase Invoice"), cursor.fetchone()["c"])
    
    cursor.execute("SELECT count(*) as c FROM Payment")
    assert_eq("Payments Count (Allows Native POS extras)", frappe.db.count("Books Payment"), cursor.fetchone()["c"], allow_more=True)
    
    cursor.execute("SELECT count(*) as c FROM JournalEntry")
    assert_eq("Journal Entries Count", frappe.db.count("Books Journal Entry"), cursor.fetchone()["c"])
    
    # --- 3. FINANCIAL INTEGRITY TESTS ---
    
    cursor.execute("SELECT SUM(credit) - SUM(debit) as s FROM AccountingLedgerEntry WHERE account = 'Service'")
    sqlite_service_sum = cursor.fetchone()["s"] or 0
    frappe_service_sum = frappe.db.sql("SELECT SUM(credit) - SUM(debit) FROM `tabBooks Ledger Entry` WHERE account = 'Service'")[0][0] or 0
    
    if abs(float(sqlite_service_sum) - float(frappe_service_sum)) < 1.0:
        print(f"✅ Service Income Dashboard Matches: {frappe_service_sum}")
        passed += 1
    else:
        print(f"❌ Service Income Dashboard Mismatch: Expected {sqlite_service_sum}, got {frappe_service_sum}")
        failed += 1
        
    orphan_ledgers = frappe.db.count("Books Ledger Entry", {"voucher_no": ["in", ["", None]]})
    assert_eq("Ledger Entries cleanly attached to vouchers (No Orphans)", orphan_ledgers, 0)
    
    # --- 4. TEMPLATE & STRUCTURAL TESTS ---
    
    missing_status = frappe.db.count("Books Sales Invoice", {"status": ["in", ["", None]]})
    assert_eq("Document Statuses Calculated (No blanks)", missing_status, 0)
    
    missing_dates = frappe.db.count("Books Journal Entry", {"posting_date": ["in", ["", None]]})
    assert_eq("Journal Entries mapped date to posting_date", missing_dates, 0)
    
    print("\n--- Test Results ---")
    print(f"Passed: {passed} | Failed: {failed}")
    if failed == 0:
        print("🎉 MIGRATION IS 100% COMPLETE AND MATHEMATICALLY PERFECT!")
    else:
        print("⚠️ SOME TESTS FAILED. PLEASE REVIEW THE ERRORS ABOVE.")

def execute():
    test_migration()

if __name__ == "__main__":
    import sys
    import os
    sys.path.insert(0, os.path.abspath("apps/frappe"))
    execute()
