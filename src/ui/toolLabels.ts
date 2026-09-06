/**
 * Maps raw OpenCode tool names to human-readable action labels with emoji.
 * Used in the TOOL badge displayed in the terminal during AI streaming.
 */

interface ToolLabel {
  icon: string;
  label: string;
}

const TOOL_LABEL_MAP: Record<string, ToolLabel> = {
  // ── Filesystem ─────────────────────────────────────────────────────────────
  filesystem_read_text_file:       { icon: "📖", label: "Reading file" },
  filesystem_read_file:            { icon: "📖", label: "Reading file" },
  read_file:                       { icon: "📖", label: "Reading file" },
  read:                            { icon: "📖", label: "Reading file" },

  filesystem_write_file:           { icon: "✏️ ", label: "Writing file" },
  filesystem_write_text_file:      { icon: "✏️ ", label: "Writing file" },
  write_file:                      { icon: "✏️ ", label: "Writing file" },
  write:                           { icon: "✏️ ", label: "Writing file" },

  filesystem_edit_file:            { icon: "🔧", label: "Editing file" },
  edit_file:                       { icon: "🔧", label: "Editing file" },
  edit:                            { icon: "🔧", label: "Editing file" },
  patch:                           { icon: "🔧", label: "Patching file" },

  filesystem_list_directory:       { icon: "📁", label: "Listing directory" },
  filesystem_list_allowed_directories: { icon: "📁", label: "Listing allowed directories" },
  list_directory:                  { icon: "📁", label: "Listing directory" },
  ls:                              { icon: "📁", label: "Listing directory" },

  filesystem_create_directory:     { icon: "📂", label: "Creating directory" },
  create_directory:                { icon: "📂", label: "Creating directory" },

  filesystem_move_file:            { icon: "📦", label: "Moving file" },
  filesystem_copy_file:            { icon: "📋", label: "Copying file" },
  filesystem_delete_file:          { icon: "🗑️ ", label: "Deleting file" },
  filesystem_rename_file:          { icon: "🏷️ ", label: "Renaming file" },

  filesystem_search_files:         { icon: "🔍", label: "Searching files" },
  filesystem_find_files:           { icon: "🔍", label: "Finding files" },

  filesystem_get_file_info:        { icon: "ℹ️ ", label: "Getting file info" },
  filesystem_stat:                 { icon: "ℹ️ ", label: "Getting file info" },

  // ── Shell / Bash ───────────────────────────────────────────────────────────
  bash:                            { icon: "⚡", label: "Running command" },
  shell:                           { icon: "⚡", label: "Running command" },
  run_command:                     { icon: "⚡", label: "Running command" },
  exec:                            { icon: "⚡", label: "Running command" },
  execute:                         { icon: "⚡", label: "Running command" },
  run_terminal_cmd:                { icon: "⚡", label: "Running command" },

  // ── Search / Grep ──────────────────────────────────────────────────────────
  grep:                            { icon: "🔎", label: "Searching code" },
  grep_search:                     { icon: "🔎", label: "Searching code" },
  ripgrep:                         { icon: "🔎", label: "Searching code" },
  glob:                            { icon: "🔍", label: "Globbing files" },
  find:                            { icon: "🔍", label: "Finding files" },

  // ── Web / HTTP ─────────────────────────────────────────────────────────────
  web_search:                      { icon: "🌐", label: "Searching web" },
  search_web:                      { icon: "🌐", label: "Searching web" },
  browser:                         { icon: "🌐", label: "Opening browser" },
  fetch:                           { icon: "🌐", label: "Fetching URL" },
  http_request:                    { icon: "🌐", label: "HTTP request" },
  curl:                            { icon: "🌐", label: "Fetching URL" },

  // ── Todo / Task management ─────────────────────────────────────────────────
  todowrite:                       { icon: "📝", label: "Updating todo list" },
  todo_write:                      { icon: "📝", label: "Updating todo list" },
  todoread:                        { icon: "📋", label: "Reading todo list" },
  todo_read:                       { icon: "📋", label: "Reading todo list" },

  // ── Subagent / Task ────────────────────────────────────────────────────────
  task:                            { icon: "🤖", label: "Spawning subagent" },
  spawn_agent:                     { icon: "🤖", label: "Spawning subagent" },
  agent:                           { icon: "🤖", label: "Running agent" },

  // ── Git ────────────────────────────────────────────────────────────────────
  git_status:                      { icon: "🔀", label: "Git status" },
  git_diff:                        { icon: "🔀", label: "Git diff" },
  git_commit:                      { icon: "🔀", label: "Git commit" },
  git_log:                         { icon: "🔀", label: "Git log" },
  git:                             { icon: "🔀", label: "Git" },

  // ── AI / Model ─────────────────────────────────────────────────────────────
  openai:                          { icon: "🧠", label: "Calling model" },
  anthropic:                       { icon: "🧠", label: "Calling model" },
  gemini:                          { icon: "🧠", label: "Calling model" },
};

/**
 * Returns a friendly { icon, label } for a raw tool name.
 * Falls back to a cleaned-up version of the raw name with a wrench icon.
 */
export function getFriendlyToolLabel(rawName: string): ToolLabel {
  const exact = TOOL_LABEL_MAP[rawName];
  if (exact) return exact;

  // Partial / prefix matching — e.g. "filesystem_read_*" → Reading file
  for (const [key, val] of Object.entries(TOOL_LABEL_MAP)) {
    if (rawName.startsWith(key) || key.startsWith(rawName)) return val;
  }

  // Fallback: clean up snake_case → Title Case
  const clean = rawName
    .replace(/^(filesystem_|mcp_)/, "")  // strip common prefixes
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
  return { icon: "🔧", label: clean };
}
