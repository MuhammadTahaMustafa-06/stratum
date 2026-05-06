# Terraform — namespaces + optional Prometheus/Grafana stack

## What this does

1. Creates Kubernetes namespaces: `stratum` (application) and `observability` (monitoring).
2. Optionally installs **kube-prometheus-stack** (Prometheus Operator, Grafana, Alertmanager, node-exporter, kube-state-metrics) when `enable_kube_prometheus_stack = true`.

## Prerequisites

- `kubectl` working against your cluster.
- Terraform >= 1.5.
- Helm provider will install charts from your machine (CI: use `terraform apply` with a kubeconfig secret).

## Usage

```bash
cd infra/terraform
cp terraform.tfvars.example terraform.tfvars
# edit tfvars — set enable_kube_prometheus_stack = true when ready
terraform init
terraform plan
terraform apply
```

## Deploy Stratum workloads

Application manifests live in `deploy/k8s/` (Kustomize). Apply after images exist in your registry:

```bash
kubectl apply -k ../../deploy/k8s/overlays/production
```

## Scraping `/metrics`

Set `METRICS_ENABLED=true` on the backend Deployment. Add a **ServiceMonitor** (if using Prometheus Operator) or extend Helm `additionalScrapeConfigs` to scrape `stratum-backend:8000/metrics`.
