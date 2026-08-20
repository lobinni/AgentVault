import unittest
from dataclasses import dataclass


@dataclass
class Mandate:
    client: str
    agent: str
    reward: int
    required_bond: int
    deadline: int
    bond: int = 0
    status: str = "OPEN"
    decision: str = "PENDING"
    revision_count: int = 0
    client_recovery: bool = False
    agent_recovery: bool = False


class Model:
    def __init__(self):
        self.items: list[Mandate] = []
        self.balance = 0

    def open(self, client, agent, reward, bond, now=100):
        if client == agent:
            raise ValueError("INVALID_AGENT")
        self.items.append(Mandate(client, agent, reward, bond, now + 30))
        self.balance += reward
        return len(self.items) - 1

    def accept(self, item_id, sender, value, now=110):
        item = self.items[item_id]
        if sender != item.agent:
            raise PermissionError("AGENT_ONLY")
        if item.status != "OPEN":
            raise ValueError("MANDATE_NOT_OPEN")
        if now > item.deadline:
            raise ValueError("ACCEPTANCE_EXPIRED")
        if value != item.required_bond:
            raise ValueError("EXACT_BOND_REQUIRED")
        item.bond = value
        item.status = "BONDED"
        item.deadline = now + 70
        self.balance += value

    def deliver(self, item_id, sender, now=120):
        item = self.items[item_id]
        if sender != item.agent:
            raise PermissionError("AGENT_ONLY")
        if item.status not in ("BONDED", "REVISION_REQUIRED"):
            raise ValueError("DELIVERY_NOT_AVAILABLE")
        if now > item.deadline:
            raise ValueError("DELIVERY_EXPIRED")
        if item.status == "REVISION_REQUIRED":
            if item.revision_count:
                raise ValueError("REVISION_ALREADY_USED")
            item.revision_count = 1
        item.status = "DELIVERED"
        item.deadline = now + 20

    def challenge(self, item_id, sender, now=125):
        item = self.items[item_id]
        if sender != item.client:
            raise PermissionError("CLIENT_ONLY")
        if item.status != "DELIVERED" or now > item.deadline:
            raise ValueError("DELIVERY_NOT_CHALLENGEABLE")
        item.status = "CHALLENGED"

    def rule(self, item_id, decision, now=130):
        item = self.items[item_id]
        if item.status not in ("DELIVERED", "CHALLENGED"):
            raise ValueError("DELIVERY_NOT_READY")
        if item.status == "DELIVERED" and now <= item.deadline:
            raise ValueError("CHALLENGE_WINDOW_OPEN")
        if decision == "REMEDIABLE_BREACH" and item.revision_count == 0:
            item.status = "REVISION_REQUIRED"
            item.deadline = now + 30
            item.decision = decision
            return
        if decision == "REMEDIABLE_BREACH":
            decision = "MATERIAL_BREACH"
        item.decision = decision
        if decision in (
            "AGENT_EVIDENCE_UNAVAILABLE",
            "CLIENT_EVIDENCE_UNAVAILABLE",
        ):
            item.status = decision
        else:
            item.status = "RULING_READY"
        if item.status in (
            "AGENT_EVIDENCE_UNAVAILABLE",
            "CLIENT_EVIDENCE_UNAVAILABLE",
        ):
            item.deadline = now + 20

    def settle(self, item_id):
        item = self.items[item_id]
        if item.status != "RULING_READY":
            raise ValueError("RULING_NOT_READY")
        total = item.reward + item.bond
        if item.decision == "FULFILLED":
            agent, client, status = total, 0, "SETTLED_FULFILLED"
        elif item.decision == "MATERIAL_BREACH":
            agent, client, status = 0, total, "SETTLED_BREACH"
        else:
            raise ValueError("INVALID_RULING")
        self.balance -= total
        item.reward = 0
        item.bond = 0
        item.status = status
        return agent, client

    def delivery_timeout(self, item_id, sender, now):
        item = self.items[item_id]
        if sender != item.client:
            raise PermissionError("CLIENT_ONLY")
        if item.status not in ("BONDED", "REVISION_REQUIRED") or now <= item.deadline:
            raise ValueError("DELIVERY_WINDOW_OPEN")
        item.decision = "MATERIAL_BREACH"
        item.status = "RULING_READY"
        return self.settle(item_id)

    def approve_recovery(self, item_id, sender):
        item = self.items[item_id]
        if item.status not in (
            "AGENT_EVIDENCE_UNAVAILABLE",
            "CLIENT_EVIDENCE_UNAVAILABLE",
        ):
            raise ValueError("RECOVERY_NOT_AVAILABLE")
        if sender == item.client:
            item.client_recovery = True
        elif sender == item.agent:
            item.agent_recovery = True
        else:
            raise PermissionError("PARTY_ONLY")
        if item.client_recovery and item.agent_recovery:
            return self.recover(item)
        return None

    def recovery_timeout(self, item_id, sender, now):
        item = self.items[item_id]
        if sender not in (item.client, item.agent):
            raise PermissionError("PARTY_ONLY")
        if now <= item.deadline:
            raise ValueError("RECOVERY_WINDOW_OPEN")
        if item.status == "AGENT_EVIDENCE_UNAVAILABLE":
            if sender != item.client:
                raise PermissionError("CLIENT_ONLY")
            return self.breach(item)
        return self.recover(item)

    def breach(self, item):
        payout = (0, item.bond + item.reward)
        self.balance -= item.bond + item.reward
        item.bond = 0
        item.reward = 0
        item.status = "SETTLED_BREACH"
        return payout

    def recover(self, item):
        payout = (item.bond, item.reward)
        self.balance -= item.bond + item.reward
        item.bond = 0
        item.reward = 0
        item.status = "RECOVERED"
        return payout


