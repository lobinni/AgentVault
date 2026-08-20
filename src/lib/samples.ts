export type VaultSample = {
  id: string;
  icon: string;
  category: string;
  title: string;
  reward: string;
  bond: string;
  termsUrl: string;
  specUrl: string;
  findUrl: string;
  summary: string;
};

const DEMO_CID_A =
  "https://ipfs.io/ipfs/bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku";
const DEMO_CID_B =
  "https://ipfs.io/ipfs/bafybeigdyrzt5sfp7udm7hu76uh7y26nf3efuylqabf3oclgtqy55fbzdi";

export const vaultSamples: VaultSample[] = [
  {
    id: "code-audit",
    icon: "🔍",
    category: "Security",
    title: "Smart contract security audit",
    reward: "50",
    bond: "25",
    termsUrl: DEMO_CID_A,
    specUrl: DEMO_CID_B,
    findUrl: DEMO_CID_B,
    summary: "3 criteria: reentrancy attestation, access-control test suite check, gas regression check",
  },
  {
    id: "data-pipeline",
    icon: "📊",
    category: "Data",
    title: "ETL pipeline for transaction analytics",
    reward: "30",
    bond: "15",
    termsUrl: DEMO_CID_A,
    specUrl: DEMO_CID_B,
    findUrl: DEMO_CID_B,
    summary: "2 criteria: ingestion reconciliation check, deterministic report-hash verification",
  },
  {
    id: "model-training",
    icon: "🧠",
    category: "AI / ML",
    title: "Fine-tune classification model",
    reward: "80",
    bond: "40",
    termsUrl: DEMO_CID_A,
    specUrl: DEMO_CID_B,
    findUrl: DEMO_CID_B,
    summary: "2 criteria: benchmark attestation (accuracy/F1), reproducible eval-run metric check",
  },
  {
    id: "pen-test",
    icon: "🛡️",
    category: "Security",
    title: "Web application penetration test",
    reward: "60",
    bond: "30",
    termsUrl: DEMO_CID_A,
    specUrl: DEMO_CID_B,
    findUrl: DEMO_CID_B,
    summary: "3 criteria: scanner attestation, manual PoC check, remediation coverage check",
  },
  {
    id: "invoice-recon",
    icon: "🧾",
    category: "Finance",
    title: "Reconcile 1,000 vendor invoices",
    reward: "15",
    bond: "8",
    termsUrl: DEMO_CID_A,
    specUrl: DEMO_CID_B,
    findUrl: DEMO_CID_B,
    summary: "2 criteria: match-rate benchmark check, exception-audit attestation",
  },
  {
    id: "design-system",
    icon: "🎨",
    category: "Design",
    title: "Component design system",
    reward: "35",
    bond: "18",
    termsUrl: DEMO_CID_A,
    specUrl: DEMO_CID_B,
    findUrl: DEMO_CID_B,
    summary: "2 criteria: WCAG audit attestation, Storybook build + visual diff check",
  },
];
