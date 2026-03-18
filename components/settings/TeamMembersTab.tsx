'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Table, Thead, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Trash2, UserPlus } from 'lucide-react';
import { createSupabaseBrowser } from '@/lib/supabase-browser';

interface TeamUser {
  id: string;
  email: string;
  email_confirmed_at: string | null;
  created_at: string;
  last_sign_in_at: string | null;
}

export function TeamMembersTab() {
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [currentUserEmail, setCurrentUserEmail] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    createSupabaseBrowser().auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
      setCurrentUserEmail(data.user?.email ?? null);
    });
    fetchUsers();
  }, []);

  async function fetchUsers() {
    const res = await fetch('/api/team');
    if (res.ok) {
      const data = await res.json();
      setUsers(data);
    }
    setLoading(false);
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setInviting(true);

    const res = await fetch('/api/team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: inviteEmail }),
    });

    if (res.ok) {
      setShowInvite(false);
      setInviteEmail('');
      fetchUsers();
    } else {
      const data = await res.json();
      setError(data.error || 'Failed to invite user');
    }
    setInviting(false);
  }

  async function handleRemove(id: string) {
    if (!confirm('Remove this team member? They will lose access immediately.')) return;
    const res = await fetch(`/api/team/${id}`, { method: 'DELETE' });
    if (res.ok) {
      fetchUsers();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to remove user');
    }
  }

  function formatDate(dateStr: string | null) {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-gray-500">Manage who has access to this dashboard</p>
        <Button onClick={() => setShowInvite(true)}>
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Member
        </Button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : users.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No team members found.</p>
        </div>
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Email</Th>
              <Th>Status</Th>
              <Th>Joined</Th>
              <Th>Last Sign In</Th>
              <Th />
            </tr>
          </Thead>
          <tbody className="divide-y divide-gray-200">
            {users.map((user) => (
              <tr key={user.id} className="hover:bg-gray-50">
                <Td className="font-medium">
                  {user.email}
                  {user.id === currentUserId && (
                    <span className="ml-2 text-xs text-gray-400">(you)</span>
                  )}
                </Td>
                <Td>
                  {user.email_confirmed_at ? (
                    <Badge color="green">Active</Badge>
                  ) : (
                    <Badge color="yellow">Pending</Badge>
                  )}
                </Td>
                <Td>{formatDate(user.created_at)}</Td>
                <Td>{formatDate(user.last_sign_in_at)}</Td>
                <Td>
                  {user.id !== currentUserId && currentUserEmail === 'evan@votemiller.com' && (
                    <button
                      onClick={() => handleRemove(user.id)}
                      className="text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <Modal open={showInvite} onClose={() => { setShowInvite(false); setError(''); }} title="Invite Team Member">
        <form onSubmit={handleInvite} className="space-y-4">
          <Input
            label="Email Address"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="teammate@example.com"
            required
          />
          <p className="text-xs text-gray-500">
            They&apos;ll receive an email with a magic link to set up their account.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" type="button" onClick={() => { setShowInvite(false); setError(''); }}>
              Cancel
            </Button>
            <Button type="submit" disabled={inviting}>
              {inviting ? 'Inviting...' : 'Send Invite'}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
