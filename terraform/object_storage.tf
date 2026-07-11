# Object Storage buckets (uploads, backups) and an S3-compatible customer
# secret key used by the application to talk to Object Storage.

data "oci_objectstorage_namespace" "ns" {
  compartment_id = var.compartment_ocid
}

# Buckets are private (NoPublicAccess): the application serves objects via
# the application/ingress layer (MINIO_PUBLIC_URL), not by exposing the whole
# bucket, so private buckets are the safe default — Phase 3 must use
# pre-signed URLs or a proxy.
resource "oci_objectstorage_bucket" "uploads" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = "mankahi-uploads"
  access_type    = "NoPublicAccess"
}

resource "oci_objectstorage_bucket" "backups" {
  compartment_id = var.compartment_ocid
  namespace      = data.oci_objectstorage_namespace.ns.namespace
  name           = "mankahi-backups"
  access_type    = "NoPublicAccess"
}

resource "oci_identity_customer_secret_key" "s3" {
  display_name = "mankahi-s3-key"
  user_id      = var.user_ocid
}
