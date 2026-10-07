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
                         User authorization → durable outbox → host Gmail → SENT receipt → tracker
```

The fork adds a bounded email outbox with a host-provided Gmail transport, source and prior-contact gates, attachment fingerprints, durable attempts, delivery-failure evidence and canonical tracker reconciliation. See [AUTOMATIC_EMAIL.md](AUTOMATIC_EMAIL.md). ATS form submission remains separate. A screening card is not an A-H report or a submitted application. Fit, personal interest and employment feasibility remain separate signals. Unknown eligibility remains explicit; an unknown hiring procedure does not imply that an employer has rejected the candidate.

Workers run outside the code checkout so they do not inherit the full evaluation workflow for a smaller task. State writes happen in the host. Queue locking and atomic replacement reduce duplicate/concurrent writes. A failed schema/fact/render gate does not publish a ready marker. Draft envelopes can be reused when source fingerprints are unchanged. Model text is still fallible; range checks and fact gates do not prove every paraphrase.

## Verification and limits

Tested locally on Windows with Node 24.19.0 and Codex CLI 0.162.0-alpha.2. The runner uses CLI flags present in that build; older versions may need upgrading. CLI authentication is retained while user configuration is not loaded. Provider usage limits still apply.

Focused checks: `node --test tests/codex-queue.test.mjs tests/codex-drafts.test.mjs tests/cv-facts-1c-brand.test.mjs` and `node verify-cv-facts.mjs --self-test`. The complete upstream suite is also run; its status must be reported separately because it contains Bash/Go/platform-sensitive checks. Passing the focused checks is not a claim that the full upstream suite passes on Windows.

Latest focused validation covers 22 passing tests across queue, document drafts, the 1C correction, prior-contact checks, review links, email outbox and canonical tracker sync. This includes a simulated 100-send grant, delivery-failure reconciliation, at-most-once attempts and idempotent tracker imports that exclude unsubmitted or ambiguous attempts. The full upstream suite has unresolved Windows/platform failures and is not green; focused acceptance checks do not replace it. The isolated 1C brand fix is offered in [draft PR #4840](https://github.com/career-ops-hq/career-ops/pull/4840). A launcher should use `node scripts/codex-drafts.mjs --check CARD_ID` (exit 0 means current) rather than rely on the existence of `ready.json` alone.

Live acceptance checks use private listings and candidate data, which are not included here. Public tests use synthetic fixtures. No interview, offer, time-saving or hiring-success metrics are claimed.

## Upstream collaboration

The queue proposal is [#4838](https://github.com/career-ops-hq/career-ops/issues/4838). Existing [#4226](https://github.com/career-ops-hq/career-ops/issues/4226) concerns CLI permissions in the full batch runner; this does not claim or replace that contributor's work. A small isolated bug fix can be reviewed independently of a feature proposal. Portfolio documentation and experimental downstream drafting remain in the fork; inclusion in core is the maintainers' decision.

## Remaining work

- Broader board coverage, including company sites without supported public ATS feeds.
- A verified import of existing application history and richer review UI.
- Full A-H evaluation integration and per-form preparation beyond draft files.
- Portal-specific ATS submission remains unfinished. CAPTCHA/anti-bot blocks are surfaced rather than bypassed. Gmail automation requires a connected host; a standalone terminal does not send mail.

The value to another candidate is reusable Windows/Codex orchestration and recovery, not the maintainer's private search settings. To reproduce the first stage, follow [CODEX_QUEUE.md](CODEX_QUEUE.md). To prepare documents, provide your own canonical `config/cv-source.json` in the private data root using the HTML payload keys documented by the upstream builder, then run `node scripts/codex-drafts.mjs CARD_ID`. Drafting currently requires a captured `{CARD_ID}.jd.txt` and is an experimental downstream utility.

Email acceptance tests use fictional data and a simulated 100-send campaign. They do not demonstrate 100 delivered applications, interviews or offers. Real candidate campaign records stay private.
