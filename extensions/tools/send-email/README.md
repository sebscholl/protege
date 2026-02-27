# Send Email Tool

Extension Surface: Yes

This extension provides the `send_email` tool used by the harness to send outbound email.

## Purpose

1. Normalize outbound email tool inputs for providers and runtime execution.
2. Validate required fields before attempting delivery.
3. Delegate delivery through the standard runtime action API:
   - `context.runtime.invoke({ action: "email.send", payload })`

## Configuration

`config.json` is currently reserved for future per-tool options.

## Input Contract

Required:

1. `to: string[]`
2. `subject: string`
3. `text: string`

Optional:

1. `from: string`
2. `cc: string[]`
3. `bcc: string[]`
4. `html: string`
5. `inReplyTo: string`
6. `references: string[]`
7. `threadingMode: "reply_current" | "new_thread"`
8. `headers: Record<string, string>`
9. `attachments: Array<{ path: string; filename?: string; contentType?: string }>`

## Notes

1. Tool execution fails fast when required fields are missing.
2. Runtime must support `email.send` in `context.runtime.invoke`.
3. Recipient fields must be concrete email addresses.
4. Runtime enforces canonical persona sender identity.
5. Runtime defaults to same-thread replies; use `threadingMode: "new_thread"` only when intentionally starting a separate conversation.
6. Runtime may normalize same-thread reply subjects to preserve thread semantics.
7. Attachment descriptors are file-path based and resolved by runtime transport.
8. Completion logs include `attachmentCount` and `attachmentNames` for delivery debugging.
