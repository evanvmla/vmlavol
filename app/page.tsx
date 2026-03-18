'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Users, FileText, Mail } from 'lucide-react';

interface Stats {
  volunteers: number;
  forms: number;
  emailsSent: number;
  recentVolunteers: { id: string; first_name: string; last_name: string; email: string; created_at: string }[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    volunteers: 0,
    forms: 0,
    emailsSent: 0,
    recentVolunteers: [],
  });

  useEffect(() => {
    async function load() {
      const [volRes, formRes] = await Promise.all([
        fetch('/api/volunteers?limit=5'),
        fetch('/api/forms?limit=1'),
      ]);

      const volJson = await volRes.json();
      const formJson = await formRes.json().catch(() => ({ total: 0 }));

      setStats({
        volunteers: volJson.total || 0,
        forms: formJson.total || (Array.isArray(formJson) ? formJson.length : 0),
        emailsSent: 0,
        recentVolunteers: volJson.data || [],
      });
    }
    load();
  }, []);

  const cards = [
    { label: 'Volunteers', value: stats.volunteers, icon: Users, href: '/volunteers', color: 'bg-blue-500' },
    { label: 'Forms', value: stats.forms, icon: FileText, href: '/forms', color: 'bg-purple-500' },
    { label: 'Emails Sent', value: stats.emailsSent, icon: Mail, href: '/email/history', color: 'bg-gold-500' },
  ];

  return (
    <div>
      <PageHeader title="Dashboard" description="Campaign volunteer overview" />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
        {cards.map((card) => (
          <Link key={card.label} href={card.href}>
            <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{card.label}</p>
                  <p className="text-2xl font-bold mt-1">{card.value}</p>
                </div>
                <div className={`${card.color} p-3 rounded-lg`}>
                  <card.icon className="w-5 h-5 text-white" />
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h2 className="font-semibold">Recent Signups</h2>
        </div>
        {stats.recentVolunteers.length === 0 ? (
          <p className="p-4 text-sm text-gray-500">No volunteers yet.</p>
        ) : (
          <div className="divide-y divide-gray-200">
            {stats.recentVolunteers.map((vol) => (
              <Link
                key={vol.id}
                href={`/volunteers/${vol.id}`}
                className="flex items-center justify-between p-4 hover:bg-gray-50"
              >
                <div>
                  <p className="font-medium text-sm">
                    {vol.first_name} {vol.last_name}
                  </p>
                  <p className="text-xs text-gray-500">{vol.email}</p>
                </div>
                <p className="text-xs text-gray-400">
                  {new Date(vol.created_at).toLocaleDateString()}
                </p>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
