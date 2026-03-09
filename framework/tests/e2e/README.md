# E2E

Extension Surface: No

End-to-end integration coverage across relay, gateway, harness, and persistence boundaries.

Current suites:

1. `relay-roundtrip.test.ts`: happy-path relay ingress -> harness tool-call -> relay outbound.
2. `relay-failures.test.ts`: unknown persona rejection and relay outbound pre-auth failure propagation.
