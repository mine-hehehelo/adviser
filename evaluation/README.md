# Advisor evaluation cases

`cases.json` is a proposed ten-case evaluation set for the revised PRD. It contains prompts and expected checks, **not** completed runs or scores. No private Google Doc content is copied into it.

Before a controlled run, record the final prompt/reference Doc revision, the exact model returned by OpenRouter, the configured limits, and the test account/environment. For each case, record its conversation/request ID, time, visible answer, relevant admin/event evidence, pass/fail result, and explanation. E03 needs a reference-specific expected principle written before testing. E06–E09 require isolated limits or service mocks. E10 needs a measured edit and refresh time.

The repository's automated tests cover code paths and database logic, not the final advisor persona score. Do not change `result` from `not_run` without retaining the observed evidence elsewhere in the project documentation.
