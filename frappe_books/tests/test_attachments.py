import json
from base64 import b64encode
from unittest.mock import patch

import frappe
from frappe.tests import IntegrationTestCase

from frappe_books.patches import move_attachments_to_files
from frappe_books.tests.accounting import make_account, make_party


class IntegrationTestAttachments(IntegrationTestCase):
	def test_base64_attachments_move_to_private_files(self):
		party = make_party(make_account("Attachment Receivable", account_type="Receivable").name)
		image = "data:image/png;base64," + b64encode(b"image-bytes").decode()
		party.db_set("image", "data:image/png;base64," + b64encode(image.encode()).decode())
		entry = frappe.get_doc({"doctype": "Books Journal Entry", "name": frappe.generate_hash()})
		entry.attachment = json.dumps(
			{"name": "bill.txt", "type": "text/plain", "data": "data:text/plain;base64,YmlsbA=="}
		)
		entry.db_insert()

		move_attachments_to_files.execute()

		self.assertEqual(_file_content("Books Party", party.name, "image"), "image-bytes")
		self.assertEqual(_file_content("Books Journal Entry", entry.name, "attachment"), "bill")

	def test_attachments_over_the_upload_limit_still_move(self):
		party = make_party(make_account("Large Attachment Receivable", account_type="Receivable").name)
		party.db_set("image", "data:image/png;base64," + b64encode(b"large-image").decode())

		with patch("frappe.core.api.file.get_max_file_size", return_value=4):
			move_attachments_to_files.execute()

		self.assertEqual(_file_content("Books Party", party.name, "image"), "large-image")


def _file_content(doctype, name, fieldname):
	url = frappe.db.get_value(doctype, name, fieldname)
	file = frappe.get_doc("File", {"file_url": url, "attached_to_name": name, "attached_to_field": fieldname})
	assert url.startswith("/private/files/")
	return file.get_content()
