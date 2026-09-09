# Mitable Montessori MCP server

This local, stdio MCP server lets Codex and Claude configure a school through
the documented external API. It exposes a focused tool for each supported
operation, validates tool inputs before a network request, and keeps the
school-wide integration key in the host environment.

It requires Node.js 22 or later.

## Setup

1. In Mitable, enable `NEXT_PUBLIC_ADMIN_EXTERNAL_API=true`, then create a
   read/write key in **Admin → API Keys**.
2. Set `MITABLE_API_KEY` in the environment that starts the MCP client. For
   local development, also set `MITABLE_API_BASE_URL=http://localhost:3100/api/public/v1`.
   Production defaults to `https://www.mitable.ng/api/public/v1`.
3. Start the server from this app:

   ```bash
   pnpm mcp
   ```

## Client configuration

Use this command in a Codex or Claude stdio MCP configuration. Replace the
path with this checkout's absolute path. Put the key only in your private local
client configuration—never in this repository or a shared configuration file.

```json
{
  "command": "pnpm",
  "args": ["--dir", "/absolute/path/to/mitable/apps/mitable-montessori", "mcp"],
  "env": {
    "MITABLE_API_KEY": "mitable_KEY_ID.SECRET",
    "MITABLE_API_BASE_URL": "https://www.mitable.ng/api/public/v1"
  }
}
```

The server deliberately exposes no arbitrary HTTP-request tool. That gives an
agent only the documented, school-scoped operations, with clear descriptions
of irreversible or sensitive actions such as archiving a student or deleting a
draft report.

Before a workflow writes, use `lookup_directory_by_email` and apply the school
policy: admins can configure the school; teachers are limited to day-to-day
work in assigned classrooms; guardians may access only their own record and
children.
