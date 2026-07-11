#!/usr/bin/env python3
"""Sum Deployment memory requests * replicas from `kubectl kustomize` output on stdin.

PyYAML is available on this machine, so we parse the rendered multi-doc
YAML stream properly rather than hand-rolling an indentation parser.
"""
import sys

import yaml

BUDGET_MI = 6144


def to_mi(value):
    value = str(value).strip()
    if value.endswith("Gi"):
        return float(value[:-2]) * 1024
    if value.endswith("Mi"):
        return float(value[:-2])
    return float(value)


def main():
    docs = yaml.safe_load_all(sys.stdin.read())
    total = 0.0
    lines_out = []
    for doc in docs:
        if not doc or doc.get("kind") != "Deployment":
            continue
        name = doc["metadata"]["name"]
        replicas = doc.get("spec", {}).get("replicas", 1)
        containers = doc["spec"]["template"]["spec"]["containers"]
        for container in containers:
            requests = container.get("resources", {}).get("requests", {})
            memory = requests.get("memory")
            if memory is None:
                continue
            mem_mi = to_mi(memory)
            component_total = mem_mi * replicas
            total += component_total
            lines_out.append(
                f"{name}/{container['name']}: {mem_mi:.0f}Mi x {replicas} = {component_total:.0f}Mi"
            )

    for line in lines_out:
        print(line)
    print(f"TOTAL: {total:.0f}Mi (budget {BUDGET_MI}Mi)")
    if total > BUDGET_MI:
        print("FAIL: memory budget exceeded")
        sys.exit(1)
    print("OK: within memory budget")


if __name__ == "__main__":
    main()
