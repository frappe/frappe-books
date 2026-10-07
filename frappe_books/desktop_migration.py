import frappe
import os
from frappe_books.migrate_books import execute as run_migration

@frappe.whitelist()
def trigger_desktop_migration(file_url: str) -> dict:
    if "System Manager" not in frappe.get_roles():
        frappe.throw("Not permitted", frappe.PermissionError)
        
    if file_url.startswith("/private/files/"):
        file_path = frappe.get_site_path("private", "files", file_url.split("/")[-1])
    else:
        file_path = frappe.get_site_path("public", "files", file_url.split("/")[-1])
        
    if not os.path.exists(file_path):
        frappe.throw(f"Database file not found at {file_path}")
        
    # We will just run it synchronously for simplicity in this PR
    # Pass the actual absolute file path directly to avoid confusion
    run_migration(file_path=file_path)
    return {"status": "success", "message": "Migration completed successfully!"}
