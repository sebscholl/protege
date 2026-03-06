# Protege: Final Specification

**Version:** 1.1
**Author:** Manus AI

## 1. Introduction & Philosophy

Protege is a minimalist, email-native AI agent designed for simplicity, self-sovereignty, and interoperability. It is a direct response to the architectural complexity of contemporary agent frameworks, which often exceed several hundred thousand lines of code to support a wide array of proprietary messaging platforms, LLM providers, and chat-centric user interfaces.

Our guiding philosophy is that **email is the ultimate open protocol for agent communication.** It is decentralized, universal, asynchronous, and supports rich content and threading natively. By embracing email as the primary interface, Protege eliminates the vast majority of gateway and harness complexity, allowing the focus to return to the core agent intelligence.

This document specifies the architecture of Protege, which is composed of three core systems:

1.  **Gateway (Email):** The system responsible for sending and receiving email.
2.  **Scheduler (Responsibilities):** The proactive scheduling system that allows the agent to execute tasks on a recurring basis.
3.  **Inference (Harness):** The core agent logic that interacts with a Large Language Model (LLM) to process requests, use tools, and generate responses.

## 2. System Architecture

The Protege architecture is designed to be maximally decentralized, with the agent's core logic and data residing entirely on the user's hardware. For users who have an open inbound port 25 (e.g., on a VPS), Protege can run entirely self-sufficiently. For the majority of users on residential networks where port 25 is blocked, an optional, lightweight, centralized **Relay** service is provided as a convenience to ensure zero-config setup.

```mermaid
graph TD
    subgraph User's Hardware
        B[Local Bot Client]
    end

    subgraph Optional Relay ($5/mo VPS)
        C[Relay Server]
    end

    A[Any Email Client] -- SMTP (port 25) --> C
    C -- WebSocket (port 443) --> B
    B -- WebSocket (port 443) --> C
    C -- SMTP (port 587) --> D[Recipient's Mail Server]

    style B fill:#cde4ff
    style C fill:#ffe4c4
```

| Component | Location | Responsibility |
|---|---|---|
| **Email Client** | User's Device | Composing and reading emails to/from the agent. Can be any standard client (Gmail, Outlook, etc.). |
| **Relay Server** | Centralized VPS | **(Optional Convenience)** Acts as a public MX endpoint. Receives email on port 25 and forwards it to the user's bot over a persistent WebSocket. Relays outbound mail. |
| **Local Bot Client** | User's Hardware | Runs the agent's core systems (Gateway, Scheduler, Inference). Maintains an outbound WebSocket to the Relay if used. All data and logic reside here. |

This hybrid model provides the best of both worlds: it allows experts to run a fully self-sovereign agent, while enabling anyone else to get started in seconds by using the Relay as a convenience. In both scenarios, all sensitive data and agent intelligence remains fully self-hosted and under the user's control.

## 3. Directory & Configuration: The Stranger's Kitchen

The physical layout of a project is its most immediate API. A well-organized project should feel like walking into a stranger's kitchen and knowing instinctively where the silverware is. The Protege directory structure is designed with this principle at its core.

```
protege/
├── .env
├── configs/
│   ├── inference.json
│   ├── system.json
├── prompts/
│   └── system.md
├── personas/
│   └── {persona_id}/
│       ├── persona.json
│       └── passport.key
├── memory/
│   └── {persona_id}/
│       ├── temporal.db
│       ├── active.md
│       ├── attachments/
│       └── logs/
├── extensions/
│   ├── extensions.json
│   ├── tools/
│   │   └── web-search/
│   │       ├── index.ts
│   │       ├── README.md
│   │       └── config.json
│   └── hooks/
│       └── log-to-slack/
│           ├── index.ts
│           ├── README.md
│           └── config.json
└── engine/
    ├── gateway/
    ├── scheduler/
    ├── harness/
    ├── cli/
    └── shared/
```

| Directory | Metaphor | Purpose |
|---|---|---|
| **`.env`** | The Keys | Secrets and machine-specific variables (`API_KEY`, `RELAY_URL`, etc.). |
| **`configs/`** | The Pantry | User-editable JSON configuration that defines runtime behavior. |
| **`prompts/`** | The Recipe Cards | User-editable markdown prompts that define agent behavior. |
| **`personas/`** | The Identity Shelf | Persona identity material and metadata (`persona.json`, `passport.key`). |
| **`memory/`** | The Refrigerator | Runtime data created and used by the agent (database, attachments, logs). |
| **`extensions/`** | The Spice Rack | Third-party add-ons (tools and hooks) to extend the agent's capabilities. |
| **`engine/`** | The Engine Room | The core, immutable source code of the Protege application. |

