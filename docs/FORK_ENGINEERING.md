# Engineering work in this community fork

Maintainer: [Anton Shcherbyna](https://github.com/thedisciple). Original project: [career-ops-hq/career-ops](https://github.com/career-ops-hq/career-ops), by Santiago Fernández de Valderrama Aparicio and contributors. The upstream license and history are preserved. Development is AI-assisted with Codex; this page distinguishes changes, observed results and unfinished work rather than attributing upstream features to the fork maintainer.

## Contributions

| Change | Problem addressed | Evidence |
|---|---|---|
| `scripts/codex-queue.mjs` | The existing full batch runner requires Bash; preliminary screening can use a Node host and read-only Codex workers | Synthetic tests plus a live Windows run |
| `scripts/codex-drafts.mjs` | Document generation should preserve employment titles, dates, identity, education and skill qualifiers | Host-owned canonical metadata; mapping tests; existing fact/render gates |
| 1C fact-gate correction | An ERP brand was incorrectly interpreted as a fabricated workflow count | Regression tests including real-count positive controls; upstream fact-gate self-tests |
| Private-data separation | CVs, queue output, logs and applications should not become portfolio artifacts | External data root; public examples use fictional candidate data |

## Architecture

```text
Public ATS feeds → upstream scanner → private URL inbox
                                    ↓
                    Host captures and validates JD
                                    ↓
                    Read-only Codex → structured card
                                    ↓
                 Host validation → private durable state
                                    ↓
                  Read-only Codex → draft text envelope
                                    ↓
                Host merges immutable CV source metadata
                                    ↓
               Upstream HTML builder → fact gates → PDF
                                    ↓
                         Candidate review / submission
```

The last step is a human action. There is no email transport or auto-submit adapter. A screening card is not an A-H report or a submitted application. Fit, personal interest and employment feasibility remain separate signals. Unknown eligibility remains explicit; an unknown hiring procedure does not imply that an employer has rejected the candidate.

Workers run outside the code checkout so they do not inherit the full evaluation workflow for a smaller task. State writes happen in the host. Queue locking and atomic replacement reduce duplicate/concurrent writes. A failed schema/fact/render gate does not publish a ready marker. Draft envelopes can be reused when source fingerprints are unchanged. Model text is still fallible; range checks and fact gates do not prove every paraphrase.

## Verification and limits

Tested locally on Windows with Node 24.19.0 and Codex CLI 0.162.0-alpha.2. The runner uses CLI flags present in that build; older versions may need upgrading. CLI authentication is retained while user configuration is not loaded. Provider usage limits still apply.

Focused checks: `node --test tests/codex-queue.test.mjs tests/codex-drafts.test.mjs tests/cv-facts-1c-brand.test.mjs` and `node verify-cv-facts.mjs --self-test`. The complete upstream suite is also run; its status must be reported separately because it contains Bash/Go/platform-sensitive checks. Passing the focused checks is not a claim that the full upstream suite passes on Windows.

Live acceptance checks use private listings and candidate data, which are not included here. Public tests use synthetic fixtures. No interview, offer, time-saving or hiring-success metrics are claimed.

## Upstream collaboration

The queue proposal is [#4838](https://github.com/career-ops-hq/career-ops/issues/4838). Existing [#4226](https://github.com/career-ops-hq/career-ops/issues/4226) concerns CLI permissions in the full batch runner; this does not claim or replace that contributor's work. A small isolated bug fix can be reviewed independently of a feature proposal. Portfolio documentation and experimental downstream drafting remain in the fork; inclusion in core is the maintainers' decision.

## Remaining work

- Broader board coverage, including company sites without supported public ATS feeds.
- A verified import of existing application history and richer review UI.
- Full A-H evaluation integration and per-form preparation beyond draft files.
- Any future send adapter needs explicit review, portal-specific rules, dedup and truthful receipt reconciliation. CAPTCHA/anti-bot blocks are surfaced rather than bypassed.

The value to another candidate is reusable Windows/Codex orchestration and recovery, not the maintainer's private search settings. To reproduce the first stage, follow [CODEX_QUEUE.md](CODEX_QUEUE.md). To prepare documents, provide your own canonical `config/cv-source.json` in the private data root using the HTML payload keys documented by the upstream builder, then run `node scripts/codex-drafts.mjs CARD_ID`. Drafting currently requires a captured `{CARD_ID}.jd.txt` and is an experimental downstream utility.
