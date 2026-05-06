output "stratum_namespace" {
  value = kubernetes_namespace.stratum.metadata[0].name
}

output "observability_namespace" {
  value = kubernetes_namespace.observability.metadata[0].name
}

output "kube_prometheus_release" {
  value       = try(helm_release.kube_prometheus[0].name, null)
  description = "Helm release name when enable_kube_prometheus_stack is true."
}
