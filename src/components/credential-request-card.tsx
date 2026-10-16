"use client";

import { useState } from "react";
import { Lock, Eye, EyeOff, Send, CheckCircle2, AlertCircle } from "lucide-react";
import type { InputRequestData } from "@/lib/types";
import { getAgentInfo } from "@/lib/agents/agent-roles";

interface CredentialRequestCardProps {
  sessionId: string;
  data: InputRequestData;
  onSubmitSuccess?: () => void;
}

export function CredentialRequestCard({
  sessionId,
  data,
  onSubmitSuccess,
}: CredentialRequestCardProps) {
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const agent = getAgentInfo(data.agentRole);

  const handleChange = (name: string, value: string) => {
    setFormValues((prev) => ({ ...prev, [name]: value }));
  };

  const togglePassword = (name: string) => {
    setShowPasswords((prev) => ({ ...prev, [name]: !prev[name] }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetch(`/api/session/${sessionId}/provide-input`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: data.requestId,
          values: formValues,
        }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || "Failed to submit input to agent");
      }

      setIsSubmitted(true);
      if (onSubmitSuccess) {
        onSubmitSuccess();
      }
    } catch (err: any) {
      setError(err.message || "An error occurred");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isSubmitted) {
    return (
      <div className="my-3 p-4 rounded-xl border border-emerald-500/30 bg-emerald-950/20 text-emerald-300 flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
        <div>
          <p className="text-sm font-medium">Information submitted to agent</p>
          <p className="text-xs text-emerald-400/80">The agent is now using the provided values to continue.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="my-3 rounded-xl border border-amber-500/30 bg-zinc-900/90 shadow-xl backdrop-blur-md overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gradient-to-r from-amber-500/10 to-orange-500/10 border-b border-amber-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-500/20 flex items-center justify-center">
            <Lock className="w-4 h-4 text-amber-400" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-zinc-100">{data.title}</h4>
            <span className="text-[11px] text-amber-400/90 font-medium">
              Requested by {agent.name}
            </span>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
          Action Required
        </span>
      </div>

      {/* Body */}
      <form onSubmit={handleSubmit} className="p-4 space-y-3">
        {data.description && (
          <p className="text-xs text-zinc-400 leading-relaxed">{data.description}</p>
        )}

        {data.fields.map((field) => {
          const isPassword = field.type === "password";
          const isVisible = showPasswords[field.name];

          return (
            <div key={field.name} className="space-y-1">
              <label className="block text-xs font-medium text-zinc-300">
                {field.label}
                {field.required && <span className="text-red-400 ml-1">*</span>}
              </label>

              <div className="relative">
                {field.type === "select" ? (
                  <select
                    value={formValues[field.name] || ""}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    required={field.required}
                    className="w-full h-9 px-3 rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 focus:outline-none focus:border-amber-500/50"
                  >
                    <option value="">Select an option...</option>
                    {(field.options || []).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type={isPassword && !isVisible ? "password" : "text"}
                    value={formValues[field.name] || ""}
                    onChange={(e) => handleChange(field.name, e.target.value)}
                    placeholder={field.placeholder || `Enter ${field.label.toLowerCase()}...`}
                    required={field.required}
                    className="w-full h-9 px-3 pr-9 rounded-lg bg-zinc-950 border border-zinc-700 text-sm text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-amber-500/50"
                  />
                )}

                {isPassword && (
                  <button
                    type="button"
                    onClick={() => togglePassword(field.name)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200 p-0.5"
                  >
                    {isVisible ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {error && (
          <div className="flex items-center gap-2 text-xs text-red-400 bg-red-950/20 p-2 rounded-lg border border-red-500/30">
            <AlertCircle size={14} />
            <span>{error}</span>
          </div>
        )}

        <div className="pt-2 flex items-center justify-between">
          <span className="text-[11px] text-zinc-500">
            Transmitted securely to the active session.
          </span>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 font-medium text-xs transition-colors shadow disabled:opacity-50"
          >
            {isSubmitting ? (
              <span className="inline-block w-3.5 h-3.5 border-2 border-zinc-950 border-t-transparent rounded-full animate-spin" />
            ) : (
              <Send size={13} />
            )}
            <span>Submit to Agent</span>
          </button>
        </div>
      </form>
    </div>
  );
}
