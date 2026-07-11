# VCN, subnet, routing, and security (default security list + NSG) for the
# ManKahi k3s cluster.

resource "oci_core_vcn" "mankahi" {
  compartment_id = var.compartment_ocid
  cidr_blocks    = [var.vcn_cidr]
  dns_label      = "mankahi"
  display_name   = "mankahi-vcn"
}

resource "oci_core_internet_gateway" "mankahi" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.mankahi.id
  enabled        = true
  display_name   = "mankahi-igw"
}

resource "oci_core_route_table" "mankahi" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.mankahi.id
  display_name   = "mankahi-rt"

  route_rules {
    destination       = "0.0.0.0/0"
    destination_type  = "CIDR_BLOCK"
    network_entity_id = oci_core_internet_gateway.mankahi.id
  }
}

resource "oci_core_subnet" "public" {
  compartment_id             = var.compartment_ocid
  vcn_id                     = oci_core_vcn.mankahi.id
  cidr_block                 = var.subnet_cidr
  dns_label                  = "public"
  route_table_id             = oci_core_route_table.mankahi.id
  security_list_ids          = [oci_core_vcn.mankahi.default_security_list_id]
  prohibit_public_ip_on_vnic = false
  display_name               = "mankahi-public-subnet"
}

# The default security list is emptied of ingress rules entirely. OCI security
# lists are additive-only, so leaving the default list's implicit rules in
# place would open unintended ingress alongside the NSG below. All ingress
# must come through the NSG attached to each instance's VNIC.
resource "oci_core_default_security_list" "mankahi" {
  manage_default_resource_id = oci_core_vcn.mankahi.default_security_list_id

  egress_security_rules {
    destination = "0.0.0.0/0"
    protocol    = "all"
  }

  # NO ingress_security_rules — all ingress must come through the NSG.
}

resource "oci_core_network_security_group" "k3s" {
  compartment_id = var.compartment_ocid
  vcn_id         = oci_core_vcn.mankahi.id
  display_name   = "mankahi-k3s-nsg"
}

# Allow SSH only from the trusted admin CIDR.
resource "oci_core_network_security_group_security_rule" "ssh" {
  network_security_group_id = oci_core_network_security_group.k3s.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = var.admin_cidr
  source_type               = "CIDR_BLOCK"
  stateless                 = false

  tcp_options {
    destination_port_range {
      min = 22
      max = 22
    }
  }
}

# Allow HTTP from anywhere for ingress-exposed applications.
resource "oci_core_network_security_group_security_rule" "http" {
  network_security_group_id = oci_core_network_security_group.k3s.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  stateless                 = false

  tcp_options {
    destination_port_range {
      min = 80
      max = 80
    }
  }
}

# Allow HTTPS from anywhere for ingress-exposed applications.
resource "oci_core_network_security_group_security_rule" "https" {
  network_security_group_id = oci_core_network_security_group.k3s.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = "0.0.0.0/0"
  source_type               = "CIDR_BLOCK"
  stateless                 = false

  tcp_options {
    destination_port_range {
      min = 443
      max = 443
    }
  }
}

# Allow the k3s API (6443) only from the trusted admin CIDR.
resource "oci_core_network_security_group_security_rule" "k3s_api" {
  network_security_group_id = oci_core_network_security_group.k3s.id
  direction                 = "INGRESS"
  protocol                  = "6"
  source                    = var.admin_cidr
  source_type               = "CIDR_BLOCK"
  stateless                 = false

  tcp_options {
    destination_port_range {
      min = 6443
      max = 6443
    }
  }
}

# Allow all traffic between nodes within the subnet (flannel overlay, kubelet,
# etc.).
resource "oci_core_network_security_group_security_rule" "intra" {
  network_security_group_id = oci_core_network_security_group.k3s.id
  direction                 = "INGRESS"
  protocol                  = "all"
  source                    = var.subnet_cidr
  source_type               = "CIDR_BLOCK"
  stateless                 = false
}

# Allow all outbound traffic.
resource "oci_core_network_security_group_security_rule" "egress" {
  network_security_group_id = oci_core_network_security_group.k3s.id
  direction                 = "EGRESS"
  protocol                  = "all"
  destination               = "0.0.0.0/0"
  destination_type          = "CIDR_BLOCK"
  stateless                 = false
}
