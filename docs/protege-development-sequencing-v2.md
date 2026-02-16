# Protege: Development Sequencing (v2)

This document outlines the recommended order of development for Protege, designed to build and test components incrementally. The sequence prioritizes proving out the core email protocol first, ensuring the Harness is designed around real email objects from day one.

For current completion state against this sequence, see `docs/status.md`.

## Milestone 1: The Gateway (Prove Email Works)

**Goal:** Create a functioning local mail server that can receive an email and send a correctly threaded reply. This milestone proves the email protocol handling is solid before any AI is introduced.

| Step | Component | Task | Test | Depends On |
|---|---|---|---|---|
| 1 | **Directory Structure** | Create the full `protege/` directory structure as specified. | `ls -R` | - |
| 2 | **Gateway (Inbound)** | Create the local `smtp-server`. It should listen on a local port (e.g., 2525), parse inbound mail with `mailparser`, and log the full parsed object to the console. | `swaks` or `curl` | Step 1 |
| 3 | **Gateway (Outbound)** | Integrate `nodemailer`. Create a simple script that takes the parsed object from Step 2 and sends a hardcoded reply email with correct `In-Reply-To` and `References` headers. | Check inbox | Step 2 |
| 4 | **End-to-End Test** | Wire Step 2 and 3 together. Send an email from a client like Thunderbird (using `localhost:2525` as SMTP server) and verify you receive a correctly threaded reply. | Manual test | Step 3 |

**Outcome of M1:** A verifiable email round-trip. The core protocol is de-risked. You know exactly what data structure the Harness will receive.

---

## Milestone 2: The Harness (Build the Brain on Real Input)

**Goal:** Build the core agent intelligence, designing it from the start to consume the real, structured email objects from the Gateway.

| Step | Component | Task | Test | Depends On |
|---|---|---|---|---|
| 5 | **Config & Memory** | Implement loading for `config/` files and initialize persona-scoped memory (`memory/{persona_id}/temporal.db` with `better-sqlite3`, plus `memory/{persona_id}/active.md` for short-horizon working memory). | `node -e "..."` | M1 |
| 6 | **Inference Harness** | Build the core LLM call loop. It must accept the parsed email object from `mailparser`, build a context (system prompt + email body), call the LLM, and return a string response. | Unit test | Step 5 |
| 7 | **Full Loop** | Wire the Gateway to the Harness. Inbound email from Step 2 now calls the Harness (Step 6), and the Harness's response is sent as the reply via the outbound Gateway (Step 3). | Manual test | Step 6 |
| 8 | **Memory (History)** | Add conversation history. Store each turn in the SQLite DB (keyed by thread ID) and retrieve it to build context for the next turn. | Unit test | Step 7 |
| 9 | **TUI** | Build the `protege chat` command as a thin email client over the local SMTP server. | Manual test | Step 8 |

**Outcome of M2:** A working, stateful AI agent that you can interact with via email (from a local client) or the TUI.

---

## Milestone 3: The Relay & Public Access

**Goal:** Make the agent accessible from the public internet, solving the port 25 problem.

| Step | Component | Task | Test | Depends On |
|---|---|---|---|---|
| 10 | **Relay Server** | Build the centralized Relay service. It should handle WebSocket connections, the `auth` handshake, and pipe raw SMTP data. | Unit test | - |
| 11 | **Gateway (Relay Client)** | Add the WebSocket client to the local Gateway. On startup, it connects to the Relay and authenticates. Inbound/outbound mail is now tunneled. | Manual test | M2, Step 10 |
| 12 | **Installation CLI** | Build the `npx create-protege` experience. It should prompt for configuration, generate an `ed25519` passport keypair, register the public key with the Relay, and write the `.env` file plus persona key material. | Manual test | Step 11 |

**Outcome of M3:** The agent is now live on the internet. You can email `{persona_pubkey}@<relay_mail_domain>` from Gmail and get a response. The zero-config installation is complete.

---

## Milestone 4: The Full Feature Set

**Goal:** Implement the remaining systems that make the agent truly intelligent and autonomous.

| Step | Component | Task | Test | Depends On |
|---|---|---|---|---|
| 13 | **Extensions (Tools)** | Build the tool-loading system and the `extensions.json` manifest. Implement the initial toolset (`web_search`, `web_fetch`). | Unit test | M2 |
| 14 | **Scheduler** | Build the `engine/scheduler/` system. Implement the `Responsibility` data model, the `node-cron` runner, and the LLM tools to manage it. | Unit test | M2 |
| 15 | **Security & Ops** | Implement the access control whitelist, error handling/retry logic, and the recursion depth system. | Unit test | M2 |
| 16 | **Extensions (Hooks)** | Build the hook-loading system. | Unit test | M2 |

**Outcome of M4:** The fully-featured Protege agent as specified. It can use tools, schedule its own tasks, and is robust against common failure modes.
