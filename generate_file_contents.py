#!/usr/bin/env python3
"""
Generate frontend/src/data/fileContents.js from actual backend source files.

Reads the file tree defined in frontend/src/data/fileTree.js, extracts all
file paths, reads each file from backend/rq-v1.0/, and writes them into
a JavaScript module that maps path -> content.
"""

import os
import re
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))
FILETREE_PATH = os.path.join(ROOT, 'frontend', 'src', 'data', 'fileTree.js')
BACKEND_ROOT = os.path.join(ROOT, 'backend', 'rq-v1.0')
OUTPUT_PATH = os.path.join(ROOT, 'frontend', 'src', 'data', 'fileContents.js')


def extract_paths_from_filetree(filetree_js: str) -> list:
    """Extract all path values from the fileTree.js JavaScript source."""
    # Match path: 'some/path' or path: "some/path"
    pattern = r"path:\s*['\"]([^'\"]+)['\"]"
    paths = re.findall(pattern, filetree_js)
    return paths


def escape_for_template_literal(content: str) -> str:
    """Escape content so it can be safely placed inside JS template literals (`...`).

    We need to escape:
    1. Backslashes: \ -> \\  (must be done first)
    2. Backticks: ` -> \`
    3. Template interpolation: ${ -> \${
    """
    # Step 1: Escape backslashes
    content = content.replace('\\', '\\\\')
    # Step 2: Escape backticks
    content = content.replace('`', '\\`')
    # Step 3: Escape template literal interpolation
    content = content.replace('${', '\\${')
    return content


def main():
    # Read fileTree.js
    with open(FILETREE_PATH, 'r', encoding='utf-8') as f:
        filetree_js = f.read()

    # Extract all file paths
    all_paths = extract_paths_from_filetree(filetree_js)

    # Deduplicate while preserving order
    seen = set()
    paths = []
    for p in all_paths:
        if p not in seen:
            seen.add(p)
            paths.append(p)

    print(f"Found {len(paths)} unique file paths in fileTree.js")

    # Read each file and build output
    lines = []
    lines.append("// Auto-generated from backend/rq-v1.0 source files")
    lines.append("// Do not edit manually — run generate_file_contents.py to regenerate")
    lines.append("")
    lines.append("const fileContents = {}")
    lines.append("")

    missing = []
    for path in paths:
        full_path = os.path.join(BACKEND_ROOT, path)
        if not os.path.isfile(full_path):
            missing.append(path)
            print(f"  WARNING: file not found: {full_path}")
            continue

        with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read()

        escaped = escape_for_template_literal(content)
        lines.append(f"fileContents['{path}'] = `{escaped}`")
        lines.append("")

    lines.append("export default fileContents")
    lines.append("")

    # Write output
    output = '\n'.join(lines)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        f.write(output)

    print(f"Wrote {len(output)} bytes to {OUTPUT_PATH}")
    print(f"Total files included: {len(paths) - len(missing)}")
    if missing:
        print(f"Missing files ({len(missing)}): {missing}")

    return 0


if __name__ == '__main__':
    sys.exit(main())
