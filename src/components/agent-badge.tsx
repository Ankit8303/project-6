"use client";

import { Bot, Lock, FileText, Compass, Database } from "lucide-react";
import type { AgentRole } from "@/lib/types";
import { getAgentInfo } from "@/lib/agents/agent-roles";

interface AgentBadgeProps {
  role?: AgentRole | string;
  size?: "sm" | "md";
  showIcon?: boolean;
}

export function AgentBadge({ role, size = "sm", showIcon = true }: AgentBadgeProps) {
  const agent = getAgentInfo(role);

  const renderIcon = () => {
    switch (agent.role) {
      case "auth":
        return <Lock size={size === "sm" ? 11 : 13} className="shrink-0" />;
      case "form_filler":
        return <FileText size={size === "sm" ? 11 : 13} className="shrink-0" />;
      case "navigator":
        return <Compass size={size === "sm" ? 11 : 13} className="shrink-0" />;
      case "extractor":
        return <Database size={size === "sm" ? 11 : 13} className="shrink-0" />;
      case "supervisor":
      default:
        return <Bot size={size === "sm" ? 11 : 13} className="shrink-0" />;
    }
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border font-medium ${
        size === "sm"
          ? "px-2 py-0.5 text-[10px]"
          : "px-2.5 py-1 text-xs"
      } ${agent.color}`}
    >
      {showIcon && renderIcon()}
      <span>{agent.name}</span>
    </span>
  );
}
