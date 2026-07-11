# Output values needed to reach the cluster and configure the application's
# object storage integration.

output "server_public_ip" {
  description = "Reserved public IP of the k3s server node."
  value       = oci_core_public_ip.server.ip_address
}

output "agent_public_ip" {
  description = "Reserved public IP of the k3s agent node."
  value       = oci_core_public_ip.agent.ip_address
}

output "kubeconfig_scp_hint" {
  description = "Command hint for retrieving the kubeconfig from the k3s server."
  value       = "ssh ubuntu@${oci_core_public_ip.server.ip_address} sudo cat /etc/rancher/k3s/k3s.yaml > kubeconfig  # then set server: to https://${oci_core_public_ip.server.ip_address}:6443 (add public IP to tls-san first, see README)"
}

output "object_storage_s3_endpoint" {
  description = "S3-compatible endpoint URL for the tenancy's Object Storage namespace."
  value       = "https://${data.oci_objectstorage_namespace.ns.namespace}.compat.objectstorage.${var.region}.oraclecloud.com"
}

output "object_storage_region" {
  description = "OCI region used for Object Storage S3-compatible access."
  value       = var.region
}

output "object_storage_namespace" {
  description = "Object Storage namespace for the tenancy."
  value       = data.oci_objectstorage_namespace.ns.namespace
}

output "object_storage_access_key" {
  description = "S3-compatible access key (customer secret key ID) for Object Storage."
  value       = oci_identity_customer_secret_key.s3.id
  sensitive   = true
}

output "object_storage_secret_key" {
  description = "S3-compatible secret key for Object Storage."
  value       = oci_identity_customer_secret_key.s3.key
  sensitive   = true
}

output "uploads_bucket_name" {
  description = "Name of the uploads bucket."
  value       = oci_objectstorage_bucket.uploads.name
}

output "backups_bucket_name" {
  description = "Name of the backups bucket."
  value       = oci_objectstorage_bucket.backups.name
}

output "k3s_token" {
  description = "k3s cluster join token shared by the server and agent nodes."
  value       = random_password.k3s_token.result
  sensitive   = true
}
