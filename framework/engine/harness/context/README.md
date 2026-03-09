# Harness Context

Extension Surface: No

This directory owns context pipeline orchestration for harness runs.

It is responsible for:

1. Loading `configs/context.json`.
2. Executing ordered context steps.
3. Enforcing context budgets and ordering.

It is not responsible for:

1. Tool execution contracts.
2. Hook dispatch.
3. Provider adapter logic.
