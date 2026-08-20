# AgentVault architecture (v0.3.0)

## Actors

- Client: publishes a machine-checkable **criteria spec** and locks the reward.
- Agent: accepts by staking the exact required bond, then submits a
  **criterion-level findings bundle**.
- Client challenger: may attach immutable counter-evidence to a delivered
  outcome.
- GenLayer verification panel: does **not** judge short party-selected prose.
  It authenticates every criterion against a domain-appropriate attestation
  and reproduces it against an independently re-read check.

## Evidence integrity model

Financial disputes are settled on **reproducible, authenticated findings**,
never on narrative summaries alone.

### 1. Criteria spec (client-pinned, immutable)

Content-addressed JSON describing every criterion the agent must satisfy:

```json
{
  "version": "1",
  "domain": "security | data | content | ai-ml | finance | design | engineering",
  "criteria": [
    {
      "id": "c1",
      "requirement": "No reentrancy in withdrawal paths",
      "attestation": { "type": "audit-report", "must_assert": "..." },
      "check": { "type": "tool-run | metric-threshold | hash-match", "target": "..." }
    }
  ]
}
```

Rules: 1–5 criteria; each criterion **must** declare both an `attestation`
and a reproducible `check`. A malformed or missing spec makes the client’s own
evidence unavailable (`CLIENT_EVIDENCE_UNAVAILABLE`) and opens the bounded
neutral-recovery path — the client can no longer hold the bond hostage.

### 2. Findings bundle (agent-pinned, immutable)

Content-addressed JSON with **one finding per spec criterion**:

```json
{
  "version": "1",
  "findings": [
    {
      "criterion_id": "c1",
      "outcome": "pass",
      "evidence_url": "https://ipfs.io/ipfs/<cid>",
      "attestation_url": "https://arweave.net/<txid>",
      "check_url": "https://ipfs.io/ipfs/<cid>",
      "statement": "How the requirement is met (>= 40 chars)"
    }
  ]
}
```

- `evidence_url` — the artifact itself; its content identifier is derived
  on-chain as `content:<cid>`.
- `attestation_url` — a domain-appropriate attestation that **must explicitly
  bind the evidence commitment** (`content:<cid>`) and the criterion id.
- `check_url` — a reproducible source validators fetch and re-read themselves
  (tool output, metric endpoint, deterministic artifact).

A bundle missing any criterion, evidence, attestation or check fails
structural conformance and is recorded as **REFUTED for every criterion**
(first breach routes to the single bounded revision; a refuted revision
becomes a material breach slash).

### 3. Validator protocol (per criterion)

For each declared criterion the panel:

1. Re-reads the **attestation** and verifies it is domain-appropriate,
   targets this criterion, and binds the exact evidence commitment.
2. Re-reads the **reproducible check** and verifies it independently
   reproduces or observes the declared requirement (thresholds, deterministic
   outputs).
3. Weighs any client counter-evidence targeting the criterion.
4. Emits `AUTHENTICATED` or `REFUTED`. When in doubt the panel prefers
   `REFUTED`.

Aggregation is deterministic:
- all `AUTHENTICATED` → `FULFILLED` (score 100)
- any `REFUTED` → `REMEDIABLE_BREACH` (score = % authenticated), one revision
- `REFUTED` after revision → `MATERIAL_BREACH`
- agent-side sources unreadable → `AGENT_EVIDENCE_UNAVAILABLE`
- client-side sources unreadable → `CLIENT_EVIDENCE_UNAVAILABLE`

The per-criterion verdict list is stored on-chain
(`mandate_criterion_verdicts`) making rulings auditable criterion by
criterion — this is the difference between a verdict and an inspection record.

## Trust boundary

The frontend never judges success. It only creates transactions and renders
contract state. Terms, spec, findings, attestations, checks and challenges use
content-addressed URLs. The contract binds every commitment to the content
identifier in its URL before fetching sources and asking validators to agree
on the liability outcome.

## Settlement matrix

| Verdict | Agent | Client |
|---|---:|---:|
| FULFILLED | reward + returned bond | 0 |
| REMEDIABLE_BREACH | one bounded revision | no movement |
| MATERIAL_BREACH | 0 | reward + slashed bond |
| AGENT_EVIDENCE_UNAVAILABLE | bond only by mutual recovery | reward plus slashed bond after client timeout enforcement |
| CLIENT_EVIDENCE_UNAVAILABLE | bond after neutral recovery | reward after neutral recovery |

## Bounded exits

- The assigned agent has three days to accept and seven days to deliver.
- A curable breach receives exactly one three-day revision.
- A delivered mandate cannot be adjudicated unchallenged until the client's
  two-day challenge window closes. A filed challenge can be reviewed immediately.
- Unavailable web evidence starts a 48-hour recovery timer.
- Both parties can recover early together.
- Agent-supplied unavailable evidence never grants unilateral bond recovery; after
  the timer only the client can enforce the liability bond.
- Client-supplied unavailable evidence permits neutral recovery after the timer.

## Why GenLayer

Whether an autonomous agent achieved a business outcome cannot be reduced to an
oracle price or a deterministic boolean. The judgment requires reading natural
language terms, delivered artifacts, third-party attestations and reproducible
checks, then agreeing on their meaning. Real capital moves based on that
judgment — which is exactly why every criterion must be authenticated and
reproduced, not narrated.
