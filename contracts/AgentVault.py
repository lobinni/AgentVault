# v0.3.0
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
from genlayer import *
import typing
import json


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


class AgentVault(gl.Contract):
    mandate_count: u256
    mandate_client: TreeMap[u256, str]
    mandate_agent: TreeMap[u256, str]
    mandate_title: TreeMap[u256, str]
    mandate_terms_url: TreeMap[u256, str]
    mandate_terms_digest: TreeMap[u256, str]
    # Machine-checkable criteria spec (content-addressed JSON).
    # Each criterion declares a domain-appropriate attestation type and a
    # reproducible check the validator panel must re-execute.
    mandate_spec_url: TreeMap[u256, str]
    mandate_spec_digest: TreeMap[u256, str]
    mandate_deadline: TreeMap[u256, u256]
    mandate_reward: TreeMap[u256, u256]
    mandate_required_bond: TreeMap[u256, u256]
    mandate_bond: TreeMap[u256, u256]
    # Criterion-level findings bundle (content-addressed JSON). One finding per
    # declared criterion; every finding carries an evidence URL, an attestation
    # URL that binds the evidence content identifier, and a reproducible check
    # URL that validators re-read instead of trusting party prose.
    mandate_findings_url: TreeMap[u256, str]
    mandate_findings_digest: TreeMap[u256, str]
    mandate_log_url: TreeMap[u256, str]
    mandate_log_digest: TreeMap[u256, str]
    mandate_submission_note: TreeMap[u256, str]
    mandate_challenge_url: TreeMap[u256, str]
    mandate_challenge_digest: TreeMap[u256, str]
    mandate_challenge_note: TreeMap[u256, str]
    mandate_revision_count: TreeMap[u256, u256]
    mandate_status: TreeMap[u256, str]
    mandate_decision: TreeMap[u256, str]
    mandate_score: TreeMap[u256, u256]
    mandate_reason: TreeMap[u256, str]
    mandate_criterion_verdicts: TreeMap[u256, str]
    mandate_client_recovery: TreeMap[u256, u256]
    mandate_agent_recovery: TreeMap[u256, u256]

    total_rewards_locked: u256
    total_bonds_locked: u256
    total_agent_paid: u256
    total_client_paid: u256
    total_slashed: u256

    def __init__(self):
        self.mandate_count = u256(0)
        self.total_rewards_locked = u256(0)
        self.total_bonds_locked = u256(0)
        self.total_agent_paid = u256(0)
        self.total_client_paid = u256(0)
        self.total_slashed = u256(0)

    def _now(self) -> u256:
        raw = str(gl.message_raw["datetime"])
        year = int(raw[0:4])
        month = int(raw[5:7])
        day = int(raw[8:10])
        hour = int(raw[11:13])
        minute = int(raw[14:16])
        second = int(raw[17:19])
        adjusted_year = year - (1 if month <= 2 else 0)
        era = adjusted_year // 400
        year_of_era = adjusted_year - era * 400
        shifted_month = month - 3 if month > 2 else month + 9
        day_of_year = (153 * shifted_month + 2) // 5 + day - 1
        day_of_era = (
            year_of_era * 365
            + year_of_era // 4
            - year_of_era // 100
            + day_of_year
        )
        days_since_epoch = era * 146097 + day_of_era - 719468
        return u256(days_since_epoch * 86400 + hour * 3600 + minute * 60 + second)

    def _valid_address(self, value: str) -> bool:
        return value.startswith("0x") and len(value) == 42

    def _source_id(self, value: str) -> str:
        lowered = value.lower()
        if lowered.startswith("https://ipfs.io/ipfs/"):
            return lowered[len("https://ipfs.io/ipfs/"):].split("/")[0]
        if lowered.startswith("https://arweave.net/"):
            return lowered[len("https://arweave.net/"):].split("/")[0]
        return ""

    def _valid_source(self, value: str) -> bool:
        source_id = self._source_id(value)
        return (
            len(value) <= 500
            and len(source_id) >= 32
            and "example" not in source_id
            and "replace" not in source_id
        )

    def _valid_commitment(self, url: str, commitment: str) -> bool:
        source_id = self._source_id(url)
        return (
            source_id != ""
            and commitment.lower() == ("content:" + source_id)
        )

    def _is_party(self, mandate_id: u256, sender: str) -> bool:
        return (
            sender == self.mandate_client[mandate_id]
            or sender == self.mandate_agent[mandate_id]
        )

    def _refund_attached(self, code: str) -> str:
        """Payable validation failures must return the attached GEN, not retain it."""
        value = gl.message.value
        if value > u256(0):
            sender = gl.message.sender_address.as_hex.lower()
            _Recipient(Address(sender)).emit_transfer(value=value)
        return code

    def _neutral_refund(self, mandate_id: u256, reason: str) -> str:
        client = self.mandate_client[mandate_id]
        agent = self.mandate_agent[mandate_id]
        reward = self.mandate_reward[mandate_id]
        bond = self.mandate_bond[mandate_id]
        if reward + bond > self.balance:
            return "ESCROW_INVARIANT_BROKEN"
        self.mandate_reward[mandate_id] = u256(0)
        self.mandate_bond[mandate_id] = u256(0)
        self.total_rewards_locked = self.total_rewards_locked - reward
        self.total_bonds_locked = self.total_bonds_locked - bond
        self.total_client_paid = self.total_client_paid + reward
        self.total_agent_paid = self.total_agent_paid + bond
        self.mandate_status[mandate_id] = "RECOVERED"
        self.mandate_decision[mandate_id] = "UNVERIFIABLE"
        self.mandate_reason[mandate_id] = reason
        if reward > u256(0):
            _Recipient(Address(client)).emit_transfer(value=reward)
        if bond > u256(0):
            _Recipient(Address(agent)).emit_transfer(value=bond)
        return "RECOVERED"

    def _breach_payout(self, mandate_id: u256, reason: str) -> str:
        client = self.mandate_client[mandate_id]
        reward = self.mandate_reward[mandate_id]
        bond = self.mandate_bond[mandate_id]
        total = reward + bond
        if reward == u256(0) or bond == u256(0) or total > self.balance:
            return "ESCROW_INVARIANT_BROKEN"
        self.mandate_reward[mandate_id] = u256(0)
        self.mandate_bond[mandate_id] = u256(0)
        self.total_rewards_locked = self.total_rewards_locked - reward
        self.total_bonds_locked = self.total_bonds_locked - bond
        self.total_client_paid = self.total_client_paid + total
        self.total_slashed = self.total_slashed + bond
        self.mandate_status[mandate_id] = "SETTLED_BREACH"
        self.mandate_decision[mandate_id] = "MATERIAL_BREACH"
        self.mandate_reason[mandate_id] = reason
        _Recipient(Address(client)).emit_transfer(value=total)
        return "SETTLED_BREACH"

    @gl.public.write.payable
    def open_mandate(
        self,
        agent_address: str,
        title: str,
        terms_url: str,
        terms_digest: str,
        spec_url: str,
        required_bond: u256,
    ) -> typing.Any:
        client = gl.message.sender_address.as_hex.lower()
        agent = agent_address.lower()
        reward = gl.message.value
        if not self._valid_address(agent) or agent == client:
            return self._refund_attached("INVALID_AGENT")
        if len(title) < 5 or len(title) > 140:
            return self._refund_attached("INVALID_TITLE")
        if not self._valid_source(terms_url):
            return self._refund_attached("IMMUTABLE_TERMS_REQUIRED")
        if not self._valid_commitment(terms_url, terms_digest):
            return self._refund_attached("TERMS_COMMITMENT_MISMATCH")
        if not self._valid_source(spec_url):
            return self._refund_attached("IMMUTABLE_SPEC_REQUIRED")
        if reward == u256(0):
            return self._refund_attached("REWARD_REQUIRED")
        if required_bond == u256(0):
            return self._refund_attached("BOND_REQUIRED")

        mandate_id = self.mandate_count
        self.mandate_client[mandate_id] = client
        self.mandate_agent[mandate_id] = agent
        self.mandate_title[mandate_id] = title
        self.mandate_terms_url[mandate_id] = terms_url
        self.mandate_terms_digest[mandate_id] = terms_digest.lower()
        self.mandate_spec_url[mandate_id] = spec_url
        self.mandate_spec_digest[mandate_id] = (
            "content:" + self._source_id(spec_url)
        )
        self.mandate_deadline[mandate_id] = self._now() + u256(259200)
        self.mandate_reward[mandate_id] = reward
        self.mandate_required_bond[mandate_id] = required_bond
        self.mandate_bond[mandate_id] = u256(0)
        self.mandate_findings_url[mandate_id] = ""
        self.mandate_findings_digest[mandate_id] = ""
        self.mandate_log_url[mandate_id] = ""
        self.mandate_log_digest[mandate_id] = ""
        self.mandate_submission_note[mandate_id] = ""
        self.mandate_challenge_url[mandate_id] = ""
        self.mandate_challenge_digest[mandate_id] = ""
        self.mandate_challenge_note[mandate_id] = ""
        self.mandate_revision_count[mandate_id] = u256(0)
        self.mandate_status[mandate_id] = "OPEN"
        self.mandate_decision[mandate_id] = "PENDING"
        self.mandate_score[mandate_id] = u256(0)
        self.mandate_reason[mandate_id] = "Mandate opened; waiting for the assigned agent to post the required bond and accept."
        self.mandate_criterion_verdicts[mandate_id] = ""
        self.mandate_client_recovery[mandate_id] = u256(0)
        self.mandate_agent_recovery[mandate_id] = u256(0)
        self.mandate_count = self.mandate_count + u256(1)
        self.total_rewards_locked = self.total_rewards_locked + reward
        return "OPEN"

    @gl.public.write.payable
    def accept_mandate(self, mandate_id: u256) -> typing.Any:
        if mandate_id >= self.mandate_count:
            return self._refund_attached("MANDATE_NOT_FOUND")
        if gl.message.sender_address.as_hex.lower() != self.mandate_agent[mandate_id]:
            return self._refund_attached("AGENT_ONLY")
        if self.mandate_status[mandate_id] != "OPEN":
            return self._refund_attached("MANDATE_NOT_OPEN")
        if self._now() > self.mandate_deadline[mandate_id]:
            return self._refund_attached("ACCEPTANCE_EXPIRED")
        required = self.mandate_required_bond[mandate_id]
        if gl.message.value != required:
            return self._refund_attached("EXACT_BOND_REQUIRED")
        self.mandate_bond[mandate_id] = required
        self.mandate_status[mandate_id] = "BONDED"
        self.mandate_deadline[mandate_id] = self._now() + u256(604800)
        self.mandate_reason[mandate_id] = "Agent bonded and accepted; delivery, per-criterion findings, attestations and reproducible checks are due within seven days."
        self.total_bonds_locked = self.total_bonds_locked + required
        return "BONDED"

    @gl.public.write
    def submit_evidence(
        self,
        mandate_id: u256,
        findings_url: str,
        findings_digest: str,
        log_url: str,
        log_digest: str,
        submission_note: str,
    ) -> str:
        if mandate_id >= self.mandate_count:
            return "MANDATE_NOT_FOUND"
        sender = gl.message.sender_address.as_hex.lower()
        if sender != self.mandate_agent[mandate_id]:
            return "AGENT_ONLY"
        status = self.mandate_status[mandate_id]
        if status != "BONDED" and status != "REVISION_REQUIRED":
            return "DELIVERY_NOT_AVAILABLE"
        if self._now() > self.mandate_deadline[mandate_id]:
            return "DELIVERY_EXPIRED"
        if status == "REVISION_REQUIRED" and self.mandate_revision_count[mandate_id] >= u256(1):
            return "REVISION_ALREADY_USED"
        if not self._valid_source(findings_url) or not self._valid_source(log_url):
            return "IMMUTABLE_FINDINGS_REQUIRED"
        if not self._valid_commitment(findings_url, findings_digest):
            return "FINDINGS_COMMITMENT_MISMATCH"
        if not self._valid_commitment(log_url, log_digest):
            return "LOG_COMMITMENT_MISMATCH"
        if len(submission_note) < 30 or len(submission_note) > 1000:
            return "INVALID_SUBMISSION_NOTE"

        self.mandate_findings_url[mandate_id] = findings_url
        self.mandate_findings_digest[mandate_id] = findings_digest.lower()
        self.mandate_log_url[mandate_id] = log_url
        self.mandate_log_digest[mandate_id] = log_digest.lower()
        self.mandate_submission_note[mandate_id] = submission_note
        self.mandate_challenge_url[mandate_id] = ""
        self.mandate_challenge_digest[mandate_id] = ""
        self.mandate_challenge_note[mandate_id] = ""
        if status == "REVISION_REQUIRED":
            self.mandate_revision_count[mandate_id] = u256(1)
        self.mandate_status[mandate_id] = "DELIVERED"
        self.mandate_decision[mandate_id] = "PENDING"
        self.mandate_deadline[mandate_id] = self._now() + u256(172800)
        self.mandate_reason[mandate_id] = "Criterion-level findings locked; the client may attach counter-evidence before the verification review."
        return "DELIVERED"

    @gl.public.write
    def challenge_delivery(
        self,
        mandate_id: u256,
        challenge_url: str,
        challenge_digest: str,
        challenge_note: str,
    ) -> str:
        if mandate_id >= self.mandate_count:
            return "MANDATE_NOT_FOUND"
        if gl.message.sender_address.as_hex.lower() != self.mandate_client[mandate_id]:
            return "CLIENT_ONLY"
        if self.mandate_status[mandate_id] != "DELIVERED":
            return "DELIVERY_NOT_CHALLENGEABLE"
        if self._now() > self.mandate_deadline[mandate_id]:
            return "CHALLENGE_WINDOW_CLOSED"
        if not self._valid_source(challenge_url):
            return "IMMUTABLE_CHALLENGE_REQUIRED"
        if not self._valid_commitment(challenge_url, challenge_digest):
            return "CHALLENGE_COMMITMENT_MISMATCH"
        if len(challenge_note) < 30 or len(challenge_note) > 1000:
            return "INVALID_CHALLENGE_NOTE"

        self.mandate_challenge_url[mandate_id] = challenge_url
        self.mandate_challenge_digest[mandate_id] = challenge_digest.lower()
        self.mandate_challenge_note[mandate_id] = challenge_note
        self.mandate_status[mandate_id] = "CHALLENGED"
        self.mandate_reason[mandate_id] = "Client counter-evidence locked; criterion-level verification review is ready."
        return "CHALLENGED"

    @gl.public.write
    def adjudicate(self, mandate_id: u256) -> str:
        if mandate_id >= self.mandate_count:
            return "MANDATE_NOT_FOUND"
        sender = gl.message.sender_address.as_hex.lower()
        if not self._is_party(mandate_id, sender):
            return "PARTY_ONLY"
        status = self.mandate_status[mandate_id]
        if status != "DELIVERED" and status != "CHALLENGED":
            return "DELIVERY_NOT_READY"
        if status == "DELIVERED" and self._now() <= self.mandate_deadline[mandate_id]:
            return "CHALLENGE_WINDOW_OPEN"

        title = self.mandate_title[mandate_id]
        terms_url = self.mandate_terms_url[mandate_id]
        terms_commitment = self.mandate_terms_digest[mandate_id]
        spec_url = self.mandate_spec_url[mandate_id]
        spec_commitment = self.mandate_spec_digest[mandate_id]
        findings_url = self.mandate_findings_url[mandate_id]
        findings_commitment = self.mandate_findings_digest[mandate_id]
        log_url = self.mandate_log_url[mandate_id]
        log_commitment = self.mandate_log_digest[mandate_id]
        note = self.mandate_submission_note[mandate_id]
        challenge_url = self.mandate_challenge_url[mandate_id]
        challenge_commitment = self.mandate_challenge_digest[mandate_id]
        challenge_note = self.mandate_challenge_note[mandate_id]

        def evaluate() -> str:
            def read_source(url: str, label: str, limit: int) -> str:
                if url == "":
                    return label + "_NONE"
                try:
                    content = gl.nondet.web.render(url, mode="text").strip()
                    if len(content) < 80:
                        return label + "_UNAVAILABLE"
                    return content[:limit]
                except Exception:
                    return label + "_UNAVAILABLE"

            def parse_json(text: str) -> typing.Any:
                cleaned = text.strip()
                if cleaned.startswith("```"):
                    cleaned = cleaned.strip("`")
                    if cleaned.lower().startswith("json"):
                        cleaned = cleaned[4:]
                    cleaned = cleaned.strip()
                if not cleaned.startswith("{") or not cleaned.endswith("}"):
                    start = cleaned.find("{")
                    end = cleaned.rfind("}")
                    if start < 0 or end <= start:
                        return None
                    cleaned = cleaned[start:end + 1]
                try:
                    return json.loads(cleaned)
                except Exception:
                    return None

            spec_text = read_source(spec_url, "SPEC", 6000)
            findings_text = read_source(findings_url, "FINDINGS", 7000)
            terms = read_source(terms_url, "TERMS", 1600)
            logs = read_source(log_url, "LOGS", 1600)
            challenge = read_source(challenge_url, "CHALLENGE", 1600)

            if (
                findings_text == "FINDINGS_UNAVAILABLE"
                or logs == "LOGS_UNAVAILABLE"
            ):
                return '{"overall":"AGENT_EVIDENCE_UNAVAILABLE","results":[],"why":"agent findings bundle or execution log could not be read"}'
            if (
                spec_text == "SPEC_UNAVAILABLE"
                or terms == "TERMS_UNAVAILABLE"
                or challenge == "CHALLENGE_UNAVAILABLE"
            ):
                return '{"overall":"CLIENT_EVIDENCE_UNAVAILABLE","results":[],"why":"client spec, terms or counter-evidence could not be read"}'

            spec = parse_json(spec_text)
            bundle = parse_json(findings_text)
            criteria_ok = False
            criteria_list = []
            if isinstance(spec, dict):
                raw_criteria = spec.get("criteria")
                if isinstance(raw_criteria, list):
                    for item in raw_criteria:
                        if not isinstance(item, dict):
                            continue
                        if (
                            isinstance(item.get("id"), str)
                            and isinstance(item.get("requirement"), str)
                            and len(str(item.get("requirement"))) >= 20
                            and item.get("attestation") is not None
                            and item.get("check") is not None
                        ):
                            criteria_list.append(item)
                    if 0 < len(criteria_list) == len(raw_criteria) and len(criteria_list) <= 5:
                        criteria_ok = True
            if not criteria_ok:
                return '{"overall":"CLIENT_EVIDENCE_UNAVAILABLE","results":[],"why":"criteria spec is not a valid machine-checkable spec with 1..5 attested criteria"}'

            findings_list = []
            if isinstance(bundle, dict):
                raw_findings = bundle.get("findings")
                if isinstance(raw_findings, list):
                    findings_list = raw_findings
            findings_by_id = {}
            structural_failure = ""
            for finding in findings_list:
                if not isinstance(finding, dict):
                    structural_failure = "finding entry is not an object"
                    break
                fid = str(finding.get("criterion_id") or "")
                if fid == "":
                    structural_failure = "finding is missing criterion_id"
                    break
                findings_by_id[fid] = finding
            if structural_failure == "":
                for criterion in criteria_list:
                    cid = str(criterion.get("id"))
                    finding = findings_by_id.get(cid)
                    if finding is None:
                        structural_failure = "criterion " + cid + " has no finding"
                        break
                    evidence = str(finding.get("evidence_url") or "")
                    attestation = str(finding.get("attestation_url") or "")
                    check = str(finding.get("check_url") or "")
                    statement = str(finding.get("statement") or "")
                    if (
                        len(evidence) < 40
                        or len(attestation) < 40
                        or len(check) < 40
                        or len(statement) < 40
                    ):
                        structural_failure = (
                            "criterion "
                            + cid
                            + " finding must carry evidence, attestation, reproducible check and a statement"
                        )
                        break
            if structural_failure != "":
                refuted = []
                for criterion in criteria_list:
                    refuted.append(
                        '{"id":'
                        + json.dumps(str(criterion.get("id")))
                        + ',"verdict":"REFUTED","why":'
                        + json.dumps(structural_failure)
                        + "}"
                    )
                joined = "[" + ",".join(refuted) + "]"
                return (
                    '{"overall":"REMEDIABLE_BREACH","results":'
                    + joined
                    + ',"why":'
                    + json.dumps(
                        "findings bundle failed structural conformance: "
                        + structural_failure
                    )
                    + "}"
                )

            agent_evidence_dead = False
            dossier = ""
            for criterion in criteria_list:
                cid = str(criterion.get("id"))
                finding = findings_by_id[cid]
                evidence_url = str(finding.get("evidence_url"))
                attestation_url = str(finding.get("attestation_url"))
                check_url = str(finding.get("check_url"))
                statement = str(finding.get("statement"))
                outcome = str(finding.get("outcome") or "pass")
                evidence_commit = "content:" + self._source_id(evidence_url)
                attestation_body = read_source(
                    attestation_url, "ATTEST_" + cid, 1400
                )
                check_body = read_source(check_url, "CHECK_" + cid, 1400)
                if (
                    attestation_body == "ATTEST_" + cid + "_UNAVAILABLE"
                    or check_body == "CHECK_" + cid + "_UNAVAILABLE"
                ):
                    agent_evidence_dead = True
                dossier += (
                    "\nCRITERION "
                    + cid
                    + "\nRequirement: "
                    + str(criterion.get("requirement"))
                    + "\nDeclared attestation type: "
                    + json.dumps(criterion.get("attestation"))
                    + "\nDeclared reproducible check: "
                    + json.dumps(criterion.get("check"))
                    + "\nAgent outcome claim: "
                    + outcome
                    + "\nAgent statement: "
                    + statement
                    + "\nFinding evidence commitment: "
                    + evidence_commit
                    + "\nAttestation body read by this validator: "
                    + attestation_body
                    + "\nReproduced check body read by this validator: "
                    + check_body
                    + "\n"
                )
            if agent_evidence_dead:
                return '{"overall":"AGENT_EVIDENCE_UNAVAILABLE","results":[],"why":"an attestation or check source inside the findings bundle could not be read"}'

            prompt = f"""You are the independent AgentVault verification panel.
Real client funds and an autonomous agent liability bond depend on this ruling.
Short, party-selected prose must not settle this dispute: every criterion is
authenticated only when its attestation and its reproducible check independently
confirm the work.

MANDATE
Title: {title}
Terms content commitment: {terms_commitment}
Criteria spec commitment: {spec_commitment}
Findings bundle commitment: {findings_commitment}
Execution log commitment: {log_commitment}
Agent summary: {note}

LOCKED TERMS
{terms}

EXECUTION TRACE
{logs}

CLIENT COUNTER-EVIDENCE
Note: {challenge_note}
Commitment: {challenge_commitment}
Source body: {challenge}

CRITERION DOSSIERS (attestation and check bodies re-read by validators)
{dossier}

For EACH criterion return one verdict and one short reason:
AUTHENTICATED only when (1) the attestation is domain-appropriate, explicitly
targets this criterion and binds the stated finding evidence commitment, and
(2) the reproducible check body independently reproduces or observes the declared
requirement, and (3) the client counter-evidence does not refute it.
REFUTED otherwise, including generic or unrelated attestations, checks that do
not actually exercise the requirement, fabricated bindings, or counter-evidence
showing failure. When in doubt, prefer REFUTED over AUTHENTICATED.

Return strict JSON only:
{{"results":[{{"id":"<criterion id>","verdict":"AUTHENTICATED|REFUTED","why":"one short sentence"}}]}}"""

            raw = str(gl.nondet.exec_prompt(prompt)).strip()
            if raw.startswith("```"):
                raw = raw.strip("`")
                if raw.lower().startswith("json"):
                    raw = raw[4:]
                raw = raw.strip()
            start = raw.find("{")
            end = raw.rfind("}")
            if start < 0 or end <= start:
                return "UNVERIFIABLE"
            try:
                payload = json.loads(raw[start:end + 1])
            except Exception:
                return "UNVERIFIABLE"
            results = payload.get("results")
            if not isinstance(results, list) or len(results) == 0:
                return "UNVERIFIABLE"
            allowed = {"AUTHENTICATED": True, "REFUTED": True}
            normalized = []
            seen = {}
            for item in results:
                if not isinstance(item, dict):
                    return "UNVERIFIABLE"
                rid = str(item.get("id") or "")
                rv = str(item.get("verdict") or "").upper()
                if rid == "" or rv not in allowed:
                    return "UNVERIFIABLE"
                seen[rid] = rv
                normalized.append(
                    '{"id":'
                    + json.dumps(rid)
                    + ',"verdict":"'
                    + rv
                    + '","why":'
                    + json.dumps(str(item.get("why") or "")[:240])
                    + "}"
                )
            for criterion in criteria_list:
                if str(criterion.get("id")) not in seen:
                    return "UNVERIFIABLE"
            overall = "FULFILLED"
            for criterion in criteria_list:
                if seen[str(criterion.get("id"))] != "AUTHENTICATED":
                    overall = "REMEDIABLE_BREACH"
            return (
                '{"overall":"'
                + overall
                + '","results":['
                + ",".join(normalized)
                + '],"why":"criterion-level verification complete"}'
            )

        principle = """Two AgentVault rulings are equivalent only when they select
the same liability outcome: FULFILLED, REMEDIABLE_BREACH, MATERIAL_BREACH, or
AGENT_EVIDENCE_UNAVAILABLE or CLIENT_EVIDENCE_UNAVAILABLE, and attribute the same
verdict to each criterion. FULFILLED means every declared criterion was
authenticated through its attestation and reproduced through its check; it pays
the reward and returns the bond to the agent. REMEDIABLE_BREACH means at least one
criterion was refuted while the work remains curable; it opens exactly one bounded
revision and moves no funds. MATERIAL_BREACH means the outcome is absent,
misleading, unsafe, fabricated, unauthenticated, or cannot be cured by one
focused revision; it refunds the reward and slashes the agent bond to the client.
AGENT_EVIDENCE_UNAVAILABLE moves no funds and never allows the agent to recover its
bond unilaterally. CLIENT_EVIDENCE_UNAVAILABLE moves no funds and starts a bounded
neutral-recovery timer. These economic outcomes are never interchangeable. Compare
the material interpretation of the locked spec, findings, attestations,
reproducible checks, execution trace, and any client counter-evidence. Ignore
harmless wording differences."""

        result = gl.eq_principle.prompt_comparative(evaluate, principle)
        verdict = ""
        verdicts_json = ""
        try:
            payload = json.loads(str(result))
            verdict = str(payload.get("overall") or "").strip().upper()
            results = payload.get("results")
            if isinstance(results, list) and len(results) > 0:
                why = payload.get("why")
                verdicts_json = json.dumps({
                    "results": results,
                    "why": why if isinstance(why, str) else "",
                })
        except Exception:
            verdict = ""
        if verdict not in (
            "FULFILLED",
            "REMEDIABLE_BREACH",
            "MATERIAL_BREACH",
            "AGENT_EVIDENCE_UNAVAILABLE",
            "CLIENT_EVIDENCE_UNAVAILABLE",
        ):
            verdict = "AGENT_EVIDENCE_UNAVAILABLE"
            verdicts_json = ""

        self.mandate_criterion_verdicts[mandate_id] = verdicts_json
        self.mandate_decision[mandate_id] = verdict
        if verdict == "AGENT_EVIDENCE_UNAVAILABLE":
            self.mandate_status[mandate_id] = "AGENT_EVIDENCE_UNAVAILABLE"
            self.mandate_score[mandate_id] = u256(0)
            self.mandate_deadline[mandate_id] = self._now() + u256(172800)
            self.mandate_reason[mandate_id] = "Agent findings, attestation or check evidence was unavailable or inconsistent; only mutual recovery or client-enforced liability is permitted."
            return "AGENT_EVIDENCE_UNAVAILABLE"
        if verdict == "CLIENT_EVIDENCE_UNAVAILABLE":
            self.mandate_status[mandate_id] = "CLIENT_EVIDENCE_UNAVAILABLE"
            self.mandate_score[mandate_id] = u256(0)
            self.mandate_deadline[mandate_id] = self._now() + u256(172800)
            self.mandate_reason[mandate_id] = "Client criteria spec, terms or counter-evidence was unavailable; neutral recovery opens after the timer."
            return "CLIENT_EVIDENCE_UNAVAILABLE"
        if verdict == "REMEDIABLE_BREACH" and self.mandate_revision_count[mandate_id] == u256(0):
            authenticated = verdicts_json.count("AUTHENTICATED")
            refuted = verdicts_json.count('"REFUTED"')
            total = authenticated + refuted
            score = authenticated * 100 // total if total > 0 else 0
            self.mandate_status[mandate_id] = "REVISION_REQUIRED"
            self.mandate_score[mandate_id] = u256(score)
            self.mandate_deadline[mandate_id] = self._now() + u256(259200)
            self.mandate_reason[mandate_id] = "Validators refuted one or more criteria but the work is curable; exactly one revision is available to re-authenticate."
            return "REVISION_REQUIRED"
        if verdict == "REMEDIABLE_BREACH":
            verdict = "MATERIAL_BREACH"
            self.mandate_decision[mandate_id] = verdict

        self.mandate_status[mandate_id] = "RULING_READY"
        if verdict == "FULFILLED":
            self.mandate_score[mandate_id] = u256(100)
            self.mandate_reason[mandate_id] = "Every declared criterion was authenticated through its attestation and reproduced through its check."
        else:
            authenticated = verdicts_json.count("AUTHENTICATED")
            refuted = verdicts_json.count('"REFUTED"')
            total = authenticated + refuted
            score = authenticated * 100 // total if total > 0 else 0
            self.mandate_score[mandate_id] = u256(score)
            self.mandate_reason[mandate_id] = "Validators found an uncurable material breach of the locked mandate criteria."
        return "RULING_READY"

    @gl.public.write
    def settle(self, mandate_id: u256) -> str:
        if mandate_id >= self.mandate_count:
            return "MANDATE_NOT_FOUND"
        sender = gl.message.sender_address.as_hex.lower()
        if not self._is_party(mandate_id, sender):
            return "PARTY_ONLY"
        if self.mandate_status[mandate_id] != "RULING_READY":
            return "RULING_NOT_READY"
        decision = self.mandate_decision[mandate_id]
        if decision == "MATERIAL_BREACH":
            return self._breach_payout(
                mandate_id,
                "Material breach enforced; reward and agent liability bond paid to the client.",
            )
        if decision != "FULFILLED":
            return "INVALID_RULING"

        reward = self.mandate_reward[mandate_id]
        bond = self.mandate_bond[mandate_id]
        total = reward + bond
        if reward == u256(0) or bond == u256(0) or total > self.balance:
            return "ESCROW_INVARIANT_BROKEN"
        agent = self.mandate_agent[mandate_id]
        self.mandate_reward[mandate_id] = u256(0)
        self.mandate_bond[mandate_id] = u256(0)
        self.total_rewards_locked = self.total_rewards_locked - reward
        self.total_bonds_locked = self.total_bonds_locked - bond
        self.total_agent_paid = self.total_agent_paid + total
        self.mandate_status[mandate_id] = "SETTLED_FULFILLED"
        self.mandate_reason[mandate_id] = "Mandate fulfilled with every criterion authenticated; reward and returned liability bond paid to the agent."
        _Recipient(Address(agent)).emit_transfer(value=total)
        return "SETTLED_FULFILLED"

    @gl.public.write
    def cancel_open(self, mandate_id: u256) -> str:
        if mandate_id >= self.mandate_count:
            return "MANDATE_NOT_FOUND"
        client = self.mandate_client[mandate_id]
        if gl.message.sender_address.as_hex.lower() != client:
            return "CLIENT_ONLY"
        if self.mandate_status[mandate_id] != "OPEN":
            return "CANCELLATION_CLOSED"
        reward = self.mandate_reward[mandate_id]
        self.mandate_reward[mandate_id] = u256(0)
        self.total_rewards_locked = self.total_rewards_locked - reward
        self.total_client_paid = self.total_client_paid + reward
        self.mandate_status[mandate_id] = "CANCELLED"
        self.mandate_decision[mandate_id] = "REFUND"
        self.mandate_reason[mandate_id] = "Client cancelled before the assigned agent bonded."
        _Recipient(Address(client)).emit_transfer(value=reward)
        return "CANCELLED"

    @gl.public.write
    def claim_delivery_timeout(self, mandate_id: u256) -> str:
        if mandate_id >= self.mandate_count:
            return "MANDATE_NOT_FOUND"
        if gl.message.sender_address.as_hex.lower() != self.mandate_client[mandate_id]:
            return "CLIENT_ONLY"
        status = self.mandate_status[mandate_id]
        if status != "BONDED" and status != "REVISION_REQUIRED":
            return "DELIVERY_TIMEOUT_NOT_AVAILABLE"
        if self._now() <= self.mandate_deadline[mandate_id]:
            return "DELIVERY_WINDOW_OPEN"
        return self._breach_payout(
            mandate_id,
            "Agent missed the bounded delivery or revision deadline; liability bond slashed.",
        )

    @gl.public.write
    def approve_recovery(self, mandate_id: u256) -> str:
        if mandate_id >= self.mandate_count:
            return "MANDATE_NOT_FOUND"
        status = self.mandate_status[mandate_id]
        if (
            status != "AGENT_EVIDENCE_UNAVAILABLE"
            and status != "CLIENT_EVIDENCE_UNAVAILABLE"
        ):
            return "RECOVERY_NOT_AVAILABLE"
        sender = gl.message.sender_address.as_hex.lower()
        client = self.mandate_client[mandate_id]
        agent = self.mandate_agent[mandate_id]
        if sender == client:
            self.mandate_client_recovery[mandate_id] = u256(1)
        elif sender == agent:
            self.mandate_agent_recovery[mandate_id] = u256(1)
        else:
            return "PARTY_ONLY"
        if (
            self.mandate_client_recovery[mandate_id] == u256(1)
            and self.mandate_agent_recovery[mandate_id] == u256(1)
        ):
            return self._neutral_refund(
                mandate_id,
                "Both parties approved early neutral recovery after unavailable evidence.",
            )
        return "RECOVERY_APPROVAL_RECORDED"

    @gl.public.write
    def claim_recovery_timeout(self, mandate_id: u256) -> str:
        if mandate_id >= self.mandate_count:
            return "MANDATE_NOT_FOUND"
        sender = gl.message.sender_address.as_hex.lower()
        if not self._is_party(mandate_id, sender):
            return "PARTY_ONLY"
        status = self.mandate_status[mandate_id]
        if (
            status != "AGENT_EVIDENCE_UNAVAILABLE"
            and status != "CLIENT_EVIDENCE_UNAVAILABLE"
        ):
            return "RECOVERY_NOT_AVAILABLE"
        if self._now() <= self.mandate_deadline[mandate_id]:
            return "RECOVERY_WINDOW_OPEN"
        if status == "AGENT_EVIDENCE_UNAVAILABLE":
            if sender != self.mandate_client[mandate_id]:
                return "CLIENT_ONLY"
            return self._breach_payout(
                mandate_id,
                "Agent evidence stayed unavailable past the recovery timer; collateral enforced to the client.",
            )
        return self._neutral_refund(
            mandate_id,
            "Client evidence stayed unavailable past the recovery timer; bounded neutral recovery executed.",
        )

    @gl.public.view
    def get_mandate(self, mandate_id: u256) -> str:
        if mandate_id >= self.mandate_count:
            return "{}"
        data = {
            "id": str(mandate_id),
            "client": self.mandate_client[mandate_id],
            "agent": self.mandate_agent[mandate_id],
            "title": self.mandate_title[mandate_id],
            "terms_url": self.mandate_terms_url[mandate_id],
            "terms_digest": self.mandate_terms_digest[mandate_id],
            "spec_url": self.mandate_spec_url[mandate_id],
            "spec_digest": self.mandate_spec_digest[mandate_id],
            "deadline": str(self.mandate_deadline[mandate_id]),
            "reward": str(self.mandate_reward[mandate_id]),
            "required_bond": str(self.mandate_required_bond[mandate_id]),
            "bond": str(self.mandate_bond[mandate_id]),
            "findings_url": self.mandate_findings_url[mandate_id],
            "findings_digest": self.mandate_findings_digest[mandate_id],
            "log_url": self.mandate_log_url[mandate_id],
            "log_digest": self.mandate_log_digest[mandate_id],
            "submission_note": self.mandate_submission_note[mandate_id],
            "challenge_url": self.mandate_challenge_url[mandate_id],
            "challenge_digest": self.mandate_challenge_digest[mandate_id],
            "challenge_note": self.mandate_challenge_note[mandate_id],
            "revision_count": str(self.mandate_revision_count[mandate_id]),
            "status": self.mandate_status[mandate_id],
            "decision": self.mandate_decision[mandate_id],
            "score": str(self.mandate_score[mandate_id]),
            "reason": self.mandate_reason[mandate_id],
            "criterion_verdicts": self.mandate_criterion_verdicts[mandate_id],
        }
        return json.dumps(data, sort_keys=True, separators=(",", ":"))

    @gl.public.view
    def get_stats(self) -> str:
        data = {
            "mandate_count": str(self.mandate_count),
            "rewards_locked": str(self.total_rewards_locked),
            "bonds_locked": str(self.total_bonds_locked),
            "agent_paid": str(self.total_agent_paid),
            "client_paid": str(self.total_client_paid),
            "slashed": str(self.total_slashed),
        }
        return json.dumps(data, sort_keys=True, separators=(",", ":"))
