import type { AgentRole, AgentInfo } from "../types";

export const AGENT_REGISTRY: Record<AgentRole, AgentInfo> = {
  supervisor: {
    role: "supervisor",
    name: "Supervisor Agent",
    badge: "Orchestrator",
    color: "from-blue-500 to-indigo-600 border-indigo-500/30 text-indigo-400 bg-indigo-500/10",
    icon: "Bot",
  },
  auth: {
    role: "auth",
    name: "Auth Specialist",
    badge: "Authentication & 2FA",
    color: "from-amber-500 to-orange-600 border-amber-500/30 text-amber-400 bg-amber-500/10",
    icon: "Lock",
  },
  form_filler: {
    role: "form_filler",
    name: "Form Filler Specialist",
    badge: "Form & Input Engine",
    color: "from-emerald-500 to-teal-600 border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
    icon: "FileText",
  },
  navigator: {
    role: "navigator",
    name: "Navigator Specialist",
    badge: "Web Exploration",
    color: "from-purple-500 to-pink-600 border-purple-500/30 text-purple-400 bg-purple-500/10",
    icon: "Compass",
  },
  extractor: {
    role: "extractor",
    name: "Extractor Specialist",
    badge: "Data Harvester",
    color: "from-cyan-500 to-blue-600 border-cyan-500/30 text-cyan-400 bg-cyan-500/10",
    icon: "Database",
  },
};

export function getAgentInfo(role?: AgentRole | string): AgentInfo {
  if (role && role in AGENT_REGISTRY) {
    return AGENT_REGISTRY[role as AgentRole];
  }
  return AGENT_REGISTRY.supervisor;
}
