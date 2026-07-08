#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   ./backend/k8s/rightsize-weekly-check.sh [namespace]
# Default namespace is factory23.
NAMESPACE="${1:-factory23}"

echo "Namespace: ${NAMESPACE}"
echo ""
echo "== Node Capacity =="
kubectl top nodes
echo ""

echo "== Pod Resource Usage (${NAMESPACE}) =="
kubectl top pods -n "${NAMESPACE}" | rg -E "backend|queue-worker|scheduler|realtime|redis" || true
echo ""

echo "== Requested Resources (${NAMESPACE}) =="
kubectl describe node | rg -n "Allocated resources|cpu|memory" || true
echo ""

echo "== Last 50 Scheduling/Probe Warnings =="
kubectl get events -n "${NAMESPACE}" --sort-by=.lastTimestamp \
  | rg -i "FailedScheduling|Insufficient cpu|Unhealthy|BackOff" || true
echo ""

echo "Done. If workloads are stable and CPU stays low for 5-7 days,"
echo "reduce requests in 20m steps and re-check after each deploy."
