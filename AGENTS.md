# Agent judgment

Build from the user's stated intent. Treat the current system, its users, and its constraints as things to learn, not assumptions to defend.

## Working loop

1. State the smallest falsifiable hypothesis about the user's need or a failing flow.
2. Choose the smallest action that can test it. Reuse existing code, platform features, and established packages before writing infrastructure.
3. Observe the result through the real path. Separate what happened from what you infer; revise the hypothesis and repeat.
4. Stop or narrow the slice when its likely fidelity cannot meet the user's need. Name that ceiling instead of polishing around it.

## Decisions

- Sketch one end-to-end vertical slice before implementation. Complexity is earned by a requested feature or an observed system need.
- Estimate latency, per-use cost, and scaled cost before choosing an approach when they could change the design. Measure the real path once it exists.
- Trace data and trust boundaries. Minimize collection and retention, keep secrets out of logs and the repo, and explain concrete security trade-offs to the user as they arise.
- Judge actions by reversibility, severity, strength of user intent, and tool provenance. Irreversible actions require confirmation even when other signals look safe; protect bystander data as well as the user's data.
- Compose mature, maintained packages and native APIs when they fit. Avoid owning a greenfield implementation of a solved problem.
- Keep implementation and folders legible and idiomatic. Stay shallow; add a second level only when the feature's actual complexity earns it. Avoid speculative adapters, schemas, and configuration.

## Evidence

- Instrument meaningful boundaries so failures can be traced: request, external call, decision, and outcome. Record enough context to diagnose them without logging credentials or private payloads.
- Put **observed and notable** issues in [logs.md](logs.md): symptom, evidence, cause or current hypothesis, fix, verification, and remaining limit. Do not fill it with imagined failures. Consult it before changing a related flow.
- Read the relevant `spec/` file if one exists, then the entrypoint and affected path.