### 3.1. Extension Management

Extensions (tools and hooks) are self-contained directories. To enable or disable extensions, the user edits the `extensions/extensions.json` manifest file. This provides a single, clear control panel for all add-ons.

Local machine-specific secrets (for example provider API keys) should be stored in environment variables loaded from `.env`/`.env.local` or shell environment, while `configs/` remains the canonical non-secret runtime configuration surface.

## 4. Gateway (Email)

The Gateway is responsible for all email communication. It consists of two parts: the optional Relay and the local client.

### 4.1. Central Relay & Protocol

The Relay is a minimal, open-source service. Its sole purpose is to act as a bridge between the standard SMTP protocol and the local bot. The protocol is **raw SMTP tunneled over WebSocket.**

1.  The bot connects to the Relay via WebSocket and performs a signed challenge-response handshake using its local `ed25519` keypair from `passport.key`.
2.  The Relay authenticates the signature, binds the connection to the persona public key identity, and routes mail for `{persona_pubkey}@<relay_mail_domain>`.
3.  From then on, all messages on the socket are raw SMTP data streams (binary frames), piped in both directions.

### 4.2. Local Gateway Client

This component runs on the user's machine and acts as the local mail server.

*   **Connection:** Establishes a persistent outbound WebSocket connection to the Central Relay (if used), or listens directly on port 25 (if available).
*   **Inbound Processing:** When an email is received, it is parsed using `mailparser`, persisted, and acknowledged quickly. Harness inference is then enqueued asynchronously.
*   **Outbound Sending:** When the agent needs to send a reply, it uses `nodemailer` to compose the email with correct threading headers. The email is then sent via the Central Relay or a direct SMTP connection.

## 5. Scheduler (Responsibilities)

The Scheduler provides the agent with proactive capabilities. It is designed to be simple, robust, and managed entirely via email.

### 5.1. Data Model

Scheduled tasks are called "Responsibilities." They are stored in the `temporal.db` SQLite database.

```typescript
// In file: engine/scheduler/storage.ts
export type Responsibility = {
  id: string;        // UUID
  name: string;      // "Morning News Briefing"
  schedule: string;  // "0 9 * * *"
  prompt: string;    // "Check top 5 posts on HN"
  enabled: boolean;
  // ... state fields
};
```

### 5.2. Execution Flow

A `node-cron` scheduler triggers due responsibilities. The executor creates a synthetic inbound message from the responsibility's prompt and passes it to the Inference Harness. The result is emailed to the agent's owner.

## 6. Inference (Harness)

The Harness is the brain of the agent, orchestrating the interaction with the LLM, managing conversation history, and using tools.

### 6.1. Core Logic

1.  **Receive Input:** An inbound message is received, either from a real email (Gateway) or a synthetic one (Scheduler).
2.  **Build Context:** The Harness retrieves the conversation history. If the inbound email contains a `X-Protege-Recursion` header, it decrements the value and injects a note into the system prompt (e.g., "You have 3 turns remaining to resolve this.").
3.  **LLM Call:** The context is sent to the configured LLM.
4.  **Tool Use & Response:** The Harness executes tools as requested and sends the final response via the Gateway.

### 6.2. Memory & Search

For v1, conversation history search will be handled by SQLite's built-in FTS5 full-text search. Vector search is a planned future extension.

## 7. Security & Operational Concerns

*   **Access Control:** A user-configurable sender policy in `configs/security.json` (supporting wildcards) determines who the gateway will accept inbound mail from.
*   **Error Handling:** Critical operations will retry up to 3 times with exponential backoff before failing and notifying the owner.
*   **Agent-to-Agent Loops:** A `recursion_depth` setting in `configs/inference.json` (default: 3) prevents infinite loops. The agent tracks this by adding a `X-Protege-Recursion: N` header to all outbound mail, decrementing the value from any inbound mail it receives from another agent.

## 8. TUI (Terminal User Interface)

The TUI (`protege chat`) acts as a thin email client, not a new protocol. Each TUI session is a standard email thread, stored in the same database.

## 9. Estimated Total Scope

| Component | Estimated Lines of Code |
|---|---|
| Central Relay | ~400 |
| Local Gateway Client | ~200 |
| Scheduler (Responsibilities) | ~200 |
| Inference (Harness) | ~700 |
| Installation CLI & TUI | ~300 |
| **Total** | **~1,800** |
