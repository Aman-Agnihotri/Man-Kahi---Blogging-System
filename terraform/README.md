# ManKahi Terraform — OCI Always Free k3s

This module provisions the ManKahi production infrastructure on Oracle Cloud
Infrastructure (OCI) using only Always Free eligible resources: a VCN, two
`VM.Standard.A1.Flex` (Ampere ARM) compute instances running a two-node k3s
cluster (one server, one agent), reserved public IPs, and two Object Storage
buckets (uploads, backups) with an S3-compatible customer secret key.

## 1. Prerequisites

- **An OCI account upgraded to Pay-As-You-Go (PAYG).** Add a card on file.
  This keeps you at $0/month as long as you stay within Always Free limits,
  but it is not optional for this module: Always Free A1.Flex instances on
  purely free-tier (non-PAYG) accounts are more aggressively reclaimed when
  idle, and PAYG accounts get better scheduling priority when capacity is
  scarce (see section 2).
- **An API signing key** registered against the OCI user that will run
  Terraform. You will need:
  - the user's OCID (`user_ocid`)
  - the key's fingerprint (`fingerprint`)
  - the local path to the PEM private key (`private_key_path`)
- **Home region warning.** The home region you choose for a tenancy is
  **permanent** and cannot be changed later. Some regions are heavily
  contested for A1.Flex capacity and frequently return "Out of host
  capacity" errors (see section 2). Consider this before committing to a
  region.

## 2. A1 capacity errors & retry strategy

Oracle Cloud's Always Free Ampere A1.Flex shape is popular, and it is common
to hit:

```
Error: 500-InternalError, Out of host capacity.
```

This is a plain Terraform error, not a bug in this module. It is safe to:

- Simply re-run `terraform apply` later (capacity frees up over time).
- Try a different `availability_domain_index` if your region has more than
  one availability domain — set it in `terraform.tfvars` and re-apply.
- Be patient; PAYG accounts (see section 1) are given scheduling priority
  over free-tier-only accounts, so upgrading can materially improve success
  odds.

## 3. Usage

```sh
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars and fill in every REPLACE_ME_* value

terraform init
terraform plan   # should be clean (no errors) against an empty compartment
terraform apply
```

## 4. OS firewall pitfall

Ubuntu images published for OCI ship with `iptables` REJECT rules configured
in the OS firewall itself, entirely independent of OCI security lists/NSGs.
If left in place, these rules silently break flannel (the k3s CNI) and
kubelet-to-kubelet traffic, and the agent node will never successfully join
the cluster — with no obvious error pointing at the firewall as the cause.

Both cloud-init templates (`cloud-init/k3s-server.yaml.tftpl` and
`cloud-init/k3s-agent.yaml.tftpl`) flush `iptables`/`ip6tables`, set all
default policies to `ACCEPT`, and persist the now-empty table with
`netfilter-persistent save` so it survives reboots. This is safe because the
VCN's NSG (section 5) already enforces the real ingress boundary.

## 5. Network exposure model

- The VCN's **default security list** is managed down to zero ingress rules
  (only an egress-all rule remains). OCI security lists are additive-only,
  so this prevents any implicit/default ingress from ever being present.
- All real ingress control lives in the **NSG** (`mankahi-k3s-nsg`), attached
  to both instances' VNICs, which allows only:
  - SSH (22) and the k3s API (6443) from `admin_cidr`
  - HTTP (80) and HTTPS (443) from anywhere
  - all traffic between nodes within the subnet
- **NodePorts are NOT internet-reachable.** Applications must be exposed
  through an ingress controller listening on 80/443, not via NodePort
  services.

## 6. Post-apply: kubeconfig

Reaching the k3s API over its public IP requires that public IP to be
present in the API server's TLS certificate SAN list, which k3s does not add
by default. This is a one-time manual step per cluster:

1. SSH into the server node:
   ```sh
   ssh ubuntu@<server_public_ip>
   ```
2. Edit (or create) `/etc/rancher/k3s/config.yaml` and add:
   ```yaml
   tls-san:
     - <server_public_ip>
   ```
3. Restart k3s to pick up the new SAN:
   ```sh
   sudo systemctl restart k3s
   ```
4. Retrieve the kubeconfig. Plain `scp` will fail because the file is owned
   `root:root` with mode `0640`:
   ```sh
   ssh ubuntu@<server_public_ip> sudo cat /etc/rancher/k3s/k3s.yaml > kubeconfig
   ```
5. In the downloaded `kubeconfig`, rewrite the `server:` field to:
   ```
   https://<server_public_ip>:6443
   ```
6. Point `kubectl` at it and verify:
   ```sh
   export KUBECONFIG=$(pwd)/kubeconfig
   kubectl get nodes
   ```
   Both `mankahi-k3s-server` and `mankahi-k3s-agent` must show `Ready`, and
   both should report architecture `arm64`.

## 7. Image selection note

The Ubuntu 24.04 aarch64 image is auto-selected via the
`oci_core_images` data source, filtered by shape and sorted by creation time
descending (newest first) — never hard-coded by OCID, since image OCIDs are
region- and tenancy-specific and rotate over time. One rare caveat: if Oracle
publishes a "Minimal" variant of the same Ubuntu release, it could
occasionally sort ahead of the standard image. If an apply ever selects an
unexpected image, check `data.oci_core_images.ubuntu.images` and be prepared
to pin more specifically if this becomes a real problem.

## 8. Remote state (future)

State is currently kept **local** (the default `terraform.tfstate` on disk,
excluded from git via `.gitignore`). This is acceptable for a single-operator
setup but does not support team collaboration or CI-driven applies safely.

A future improvement is to move to remote state using OCI Object Storage's
S3-compatible API as a Terraform `s3` backend (Object Storage supports the
S3 protocol via the customer secret key already provisioned by
`object_storage.tf`). This is not configured yet and should be a deliberate,
separate change with its own bucket, versioning, and access-key rotation
plan.

## 9. Teardown

```sh
terraform destroy
```

- Reserved public IPs (`oci_core_public_ip.server` / `.agent`) are Terraform-
  managed resources and will be released automatically as part of destroy.
- **Object Storage buckets must be empty before they can be destroyed.**
  There is no `force_delete` argument on `oci_objectstorage_bucket` — you
  must delete all objects first, either via the OCI Console, the OCI CLI, or
  a tool like `mc` (MinIO Client) against the S3-compatible endpoint, e.g.:
  ```sh
  mc rb --force <alias>/mankahi-uploads
  mc rb --force <alias>/mankahi-backups
  ```
  Only after the buckets are empty will `terraform destroy` succeed.
