param(
    [string]$Contract = "contracts/AgentVault.py"
)

Write-Host "Deployment is intentionally manual."
Write-Host "After local verification and explicit approval, run:"
Write-Host "genlayer deploy --contract $Contract --rpc https://studio.genlayer.com/api"
