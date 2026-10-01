import io
import json
import re

from frappe.gettext.extractors import doctype, html_template

from frappe_books.coa import META_KEYS, STANDARD_CHART

TEMPLATE_TAG = re.compile(r"(?<![\w$])t`")
ESCAPES = {"n": "\n", "r": "\r", "t": "\t"}
# A string a model's presentation shows, e.g. `label: 'Quote'`, and the labels in its optionLabels.
PRESENTATION_STRING = re.compile(r"\b(?:label|placeholder|sub_label|description)\s*:\s*'((?:\\.|[^'\\])*)'")
OPTION_LABELS = re.compile(r"\boptionLabels\s*:\s*\{([^}]*)\}")
OPTION_LABEL = re.compile(r":\s*'((?:\\.|[^'\\])*)'")


def extract_template_strings(fileobj, keywords, comment_tags, options):
	"""Babel extractor for the /books t`...` tag. `${...}` becomes {0}, {1}, ... as in Frappe."""
	code = fileobj.read().decode("utf-8")
	for match in TEMPLATE_TAG.finditer(code):
		message, _end = read_template(code, match.end())
		if message:
			yield code.count("\n", 0, match.start()) + 1, "_", message, []


def read_template(code, start):
	"""Return the template literal body at `start` with numbered placeholders, and its end."""
	text, placeholders, index = [], 0, start
	while code[index] != "`":
		if code[index] == "\\":
			text.append(ESCAPES.get(code[index + 1], code[index + 1]))
			index += 2
		elif code.startswith("${", index):
			index = skip_expression(code, index + 2)
			text.append(f"{{{placeholders}}}")
			placeholders += 1
		else:
			text.append(code[index])
			index += 1
	# /books collapses whitespace before it looks a message up.
	return " ".join("".join(text).split()), index + 1


def skip_expression(code, index):
	"""Return the index after the `}` closing a `${` expression."""
	depth = 1
	while depth:
		char = code[index]
		if char in "'\"":
			index = skip_string(code, index + 1, char)
			continue
		if char == "`":
			index = read_template(code, index + 1)[1]
			continue
		depth += {"{": 1, "}": -1}.get(char, 0)
		index += 1
	return index


def skip_string(code, index, quote):
	"""Return the index after the quote closing a string literal."""
	while code[index] != quote:
		index += 2 if code[index] == "\\" else 1
	return index + 1


def extract_model_strings(fileobj, keywords, comment_tags, options):
	"""Babel extractor for /books models and schemas: t`...` messages, and the labels a presentation shows."""
	content = fileobj.read()
	yield from extract_template_strings(io.BytesIO(content), keywords, comment_tags, options)
	code = content.decode("utf-8")
	for match in PRESENTATION_STRING.finditer(code):
		yield line_of(code, match.start()), "_", unescape(match[1]), []
	for block in OPTION_LABELS.finditer(code):
		for match in OPTION_LABEL.finditer(block[1]):
			yield line_of(code, block.start(1) + match.start()), "_", unescape(match[1]), []


def line_of(code, index):
	return code.count("\n", 0, index) + 1


def unescape(text):
	return re.sub(r"\\(.)", lambda match: ESCAPES.get(match[1], match[1]), text)


def extract_doctype_messages(fileobj, keywords, comment_tags, options):
	"""Babel extractor for Books DocTypes: Frappe's DocType messages, and the field placeholders it skips."""
	content = fileobj.read()
	yield from doctype.extract(io.BytesIO(content), keywords, comment_tags, options)
	data = json.loads(content)
	for field in data.get("fields", []) if isinstance(data, dict) else []:
		if placeholder := field.get("placeholder"):
			comment = f"Placeholder of the {field['fieldname']} field in DocType '{data['name']}'"
			yield None, "_", placeholder, [comment]


def extract_print_format_messages(fileobj, keywords, comment_tags, options):
	"""Babel extractor for the messages of a Print Format's Jinja HTML, which Frappe's extractors skip."""
	html = json.load(fileobj).get("html") or ""
	yield from html_template.extract(io.BytesIO(html.encode()), keywords, comment_tags, options)


def extract_chart_names(fileobj, keywords, comment_tags, options):
	"""Babel extractor for chart names and the standard chart's account names."""
	chart = json.load(fileobj)
	if "tree" in chart:
		yield None, "_", chart["name"], ["Name of a chart of accounts"]
		return
	yield None, "_", STANDARD_CHART, ["Name of a chart of accounts"]
	yield from ((None, "_", name, ["Name of a standard account"]) for name in account_names(chart))


def account_names(tree):
	for name, node in tree.items():
		if name not in META_KEYS and isinstance(node, dict):
			yield name.strip()
			yield from account_names(node)
