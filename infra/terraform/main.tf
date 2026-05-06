resource "kubernetes_namespace" "stratum" {
  metadata {
    name = var.stratum_namespace
    labels = {
      app         = "stratum"
      environment = var.environment
    }
  }
}

resource "kubernetes_namespace" "observability" {
  metadata {
    name = var.observability_namespace
    labels = {
      environment = var.environment
    }
  }
}

# Prometheus Operator stack: scrape-ready for ServiceMonitor CRDs and Grafana.
resource "helm_release" "kube_prometheus" {
  count            = var.enable_kube_prometheus_stack ? 1 : 0
  name             = "kube-prom"
  namespace        = kubernetes_namespace.observability.metadata[0].name
  repository       = "https://prometheus-community.github.io/helm-charts"
  chart              = "kube-prometheus-stack"
  version            = var.prometheus_chart_version
  wait               = true
  timeout            = 600
  create_namespace   = false
  skip_crds          = false

  values = [file("${path.module}/values/kube-prometheus-stack.yaml")]
}
