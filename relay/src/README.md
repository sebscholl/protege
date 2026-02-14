# Relay Source

Extension Surface: No

Source code for the optional relay service runtime.

This is intentionally separate from core Protege runtime modules.

Key runtime modules:

1. `index.ts`: HTTP + WS startup wiring and lifecycle.
2. `ws-auth.ts`: challenge-response control message auth.
3. `ws-connection.ts`: per-socket message/close handling.
4. `smtp-server.ts`: SMTP ingress server and stream handler.
5. `smtp-ingress.ts`: recipient/session routing for inbound SMTP streams.
6. `tunnel.ts`: binary SMTP-over-WS tunnel frame encoding/decoding.
