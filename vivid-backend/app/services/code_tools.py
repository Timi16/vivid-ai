"""Tool schemas for the coding agent.

These tools are declared here and executed IN THE EDITOR, not here. The user's
repository is on their machine; this backend never sees it. The loop emits a
tool_call over the websocket, the extension runs it against the workspace and
posts the result back. That split is deliberate:

  - no source code is uploaded to run a tool
  - the agent sees the user's real toolchain (their node, their venv, their
    git), which a server-side copy never would
  - prompts, model choice and loop policy stay server-side and shippable

Edits are search/replace, not unified diffs. Models emit exact-match snippets
far more reliably than they emit correct @@ hunks with correct line numbers,
and a failed match is a clean, correctable error rather than a corrupted file.

APPROVAL holds the tools the editor must not run silently.
"""

APPROVAL = {"run_command"}

#: Tools whose result the loop should treat as terminal.
TERMINAL = {"finish"}


def _fn(name: str, description: str, properties: dict,
        required: list[str]) -> dict:
    return {
        "type": "function",
        "function": {
            "name": name,
            "description": description,
            "parameters": {
                "type": "object",
                "properties": properties,
                "required": required,
            },
        },
    }


SCHEMAS: list[dict] = [
    _fn("read_file",
        "Read a file from the workspace. Returns the contents with 1-based "
        "line numbers. Always read a file before editing it — an edit_file "
        "whose old_string was guessed rather than read will fail to match.",
        {
            "path": {"type": "string",
                     "description": "Workspace-relative path, e.g. src/app.ts"},
            "start_line": {"type": "integer",
                           "description": "1-based first line. Omit for the whole file."},
            "end_line": {"type": "integer", "description": "1-based last line, inclusive."},
        },
        ["path"]),

    _fn("list_dir",
        "List files and directories at a workspace-relative path. Use '.' for "
        "the workspace root. Ignored directories (node_modules, .git, dist, "
        "__pycache__, .venv) are omitted.",
        {"path": {"type": "string", "description": "Workspace-relative directory. Use '.' for root."}},
        ["path"]),

    _fn("grep",
        "Search file contents across the workspace with a regular expression. "
        "Returns matching lines with their file and line number. This is the "
        "fastest way to locate a symbol, import or call site.",
        {
            "pattern": {"type": "string", "description": "Regular expression."},
            "glob": {"type": "string",
                     "description": "Optional file filter, e.g. '**/*.ts'."},
        },
        ["pattern"]),

    _fn("edit_file",
        "Replace an exact string in a file. old_string must match the file's "
        "current contents EXACTLY, including indentation and whitespace, and "
        "must be unique unless replace_all is true — include a few surrounding "
        "lines to make it unique. The edit is shown to the user for approval "
        "before it is written.",
        {
            "path": {"type": "string", "description": "Workspace-relative path."},
            "old_string": {"type": "string",
                           "description": "Exact text to replace, copied from a read_file result."},
            "new_string": {"type": "string", "description": "Replacement text."},
            "replace_all": {"type": "boolean",
                            "description": "Replace every occurrence instead of requiring uniqueness."},
        },
        ["path", "old_string", "new_string"]),

    _fn("create_file",
        "Create a new file, or overwrite an existing one, with the given "
        "contents. Use edit_file to change part of a file that already exists.",
        {
            "path": {"type": "string", "description": "Workspace-relative path."},
            "content": {"type": "string", "description": "Full file contents."},
        },
        ["path", "content"]),

    _fn("run_command",
        "Run a shell command in the workspace root and return its output. Use "
        "this to run tests, a type checker, a build or a git command. The user "
        "must approve each command before it runs.",
        {
            "command": {"type": "string", "description": "The command line to run."},
            "cwd": {"type": "string",
                    "description": "Optional workspace-relative working directory."},
        },
        ["command"]),

    _fn("finish",
        "Call this when the task is complete, or when you cannot continue "
        "without input from the user. Summarize what you changed and anything "
        "you could not do.",
        {"summary": {"type": "string",
                     "description": "What you did, what you changed, and what is left."}},
        ["summary"]),
]

NAMES = {s["function"]["name"] for s in SCHEMAS}


SYSTEM_PROMPT = """You are Vivid Code, a coding agent working inside the user's editor.

You act on a real repository through tools. You cannot see any file you have \
not read: never guess a file's contents, its imports, or whether a symbol \
exists — read it or grep for it first.

How to work:
- Explore before you edit. grep for the symbol, list_dir the area, read the \
files you are about to change and the ones that call them.
- Make the smallest change that does the job. Match the file's existing style, \
naming and error handling instead of importing your own conventions.
- edit_file needs old_string to match the file EXACTLY as read_file returned \
it, minus the line numbers. Include surrounding lines so the match is unique.
- After changing code, verify it: run the project's tests or type checker with \
run_command when the project has them.
- If an edit fails to match, re-read the file rather than guessing again.
- Work in several small steps rather than one large one. You have a long \
budget of tool calls; use them.

When the task is done, or you need the user to decide something, call finish \
with a summary. Do not call finish before you have actually made the changes.

Keep prose between tool calls to one short line about what you are doing next. \
The user watches the tool calls; they do not want narration.
"""
