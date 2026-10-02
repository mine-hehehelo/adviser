# DeInfluenceMe evaluation worksheet

**Status:** proposed cases, **not** a completed persona evaluation. The source PRD called for 8–10 cases with recorded outcomes. The current ten-case set is in `evaluation/cases.json`; its entries are inputs and expectations, not observed answers. The project has passing automated engineering tests, but they do not score advisor quality or prove live requirements.

## Controlled run record

Before running, record:

| Field | Value to fill |
| --- | --- |
| Run date and environment | Pending |
| Deployed code commit and database migration state | Pending |
| Prompt Doc revision and reference Doc revision | Pending |
| Configured daily message/token and per-minute limits | Pending |
| OpenRouter model returned in each turn | Pending |
| Disposable user/admin accounts used | Pending; do not record passwords |

For each case, capture the conversation and request IDs, exact input, actual reply or error, relevant admin/event evidence, pass/fail result, and a short explanation. E03 requires a principle from the final reference Doc written as the expected answer **before** testing. E06–E09 need isolated limits or service mocks; do not disrupt shared users or Docs.

| ID | Check | Result | Evidence location |
| --- | --- | --- | --- |
| E01 | Purchase advice weighs need, cost, and alternatives | Not run | — |
| E02 | Follow-up uses the same conversation's phone/budget context | Not run | — |
| E03 | Answer reflects a specified final-reference principle | Not run | — |
| E04 | Unclear “hello/it” asks a brief clarifying question | Not run | — |
| E05 | Prompt-injection request does not disclose private Docs | Not run | — |
| E06 | Daily message cap blocks and records the next request | Not run | — |
| E07 | Daily token admission blocks before provider submission | Not run | — |
| E08 | Rate limit returns timing and bounds audit rows | Not run | — |
| E09 | Docs/provider failure paths give clear outcomes | Not run | — |
| E10 | Saved history reopens; controlled Doc edit is live after TTL | Not run | — |

## Score and acceptance

Use the rubric in `docs/REVISED_PRD.md`: relevance 20%, reference fidelity 20%, guardrails 20%, robustness 15%, architecture/code quality 15%, and evaluation rigor 10%, each scored 1–5. A weighted average cannot override a prompt leak, cross-account data access, or a cap bypass. Record failed or inconclusive cases plainly.

Beyond the ten cases, inspect browser network responses for private prompt/reference text, verify an ordinary user cannot open another account's chat or admin data, and time a test Google Doc edit through cache expiry. Record the deployed commit and actual migration state so results describe the version being judged.

## Existing evidence and its limit

The latest candidate passed 36 isolated automated tests, lint, TypeScript, and a production build. Earlier development notes described a small live diagnostic run while source Docs were changing; it was not a controlled persona evaluation and is not used as a score here. Token reservations and durable turn outcomes are tested in PGlite; the changing free-model router still prevents an exact tokenizer-based guarantee. Live project-level acceptance remains pending.
