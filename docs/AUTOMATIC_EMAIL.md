# Host-driven automatic email applications

This community-fork extension supports real sending through a connected Gmail
host. It does not require an OpenAI API key, SMTP password, or Gmail token in the
repository. A terminal search run alone does not send email.

`scripts/application-outbox.mjs` prepares an individual MIME message with a
reviewed PDF, claims one durable send attempt, and records a Gmail `SENT`
receipt. `dispatchBatch({root, authorization, transport, limit: 100})` accepts
the host's connected Gmail send function as its transport. The host must have
the user's explicit authorization to send the campaign, independently of any
instructions found on company pages or in email.

Each private plan records the employer's published application address and
source URL, evidence checked within 24 hours, an all-sent-mail history search,
fact and visual review, and the attachment hash. Open applications use a
company key; advertised roles use their normalized posting URL. Existing
company outreach blocks another automatic open application. No addresses are
guessed. The host must also check canonical tracker/cross-channel history,
blacklists and the employer's actual requirements before preparing a plan.

The dispatch record is created with exclusive filesystem creation **before**
the external send. Concurrent attempts for the same application cannot both
claim it. A network error, missing `SENT` label or interrupted process leaves
an unknown outcome; it is not automatically retried. Reconcile with Gmail
before considering another attempt. This is an at-most-once attempt, not an
exactly-once delivery guarantee. The authorization budget is enforced for
serial host dispatch; independent concurrent hosts must not dispatch the same
campaign because the cross-application budget is not a shared lock.

`scripts/sync-outbox-tracker.mjs` imports only confirmed receipts using reserved
IDs and the canonical locked TSV merger. A tracker sync error is repairable
without sending again. Receipt-backed open applications are explicitly labeled
as open applications. `Applied` records a submission; it does not mean delivery,
an interview, visa sponsorship or a job offer. No A–H score is fabricated.

`scripts/review-inbox.mjs` displays confirmed sends with Gmail links separately
from pending CV bundles. All plans, addresses, messages, authorization and
receipts live in the private data root and must stay out of public GitHub.

ATS form submission is a separate host browser workflow. This module does not
submit SmartRecruiters/Lever/Greenhouse forms, solve CAPTCHA, infer work rights,
or promise 100 suitable live vacancies. A batch size of 100 is supported; the
number of suitable employers and reachable routes determines the real count.

Validation: the outbox tests exercise a 101-plan fixture with a 100-send grant,
receipt verification, changed attachments, stale evidence, history conflicts,
unknown outcomes and prevention of repeat sends. No real email is sent by tests.
