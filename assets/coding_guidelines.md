# Coding Guidelines (Strictly Enforced)

## Example Agent direction

```txt
Please read the D:\ORCA_Engineer\ORCA_Research\Markdown_Research\coding_guidelines.md in this workspace. Then, using the instructions in Section V, transpose the following PDF to a markdown file:

* PDF: d:\ORCA_Engineer\ORCA_Research\Hyper_Research\A Methodology for Consistent Georegistration in Underwater Hyperspectral Imaging.pdf
* Output: d:\ORCA_Engineer\ORCA_Research\Markdown_Research\A Methodology for Consistent Georegistration in Underwater Hyperspectral Imaging.md

Follow these requirements:

1. Copy all technical sections and equations, but skip the abstract, bibliography, and page formatting.
2. Convert every equation to a Python code block with explicit variable names and Doxygen comments, as described in the guidelines.
3. Use the variable naming conventions and documentation standards from the guidelines.
4. Ensure all equations are correct and all variables are defined.
5 When finished, verify that all equations and variable names are consistent and match the original paper.
6. If any errors where detected or you are unable to access the file correctly, or equations do not seem correct or are missing variables, please clearly note this for review.
```

**I. Core Principles (Safety & Simplicity):**

* **NASA-Inspired Rules:** All code must adhere to principles for safety-critical systems.
* **Simple Control Flow:** Use `if/elif/else` and bounded `for` or `while` loops. Avoid recursion and complex control structures.
* **Bounded Loops:** Ensure all loops are demonstrably terminable with clear exit conditions.
* **Memory Management:** Avoid creating large objects repeatedly in tight loops. Pre-allocate or reuse objects where possible.
* **Concise Functions:** Keep functions/methods short (under ~80 lines) and focused on a single task.
* **Assertions are Critical:** Do not remove existing assertions. Add new assertions to validate parameters, return values, and state.
* **Minimal Scope:** Declare variables in the smallest possible scope (local > class > global).
* **Robust Checks:** Rigorously validate all function inputs and outputs.
* **Clarity over Complexity:** Avoid complex metaprogramming or dynamic runtime modifications. Keep imports at the top of the file.
* **Traceable Calls:** Prefer direct method calls over passing functions as variables.
* **Linter Compliance:** Write clean code that would pass tools like `pylint` and `mypy` with no warnings.

**II. Code Modification & Integrity:**

* **No Deletions or Simplifications:** Never remove existing variables, functions, or configuration settings to simplify a response, especially from shared files like `config.py`. When adding to a file, integrate the new code without deleting existing code.
* **Provide Full Code Blocks:** Always rewrite the complete function, method, or class body. Do not provide snippets, diffs, or use placeholders like `...`.
* **Preserve Robustness:** Do not remove or simplify existing error handling (`try...except`), logging, or validation checks. Add new handling for any new error conditions introduced.

**III. Naming & Consistency:**

* **Consistent Naming:** Before creating a new variable or function, check the existing codebase for similar names. Reuse or adapt existing variables and adhere strictly to the established naming convention to prevent duplicates (e.g., `max_speed` vs. `maximum_speed`).
* **Clarity & Type Hinting:** Use clear, descriptive names. Maintain and add comments and type hints for all signatures and important variables.

***IV. Documentation Standards:***

### IV.1 Program Call Examples (Quick Start First)

**Principle:** Users should be able to run a script immediately without reading the entire file. Place working examples at the top of scripts and at the start of help output.

**Script Header Template:**

```py
#!/usr/bin/env python3
## @file script_name.py
#  @brief One-line description of what this script does.
#
#  @section usage Quick Start
#  @code
#  # Basic usage:
#  python script_name.py input.txt --output results.json
#
#  # With all options:
#  python script_name.py input.txt --output results.json --verbose --format csv
#
#  # Help:
#  python script_name.py --help
#  @endcode
#
#  @section description Description
#  Detailed description of the script's purpose and functionality...
```

**CLI Help Output:** When implementing `--help` or `-h`, place usage examples before parameter descriptions:

```txt
Usage: script_name.py [OPTIONS] INPUT_FILE

Quick Start:
  python script_name.py data.csv --output results.json
  python script_name.py data.csv --verbose --format table

Options:
  --output, -o    Output file path (default: stdout)
  --format, -f    Output format: json, csv, table (default: json)
  --verbose, -v   Enable verbose logging
  --help, -h      Show this message and exit
```

**Key Requirements:**

* Place copy-paste-ready examples within the first 20 lines of any script
* Examples should use realistic filenames and common options
* Include at least one minimal example and one comprehensive example
* Ensure examples are tested and work with the current codebase

### IV.2 README.md and Demo Examples

**Principle:** When new functionality is added to the codebase, the README.md demo examples must be updated to demonstrate that functionality. This ensures documentation stays current and users discover new features.

**Update Checklist (after adding new features):**

1. Update the README.md demo/example code blocks to include new parameters or options
2. Add a brief description of the new feature in the appropriate section
3. If adding a new command or script, add a Quick Start example
4. Verify all example code in README.md still runs correctly
5. Update any version numbers or changelog entries

**README Example Section Template:**

```md
## Quick Start

​```sh
# Install dependencies
npm install

# Run with default settings
npm start

# Run with custom configuration
npm start -- --config custom.json --verbose
​```

## Demo

​```sh
# Full example with all current features
python main.py input.csv \
  --output results.json \
  --format table \
  --new-feature-flag \      # Added in v1.2
  --verbose
​```
```

### IV.3 Doxygen Comments

**Requirement:** All files, classes, and public functions must include Doxygen documentation for clear parameter and function definitions.

**Format:**

Python example:

```py
## @brief Brief description of the class/function.
#
#  Detailed description providing more context, usage examples,
#  and any important considerations.
#
#  @param parameter_name Description of the parameter.
#  @return Description of the return value.
class MyClass:
    # ...
```

**Key Requirements:**

* Use `@brief` for one-line summaries
* Document all parameters with `@param[in/out]`
* Include `@return` for non-void functions
* Add `@pre` tags matching code assertions (NASA principle compliance)
* Include `@section usage` with working examples for complex functions