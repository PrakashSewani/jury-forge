OUTPUT SCHEMA (a single JSON object):
{
  "findings": [
    {
      "file": "path exactly as shown in the diff, new-side path",
      "line": <integer: the new-side line number, as printed in the left column of the annotated diff>,
      "severity": "critical" | "high" | "medium" | "low",
      "category": "short label, for example sql-injection, null-deref, missing-test",
      "claim": "one sentence: what is wrong and why it matters",
      "evidence": "the exact code text from the cited line (a short verbatim quote)",
      "confidence": <number between 0 and 1>
    }
  ]
}
Return {"findings": []} when you find no defects. Do not pad the list: report only issues you can
point to in the diff. Report each distinct issue once.

SEVERITY RUBRIC (use it exactly):
- critical: exploitable security flaw, secret exposure, data loss or corruption in normal use.
- high: a likely bug or vulnerability under ordinary inputs or ordinary attacker capability.
- medium: a bug that needs unusual input or state, weak validation, or a meaningful test gap.
- low: minor correctness risk, maintainability, or a style issue with a concrete downside.