class LifecycleTests(unittest.TestCase):
    def bonded(self):
        model = Model()
        item_id = model.open("client", "agent", 100, 40)
        model.accept(item_id, "agent", 40)
        return model, item_id

    def test_terminal_rulings_conserve_value(self):
        for decision, expected in [
            ("FULFILLED", (140, 0)),
            ("MATERIAL_BREACH", (0, 140)),
        ]:
            with self.subTest(decision=decision):
                model, item_id = self.bonded()
                model.deliver(item_id, "agent")
                model.rule(item_id, decision, now=1000)
                self.assertEqual(model.settle(item_id), expected)
                self.assertEqual(model.balance, 0)

    def test_client_counter_evidence_is_sender_bound(self):
        model, item_id = self.bonded()
        model.deliver(item_id, "agent")
        with self.assertRaisesRegex(PermissionError, "CLIENT_ONLY"):
            model.challenge(item_id, "outsider")
        model.challenge(item_id, "client")
        self.assertEqual(model.items[item_id].status, "CHALLENGED")

    def test_exactly_one_revision_then_breach(self):
        model, item_id = self.bonded()
        model.deliver(item_id, "agent")
        model.rule(item_id, "REMEDIABLE_BREACH", now=1000)
        self.assertEqual(model.items[item_id].status, "REVISION_REQUIRED")
        model.deliver(item_id, "agent")
        model.rule(item_id, "REMEDIABLE_BREACH", now=1000)
        self.assertEqual(model.items[item_id].decision, "MATERIAL_BREACH")
        self.assertEqual(model.settle(item_id), (0, 140))

    def test_missed_delivery_slashes_without_counterparty_approval(self):
        model, item_id = self.bonded()
        payout = model.delivery_timeout(item_id, "client", now=1000)
        self.assertEqual(payout, (0, 140))
        self.assertEqual(model.balance, 0)

    def test_agent_unavailable_evidence_cannot_force_bond_recovery(self):
        model, item_id = self.bonded()
        model.deliver(item_id, "agent")
        model.rule(item_id, "AGENT_EVIDENCE_UNAVAILABLE", now=1000)
        self.assertIsNone(model.approve_recovery(item_id, "client"))
        self.assertEqual(model.approve_recovery(item_id, "agent"), (40, 100))

        second, second_id = self.bonded()
        second.deliver(second_id, "agent")
        second.rule(second_id, "AGENT_EVIDENCE_UNAVAILABLE", now=1000)
        with self.assertRaisesRegex(ValueError, "RECOVERY_WINDOW_OPEN"):
            second.recovery_timeout(second_id, "client", now=1010)
        with self.assertRaisesRegex(PermissionError, "CLIENT_ONLY"):
            second.recovery_timeout(second_id, "agent", now=2000)
        self.assertEqual(
            second.recovery_timeout(second_id, "client", now=2000),
            (0, 140),
        )

    def test_unchallenged_delivery_waits_for_client_window(self):
        model, item_id = self.bonded()
        model.deliver(item_id, "agent")
        with self.assertRaisesRegex(ValueError, "CHALLENGE_WINDOW_OPEN"):
            model.rule(item_id, "FULFILLED", now=125)
        model.rule(item_id, "FULFILLED", now=1000)
        self.assertEqual(model.items[item_id].status, "RULING_READY")

    def test_client_unavailable_evidence_has_neutral_timeout(self):
        model, item_id = self.bonded()
        model.deliver(item_id, "agent")
        model.rule(item_id, "CLIENT_EVIDENCE_UNAVAILABLE", now=1000)
        self.assertEqual(
            model.recovery_timeout(item_id, "agent", now=2000),
            (40, 100),
        )


if __name__ == "__main__":
    unittest.main()
