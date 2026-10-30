import { useManagerIdentity, type ManagerIdentity } from './useManagerIdentity';

export type AgentIdentity = ManagerIdentity;

export function useAgentIdentity(enabled = true): ManagerIdentity {
  return useManagerIdentity(enabled);
}
