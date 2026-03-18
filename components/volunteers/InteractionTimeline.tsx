'use client';

import { useEffect, useState, useCallback } from 'react';
import { createSupabaseBrowser } from '@/lib/supabase-browser';
import { Mail, UserPlus, FileText, Phone, Users, MessageSquare, X } from 'lucide-react';
import type { Interaction } from '@/lib/types';
import type { LucideIcon } from 'lucide-react';

const typeIcons: Record<string, LucideIcon> = {
  email: Mail,
  signup: UserPlus,
  note: FileText,
  call: Phone,
  meeting: Users,
  other: MessageSquare,
};

const typeColors: Record<string, string> = {
  email: 'text-blue-500',
  signup: 'text-green-500',
  note: 'text-gray-500',
  call: 'text-orange-500',
  meeting: 'text-purple-500',
  other: 'text-gray-400',
};

const MANUAL_TYPES = [
  { value: 'note', label: 'Note', placeholder: 'Add a note...' },
  { value: 'call', label: 'Call', placeholder: 'Log a call...' },
  { value: 'meeting', label: 'Meeting', placeholder: 'Log a meeting...' },
  { value: 'other', label: 'Other', placeholder: 'Add an interaction...' },
];

function relativeTime(dateStr: string): { text: string; full: string } {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHr = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHr / 24);

  const full = date.toLocaleString();

  if (diffSec < 60) return { text: 'just now', full };
  if (diffMin < 60) return { text: `${diffMin}m ago`, full };
  if (diffHr < 24) return { text: `${diffHr}h ago`, full };
  if (diffDay < 7) return { text: `${diffDay}d ago`, full };

  return {
    text: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    full,
  };
}

export function InteractionTimeline({ volunteerId }: { volunteerId: string }) {
  const [interactions, setInteractions] = useState<Interaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [newType, setNewType] = useState('note');
  const [newDescription, setNewDescription] = useState('');
  const [adding, setAdding] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const fetchInteractions = useCallback(async () => {
    try {
      const res = await fetch(`/api/interactions?volunteer_id=${volunteerId}`);
      const json = await res.json();
      setInteractions(json.data || []);
    } catch {
      // Silent fail on fetch
    } finally {
      setLoading(false);
    }
  }, [volunteerId]);

  useEffect(() => {
    fetchInteractions();
    createSupabaseBrowser().auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email || null);
    });
  }, [fetchInteractions]);

  async function handleAdd() {
    if (!newDescription.trim() || adding) return;
    setAdding(true);

    try {
      const res = await fetch('/api/interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          volunteer_id: volunteerId,
          type: newType,
          description: newDescription.trim(),
          created_by: userEmail,
        }),
      });
      if (res.ok) {
        setNewDescription('');
        await fetchInteractions();
      }
    } catch {
      // Silent fail
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await fetch(`/api/interactions/${id}`, { method: 'DELETE' });
      setInteractions((prev) => prev.filter((i) => i.id !== id));
    } catch {
      // Silent fail
    }
  }

  const placeholder = MANUAL_TYPES.find((t) => t.value === newType)?.placeholder || 'Add an interaction...';

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Interactions</h3>

      {/* Inline add form */}
      <div className="flex gap-2 mb-4">
        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          className="rounded-lg border border-gray-300 px-2 py-1.5 text-sm shrink-0"
        >
          {MANUAL_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
        <input
          value={newDescription}
          onChange={(e) => setNewDescription(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleAdd(); } }}
          placeholder={placeholder}
          className="flex-1 min-w-0 rounded-lg border border-gray-300 px-3 py-1.5 text-sm"
        />
        <button
          onClick={handleAdd}
          disabled={!newDescription.trim() || adding}
          className="rounded-lg bg-blue-600 text-white px-3 py-1.5 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
        >
          Add
        </button>
      </div>

      {/* Timeline entries */}
      {loading ? (
        <p className="text-sm text-gray-400">Loading...</p>
      ) : interactions.length === 0 ? (
        <p className="text-sm text-gray-400">No interactions yet.</p>
      ) : (
        <div className="space-y-0">
          {interactions.map((interaction, idx) => {
            const Icon = typeIcons[interaction.type] || MessageSquare;
            const color = typeColors[interaction.type] || 'text-gray-400';
            const time = relativeTime(interaction.created_at);
            const isManual = !['email', 'signup'].includes(interaction.type);

            return (
              <div
                key={interaction.id}
                className={`group flex items-start gap-3 py-2.5 ${
                  idx < interactions.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-800 break-words">{interaction.description}</p>
                  {interaction.created_by && interaction.created_by !== 'system' && (
                    <p className="text-xs text-gray-400 mt-0.5">{interaction.created_by}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-xs text-gray-400" title={time.full}>{time.text}</span>
                  {isManual && (
                    <button
                      onClick={() => handleDelete(interaction.id)}
                      className="opacity-0 group-hover:opacity-100 p-0.5 text-gray-300 hover:text-red-500 transition-opacity"
                      title="Delete"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
