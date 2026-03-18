'use client';

import { useState, useEffect } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Mail, Users, CheckCircle, Eye, AlertTriangle, Tag, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import type { SummaryResult } from '@/lib/email-summary';

export default function SummaryPage() {
  const [data, setData] = useState<SummaryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function fetchSummary() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/email/summary');
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error || `Failed to load summary (${res.status})`);
      }
      setData(await res.json());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSummary(); }, []);

  return (
    <div>
      <PageHeader
        title="Email Summary"
        description="Overview of email sends and delivery"
        actions={
          <Link href="/email">
            <Button variant="secondary">
              <Mail className="w-4 h-4 mr-2" />
              Compose
            </Button>
          </Link>
        }
      />

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <RefreshCw className="w-5 h-5 animate-spin mr-2" />
          Loading summary…
        </div>
      )}

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertTriangle className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-700 mb-3">{error}</p>
          <Button variant="secondary" onClick={fetchSummary}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Retry
          </Button>
        </div>
      )}

      {data && !loading && (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <StatCard
              icon={<Mail className="w-5 h-5 text-blue-500" />}
              label="Total Sends"
              value={data.totals.totalSends}
            />
            <StatCard
              icon={<Users className="w-5 h-5 text-indigo-500" />}
              label="Total Recipients"
              value={data.totals.totalRecipients.toLocaleString()}
            />
            <StatCard
              icon={<CheckCircle className="w-5 h-5 text-green-500" />}
              label="Delivery Rate"
              value={`${(data.totals.deliveryRate * 100).toFixed(1)}%`}
            />
            <StatCard
              icon={<Eye className="w-5 h-5 text-amber-500" />}
              label="Open Rate"
              value={`${(data.totals.openRate * 100).toFixed(1)}%`}
            />
          </div>

          {/* Tag breakdown */}
          {data.tagBreakdown.length > 0 && (
            <div className="mb-8">
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Breakdown by Tag</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {data.tagBreakdown.map(t => (
                  <div key={t.tag} className="bg-white border border-gray-200 rounded-lg p-4">
                    <span className="inline-block bg-blue-100 text-blue-700 text-xs font-medium px-2 py-0.5 rounded mb-2">
                      {t.tag}
                    </span>
                    <div className="text-sm text-gray-600 space-y-1">
                      <p>{t.sendCount} send{t.sendCount !== 1 ? 's' : ''} &middot; {t.recipientCount.toLocaleString()} recipients</p>
                      <p className="text-xs text-gray-400">
                        {t.stats.delivered} delivered &middot; {t.stats.opened} opened &middot; {t.stats.failed} failed
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Sends table */}
          <div>
            <h2 className="text-sm font-semibold text-gray-700 mb-3">Recent Sends</h2>
            {data.sends.length === 0 ? (
              <div className="bg-white border border-gray-200 rounded-lg p-8 text-center text-sm text-gray-400">
                No email sends yet.
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 text-left text-xs font-medium text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3">Subject</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3 text-right">Recipients</th>
                      <th className="px-4 py-3 text-right">Delivered</th>
                      <th className="px-4 py-3 text-right">Opened</th>
                      <th className="px-4 py-3 text-right">Failed</th>
                      <th className="px-4 py-3">Tags</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {data.sends.map(send => (
                      <tr key={send.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">
                          {send.subject}
                        </td>
                        <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                          {send.sent_at ? new Date(send.sent_at).toLocaleDateString() : '—'}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-700">{send.recipient_count}</td>
                        <td className="px-4 py-3 text-right text-green-600">{send.stats.delivered}</td>
                        <td className="px-4 py-3 text-right text-amber-600">{send.stats.opened}</td>
                        <td className="px-4 py-3 text-right text-red-500">{send.stats.failed}</td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1 flex-wrap">
                            {send.tags.map(t => (
                              <span
                                key={t.tag}
                                className="inline-block bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded"
                              >
                                {t.tag} ({t.count})
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {data.sends.length >= 50 && (
                  <p className="px-4 py-2 text-xs text-gray-400 border-t border-gray-100">
                    Showing 50 most recent sends.
                  </p>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">{label}</span>
      </div>
      <p className="text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}
