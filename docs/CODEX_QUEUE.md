# Codex screening queue (community extension)

This extension by Anton Shcherbyna adds a Node-native, bounded **pre-screen** queue to [career-ops](https://github.com/career-ops-hq/career-ops), created by Santiago Fernández de Valderrama Aparicio and its contributors. Development is AI-assisted with Codex. Upstream code, attribution and MIT license remain intact. This community fork is not an official upstream release.

## What works

- Windows and other Node platforms without a Bash runner.
- Independent fit and interest scores, cited source evidence, explicit employment uncertainty.
- Host-owned atomic state and result files; a read-only Codex worker returns structured JSON.
- Resume interrupted jobs, retain completed cards, explicitly retry failures, hold questions for review.
- A configurable batch size: three is the initial calibration size, not a lifetime limit.

## Run

Install repository dependencies and sign into the Codex CLI. Set an external private data root containing `cv.md`, `config/profile.yml`, and optionally `modes/_profile.md` and `modes/_custom.md`.

```powershell
$env:CAREER_OPS_ROOT = 'C:\private\career-data'
node scripts/codex-queue.mjs --input C:\private\career-data\jobs.jsonl --dry-run --limit 100
node scripts/codex-queue.mjs --input C:\private\career-data\jobs.jsonl --limit 3
node scripts/codex-queue.mjs --status
```

Input is unchecked URL lines from `data/pipeline.md` or JSONL. A captured JD avoids another fetch. Example (fictional):

```json
{"url":"https://example.com/jobs/123","jd":"Example employer seeks a robotics test engineer for calibration, repeatable manipulation experiments and documented failure analysis. Employment eligibility has not been confirmed."}
```

Without `jd`, the host tries upstream `fetch-jd.mjs`. An unsupported or empty response fails visibly; it is never replaced by an invented description. Live posting verification is a separate step.

`--limit 100` allows processing up to 100 pending postings in this run. Requests are sequential; actual throughput depends on provider limits and model latency. `--timeout` sets a per-worker deadline in milliseconds. `--codex` selects a real executable (not a `.cmd` shell shim on Windows); `--model` is optional. Existing CLI authentication is used; no separate API integration is added. CLI usage consumes the limits of the account/provider configured for that CLI.

## Data and recovery

Results, captured JDs, private logs, schema and state live under `{DATA_ROOT}/data/codex-queue/`. State records CV/JD hashes so reviewers can identify the sources used. `prepared` means a **screening card**, not a submitted application, finished A-H evaluation or generated CV. No application tracker rows, report numbers, emails or ATS submissions are created by this script. Use the existing career-ops evaluation/document workflows after reviewing selected cards.

Completed and held cards are not repeated. Retry failed jobs with `--retry-failed`. Interrupted `processing` jobs resume on the next run. If the process was killed and left `run.lock`, inspect its recorded PID and confirm that no runner is active before removing the stale lock. Nonzero exit indicates a failed job remains in state, including a failure from an earlier run.

CV and JD are sent to the model provider configured in the CLI. Read-only limits writes; it is not a confidentiality guarantee. Keep personal data outside the code repository. Prompts forbid tools and treat payload as untrusted; JSON validation checks structure and ranges, not factual truth. Human review is still required. The host cannot prove work rights or employer willingness to sponsor.

## Engineering evidence

```powershell
node --test tests/codex-queue.test.mjs
node test-all.mjs
```

Tests use fictional data and a fake worker to cover dedup, resume, lock exclusion, bounded processing, held decisions, malformed responses, explicit retries and subprocess timeout. A live Codex run is an additional acceptance check, not implied by unit tests. No hiring outcomes are claimed.

The separation is deliberate: scanner obtains listings → host supplies captured evidence → model produces a card → host validates and persists → candidate reviews → existing document/application workflows. This keeps inference failures away from tracker persistence and external submission.

Upstream issue [#4226](https://github.com/career-ops-hq/career-ops/issues/4226) already discusses CLI permissions/Codex support for the existing full batch runner. This narrower extension does not replace that work. Discuss it with maintainers before proposing core inclusion; portfolio-only documentation should stay in the fork.
