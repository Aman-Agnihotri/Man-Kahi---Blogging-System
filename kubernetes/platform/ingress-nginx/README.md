# ingress-nginx (platform component)

## Source

- Upstream manifest: `https://raw.githubusercontent.com/kubernetes/ingress-nginx/controller-v1.15.1/deploy/static/provider/cloud/deploy.yaml`
- Version: `controller-v1.15.1`
- Vendored file: `deploy.yaml` (unmodified, as downloaded)
- sha256 of vendored `deploy.yaml`: `502fddca66b09c20dd48b6d0a792a9671cd663a3a0d2a8bda5ae990d13b6c5b2`
- Controller image pin (verified present in the vendored file):
  `registry.k8s.io/ingress-nginx/controller:v1.15.1@sha256:594ceea76b01c592858f803f9ff4d2cb40542cae2060410b2c95f75907d659e1`
- arm64 support: confirmed via the registry manifest list for the pinned image.

## Why the `cloud` provider manifest

k3s ships its own `ServiceLB` (Klipper) implementation, which fulfills any
`Service` of `type: LoadBalancer` by binding the service's ports directly on
**every node** in the cluster (not just one). Because of this, the
`ingress-nginx-controller` Service (type `LoadBalancer`, ports 80/443) ends
up reachable on ports 80/443 on **both** OCI A1.Flex node public IPs — not
just one "primary" node.

DNS records should point A records at **both** node public IPs for a
poor-man's failover: if one node is down, clients that resolve to the other
node's IP still reach a healthy ingress controller. This is not a true load
balancer (no health-check-based failover, no session draining) but it removes
the single point of failure of routing all traffic through one node.

## Only controller

This is the **only** ingress controller running in the cluster. The
`kubernetes/environments/oci` overlay deliberately deletes the old
hand-rolled controller objects (`ServiceAccount`, `ConfigMap`, `Service`,
`Deployment`, `ClusterRole`, `ClusterRoleBinding` named `nginx-ingress` /
`ingress-nginx-controller` in the `mankahi` namespace) from `base` via
`patches/delete-ingress-controller.yaml`, so there is no conflict between the
hand-rolled POC controller and this vendored one.

## Customizations (kustomization.yaml)

- `resources: [deploy.yaml]` — the vendored file, unmodified.
- `patches/budget.yaml` — strategic-merge patch on the
  `ingress-nginx-controller` Deployment (namespace `ingress-nginx`):
  - `spec.replicas: 1`
  - container `controller` resources: requests `cpu: 100m` / `memory: 128Mi`,
    limits `cpu: 500m` / `memory: 256Mi` (per THE SPEC budget table).

## Install (HUMAN step, after cluster exists)

```
kubectl apply -k kubernetes/platform/ingress-nginx
```
