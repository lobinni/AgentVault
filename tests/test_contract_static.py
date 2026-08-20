import ast
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
CONTRACT = ROOT / "contracts" / "AgentVault.py"
SOURCE = CONTRACT.read_text(encoding="utf-8")
TREE = ast.parse(SOURCE)
LIVE_SCRIPT = (ROOT / "frontend" / "scripts" / "live-lifecycle.mjs").read_text(
    encoding="utf-8"
)


class AgentVaultStaticTests(unittest.TestCase):
    def test_required_header(self):
        self.assertEqual(
            SOURCE.splitlines()[:3],
            [
                "# v0.3.0",
                '# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }',
                "from genlayer import *",
            ],
        )

    def test_semantic_consensus_and_real_value(self):
        self.assertIn("gl.eq_principle.prompt_comparative", SOURCE)
        self.assertNotIn("gl.eq_principle.strict_eq", SOURCE)
        self.assertIn("gl.nondet.web.render", SOURCE)
        self.assertIn("gl.nondet.exec_prompt", SOURCE)
        self.assertIn("@gl.public.write.payable", SOURCE)
        self.assertIn("emit_transfer", SOURCE)

    def test_liability_outcomes_are_semantic_and_distinct(self):
        for marker in [
            "same liability outcome",
            "FULFILLED",
            "REMEDIABLE_BREACH",
            "MATERIAL_BREACH",
            "AGENT_EVIDENCE_UNAVAILABLE",
            "CLIENT_EVIDENCE_UNAVAILABLE",
            "never interchangeable",
        ]:
            self.assertIn(marker, SOURCE)
        self.assertNotIn('"SETTLED_PARTIAL"', SOURCE)

    def test_criterion_level_verification_is_required(self):
        for marker in [
            "mandate_spec_url",
            "mandate_findings_url",
            "mandate_criterion_verdicts",
            "AUTHENTICATED",
            "REFUTED",
            "attestation",
            "reproducible check",
            "IMMUTABLE_SPEC_REQUIRED",
            "IMMUTABLE_FINDINGS_REQUIRED",
            "FINDINGS_COMMITMENT_MISMATCH",
        ]:
            self.assertIn(marker, SOURCE)
        self.assertNotIn("mandate_success_criteria", SOURCE)
        self.assertNotIn("mandate_output_url", SOURCE)

    def test_protocol_has_challenge_revision_and_bounded_recovery(self):
        for marker in [
            "challenge_delivery",
            "mandate_challenge_url",
            "REVISION_REQUIRED",
            "mandate_revision_count",
            "claim_delivery_timeout",
            "claim_recovery_timeout",
            'gl.message_raw["datetime"]',
        ]:
            self.assertIn(marker, SOURCE)

    def test_content_commitment_is_bound_to_source_identifier(self):
        self.assertIn("def _source_id", SOURCE)
        self.assertIn("def _valid_commitment", SOURCE)
        self.assertIn('commitment.lower() == ("content:" + source_id)', SOURCE)
        self.assertNotIn("def _valid_digest", SOURCE)

    def test_public_parameter_limit(self):
        for node in ast.walk(TREE):
            if not isinstance(node, ast.FunctionDef) or not node.decorator_list:
                continue
            rendered = [ast.unparse(decorator) for decorator in node.decorator_list]
            if any(value.startswith("gl.public.") for value in rendered):
                self.assertLessEqual(len(node.args.args) - 1, 6, node.name)

    def test_no_known_runtime_or_template_regressions(self):
        for marker in [
            "mockContract",
            "demoMandates",
            "testnetAsimov",
            "run_nondet_unsafe",
            "gl.get_block_timestamp",
            "while True",
        ]:
            self.assertNotIn(marker, SOURCE)

    def test_payable_validation_refunds_before_any_state_write(self):
        contract = next(
            node for node in TREE.body
            if isinstance(node, ast.ClassDef) and node.name == "AgentVault"
        )
        methods = {
            node.name: node
            for node in contract.body
            if isinstance(node, ast.FunctionDef)
        }
        for name in ("open_mandate", "accept_mandate"):
            method = methods[name]
            rendered = [ast.unparse(item) for item in method.decorator_list]
            self.assertIn("gl.public.write.payable", rendered)
            self.assertTrue(
                any(
                    isinstance(child, ast.Call)
                    and isinstance(child.func, ast.Attribute)
                    and child.func.attr == "_refund_attached"
                    for child in ast.walk(method)
                ),
                name,
            )
        self.assertIn("def _refund_attached", SOURCE)
        self.assertIn("emit_transfer(value=value)", SOURCE)

    def test_challenge_window_and_asymmetric_unavailable_recovery(self):
        self.assertIn('return "CHALLENGE_WINDOW_OPEN"', SOURCE)
        self.assertIn('"AGENT_EVIDENCE_UNAVAILABLE"', SOURCE)
        self.assertIn('"CLIENT_EVIDENCE_UNAVAILABLE"', SOURCE)
        self.assertIn(
            'if sender != self.mandate_client[mandate_id]:',
            SOURCE,
        )

    def test_live_genvm_script_checks_payable_value_rollback(self):
        for marker in [
            '"eth_getBalance"',
            '"invalid_open_payable_rollback"',
            '"wrong_bond_payable_rollback"',
            "attachedValueRolledBack: true",
            "protocolStateUnchanged: true",
            '"challenge_delivery"',
        ]:
            self.assertIn(marker, LIVE_SCRIPT)


if __name__ == "__main__":
    unittest.main()
