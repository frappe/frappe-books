import json
import re

from frappe_books.coa import META_KEYS, STANDARD_CHART

TEMPLATE_TAG = re.compile(r"(?<![\w$])t`")
TRANSLATED_SCHEMA_KEYS = {"label", "description", "placeholder", "section", "tab"}
ESCAPES = {"n": "\n", "r": "\r", "t": "\t"}


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


def extract_schema_labels(fileobj, keywords, comment_tags, options):
	"""Babel extractor for the labels /books translates in its schema files."""
	yield from ((None, "_", message, []) for message in schema_labels(json.load(fileobj)))


def schema_labels(value):
	if isinstance(value, list):
		for item in value:
			yield from schema_labels(item)
	elif isinstance(value, dict):
		for key, item in value.items():
			if key in TRANSLATED_SCHEMA_KEYS and isinstance(item, str) and item:
				yield item
			yield from schema_labels(item)


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
