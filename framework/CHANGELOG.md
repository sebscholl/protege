# Changelog

## Unreleased

### Fixed

- OpenAI provider adapter now sends `max_completion_tokens` for reasoning-series models (o1, o3, o4) instead of `max_tokens`, which these models reject as unsupported.
