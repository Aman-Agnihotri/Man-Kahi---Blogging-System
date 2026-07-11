# Availability domain / image lookups and the two Always Free A1.Flex
# compute instances (k3s server + agent), including their reserved public IPs.

data "oci_identity_availability_domains" "ads" {
  compartment_id = var.tenancy_ocid
}

data "oci_core_images" "ubuntu" {
  compartment_id           = var.compartment_ocid
  operating_system         = "Canonical Ubuntu"
  operating_system_version = "24.04"
  shape                    = var.instance_shape
  sort_by                  = "TIMECREATED"
  sort_order               = "DESC"
}

resource "random_password" "k3s_token" {
  length  = 32
  special = false
}

resource "oci_core_instance" "server" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index].name
  compartment_id      = var.compartment_ocid
  display_name        = "mankahi-k3s-server"
  shape               = var.instance_shape

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_in_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = false
    private_ip       = var.server_private_ip
    hostname_label   = "server"
    nsg_ids          = [oci_core_network_security_group.k3s.id]
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_size_in_gbs
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init/k3s-server.yaml.tftpl", {
      k3s_version = var.k3s_version
      k3s_token   = random_password.k3s_token.result
    }))
  }
}

resource "oci_core_instance" "agent" {
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index].name
  compartment_id      = var.compartment_ocid
  display_name        = "mankahi-k3s-agent"
  shape               = var.instance_shape
  depends_on          = [oci_core_instance.server]

  shape_config {
    ocpus         = var.instance_ocpus
    memory_in_gbs = var.instance_memory_in_gbs
  }

  create_vnic_details {
    subnet_id        = oci_core_subnet.public.id
    assign_public_ip = false
    private_ip       = var.agent_private_ip
    hostname_label   = "agent"
    nsg_ids          = [oci_core_network_security_group.k3s.id]
  }

  source_details {
    source_type             = "image"
    source_id               = data.oci_core_images.ubuntu.images[0].id
    boot_volume_size_in_gbs = var.boot_volume_size_in_gbs
  }

  metadata = {
    ssh_authorized_keys = var.ssh_public_key
    user_data = base64encode(templatefile("${path.module}/cloud-init/k3s-agent.yaml.tftpl", {
      k3s_version = var.k3s_version
      k3s_token   = random_password.k3s_token.result
      server_ip   = var.server_private_ip
    }))
  }
}

# Reserved public IPs survive instance recreation (unlike ephemeral public
# IPs, which are destroyed and re-allocated with the VNIC). Reserving them
# means the server/agent addresses used in DNS, admin_cidr allowances, and
# kubeconfig do not change across `terraform apply` cycles that replace an
# instance.
data "oci_core_vnic_attachments" "server" {
  compartment_id      = var.compartment_ocid
  instance_id         = oci_core_instance.server.id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index].name
}

data "oci_core_private_ips" "server" {
  vnic_id    = data.oci_core_vnic_attachments.server.vnic_attachments[0].vnic_id
  ip_address = var.server_private_ip
}

resource "oci_core_public_ip" "server" {
  compartment_id = var.compartment_ocid
  lifetime       = "RESERVED"
  display_name   = "mankahi-k3s-server-ip"
  private_ip_id  = data.oci_core_private_ips.server.private_ips[0].id
}

data "oci_core_vnic_attachments" "agent" {
  compartment_id      = var.compartment_ocid
  instance_id         = oci_core_instance.agent.id
  availability_domain = data.oci_identity_availability_domains.ads.availability_domains[var.availability_domain_index].name
}

data "oci_core_private_ips" "agent" {
  vnic_id    = data.oci_core_vnic_attachments.agent.vnic_attachments[0].vnic_id
  ip_address = var.agent_private_ip
}

resource "oci_core_public_ip" "agent" {
  compartment_id = var.compartment_ocid
  lifetime       = "RESERVED"
  display_name   = "mankahi-k3s-agent-ip"
  private_ip_id  = data.oci_core_private_ips.agent.private_ips[0].id
}
