# Input variables for the ManKahi OCI Always Free k3s infrastructure.

variable "tenancy_ocid" {
  type        = string
  description = "OCID of the OCI tenancy."
}

variable "user_ocid" {
  type        = string
  description = "OCID of the OCI user used for API authentication."
}

variable "fingerprint" {
  type        = string
  description = "Fingerprint of the API signing key uploaded to the OCI user."
}

variable "private_key_path" {
  type        = string
  description = "Filesystem path to the PEM-encoded private key matching the API signing key fingerprint."
}

variable "region" {
  type        = string
  description = "OCI home region identifier (e.g. us-ashburn-1). This choice is permanent for Always Free resources."
}

variable "compartment_ocid" {
  type        = string
  description = "OCID of the compartment in which all resources will be created."
}

variable "ssh_public_key" {
  type        = string
  description = "Contents of the SSH public key (single line) to inject into both instances for the ubuntu user."
}

variable "admin_cidr" {
  type        = string
  description = "CIDR allowed to reach SSH (22) and the k3s API (6443). Must not be 0.0.0.0/0."

  validation {
    condition     = var.admin_cidr != "0.0.0.0/0" && var.admin_cidr != ""
    error_message = "admin_cidr must be a specific CIDR (e.g. your.ip/32), never 0.0.0.0/0."
  }
}

variable "k3s_version" {
  type        = string
  default     = "v1.33.13+k3s1"
  description = "k3s release version to install on both server and agent nodes."
}

variable "instance_shape" {
  type        = string
  default     = "VM.Standard.A1.Flex"
  description = "Compute shape for both instances. VM.Standard.A1.Flex is the Always Free Ampere ARM shape."
}

variable "instance_ocpus" {
  type        = number
  default     = 2
  description = "Number of OCPUs allocated to each A1.Flex instance."
}

variable "instance_memory_in_gbs" {
  type        = number
  default     = 12
  description = "Amount of memory (in GB) allocated to each A1.Flex instance."
}

variable "boot_volume_size_in_gbs" {
  type        = number
  default     = 50
  description = "Boot volume size (in GB) for each instance."
}

variable "vcn_cidr" {
  type        = string
  default     = "10.0.0.0/16"
  description = "CIDR block for the ManKahi VCN."
}

variable "subnet_cidr" {
  type        = string
  default     = "10.0.1.0/24"
  description = "CIDR block for the public regional subnet."
}

variable "server_private_ip" {
  type        = string
  default     = "10.0.1.10"
  description = "Static private IP assigned to the k3s server node."
}

variable "agent_private_ip" {
  type        = string
  default     = "10.0.1.11"
  description = "Static private IP assigned to the k3s agent node."
}

variable "availability_domain_index" {
  type        = number
  default     = 0
  description = "Index into the list of availability domains in the region to place instances in. Useful to retry a different AD on capacity errors."
}
