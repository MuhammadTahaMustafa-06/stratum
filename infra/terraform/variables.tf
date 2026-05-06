variable "kubeconfig_path" {
  type        = string
  description = "Path to kubeconfig (default works for local kind/minikube/Docker Desktop)."
  default     = "~/.kube/config"
}

variable "environment" {
  type        = string
  description = "Logical environment name (e.g. dev, staging, prod)."
  default     = "dev"
}

variable "stratum_namespace" {
  type        = string
  default     = "stratum"
}

variable "observability_namespace" {
  type        = string
  default     = "observability"
}

variable "enable_kube_prometheus_stack" {
  type        = bool
  description = "When true, installs kube-prometheus-stack (Prometheus + Grafana + Alertmanager) via Helm."
  default     = false
}

variable "prometheus_chart_version" {
  type    = string
  default = "65.1.0"
}
