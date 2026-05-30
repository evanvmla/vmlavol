'use client';

import { useEffect, useState, useCallback } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Table, Thead, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, Send } from 'lucide-react';
import Link from 'next/link';
import type { EmailSend } from '@/lib/types';

const statusColors: Record<string, 'gray' | 'blue' | 'green' | 'red' | 'yellow'> = {
  draft: 'yellow',
  sending: 'blue',
  sent: 'green',
  failed: 'red',
};

const statusLabels: Record<string, string> = {
  draft: 'saved',
  sending: 'sending',
  sent: 'sent',
  failed: 'failed',
};

export default function EmailHistoryPage() {
  const [sends, setSends] = useState<EmailSend[]>([]);
  const [loading, setLoading] = useState(true);
  const [sendingId, setSendingId] = useState<string | null>(null);

  const fetchSends = useCallback(async () => {
    const res = await fetch('/api/email/send');
    const json = await res.json();
    setSends(json.data || []);
  }, []);

  // Initial load
  useEffect(() => {
    fetchSends().then(() => setLoading(false));
  }, [fetchSends]);

  // Auto-poll while any send is in 'sending' status
  useEffect(() => {
    const hasSending = sends.some((s) => s.status === 'sending');
    if (!hasSending) return;

    const timer = setInterval(async () => {
      await fetch('/api/email/process', { method: 'POST' }).catch(() => {});
      await fetchSends();
    }, 3000);

    return () => clearInterval(timer);
  }, [sends, fetchSends]);

  async function handleSendDraft(id: string) {
    if (!confirm('Send this email now?')) return;
    setSendingId(id);
    try {
      const res = await fetch(`/api/email/send/${id}`, { method: 'POST' });
      if (res.ok) {
        await fetchSends();
      } else {
        const json = await res.json();
        alert(json.error || 'Failed to send');
      }
    } finally {
      setSendingId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Email History"
        description="Past bulk email sends and their delivery status"
        actions={
          <Link href="/email">
            <Button variant="secondary">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Compose
            </Button>
          </Link>
        }
      />

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : sends.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No emails sent yet.</p>
        </div>
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Subject</Th>
              <Th>Recipients</Th>
              <Th>Status</Th>
              <Th>Sent At</Th>
            </tr>
          </Thead>
          <tbody className="divide-y divide-gray-200">
            {sends.map((send) => (
              <tr key={send.id} className="hover:bg-gray-50">
                <Td className="font-medium max-w-xs truncate">{send.subject}</Td>
                <Td>{send.status === 'draft' ? '—' : send.recipient_count}</Td>
                <Td>
                  <Badge color={statusColors[send.status]}>
                    {statusLabels[send.status] ?? send.status}
                  </Badge>
                </Td>
                <Td>
                  {send.status === 'draft' ? (
                    <Button
                      size="sm"
                      onClick={() => handleSendDraft(send.id)}
                      disabled={sendingId === send.id}
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" />
                      {sendingId === send.id ? 'Sending…' : 'Send?'}
                    </Button>
                  ) : send.sent_at ? (
                    new Date(send.sent_at).toLocaleString()
                  ) : (
                    '—'
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
