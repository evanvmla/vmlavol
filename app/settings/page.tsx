'use client';

import { Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { CustomFieldsTab } from '@/components/settings/CustomFieldsTab';
import { TeamMembersTab } from '@/components/settings/TeamMembersTab';

const tabs = [
  { key: 'fields', label: 'Custom Fields' },
  { key: 'team', label: 'Team Members' },
] as const;

function SettingsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const activeTab = searchParams.get('tab') || 'fields';

  return (
    <div>
      <PageHeader title="Settings" />

      <div className="border-b border-gray-200 mb-6">
        <nav className="-mb-px flex gap-6">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => router.push(`/settings?tab=${tab.key}`)}
              className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.key
                  ? 'border-blue-600 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {activeTab === 'fields' && <CustomFieldsTab />}
      {activeTab === 'team' && <TeamMembersTab />}
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
