'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Users, FileText, Mail } from 'lucide-react';

interface RecentVolunteer {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  source_form_id: string | null;
  tags: string[];
  created_at: string;
}

interface Stats {
  volunteers: number;
  forms: number;
  emailsSent: number;
  recentVolunteers: RecentVolunteer[];
  formNames: Record<string, string>;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    volunteers: 0,
    forms: 0,
    emailsSent: 0,
    recentVolunteers: [],
    formNames: {},
  });

  useEffect(() => {
    async function load() {
      const [volRes, formRes] = await Promise.all([
        fetch('/api/volunteers?limit=50'),
        fetch('/api/forms?limit=100'),
      ]);

      const volJson = await volRes.json();
      const formJson = await formRes.json().catch(() => ({ data: [], total: 0 }));

      const formList = formJson.data || (Array.isArray(formJson) ? formJson : []);
      const formNames: Record<string, string> = {};
      for (const f of formList) {
        if (f.id && f.name) formNames[f.id] = f.name;
      }

      setStats({
        volunteers: volJson.total || 0,
        forms: formJson.total || formList.length,
        emailsSent: 0,
        recentVolunteers: volJson.data || [],
        formNames,
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
          <div className="divide-y divide-gray-200 max-h-[600px] overflow-y-auto">
            {stats.recentVolunteers.map((vol) => {
              const source = vol.source_form_id && stats.formNames[vol.source_form_id]
                ? stats.formNames[vol.source_form_id]
                : vol.tags?.includes('meta-ads')
                  ? 'Meta Ads'
                  : null;
              return (
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
                  <div className="text-right shrink-0 ml-4">
                    {source && (
                      <p className="text-xs text-gray-500">{source}</p>
                    )}
                    <p className="text-xs text-gray-400">
                      {new Date(vol.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
