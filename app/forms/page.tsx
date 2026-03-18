'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Table, Thead, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { Plus, ExternalLink } from 'lucide-react';
import type { Form } from '@/lib/types';

export default function FormsPage() {
  const [forms, setForms] = useState<Form[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/forms')
      .then((r) => r.json())
      .then((json) => {
        setForms(json.data || []);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <PageHeader
        title="Forms"
        description="Manage signup forms for embedding"
        actions={
          <Link href="/forms/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Form
            </Button>
          </Link>
        }
      />

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : forms.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No forms yet. Create one to start collecting signups.</p>
        </div>
      ) : (
        <Table>
          <Thead>
            <tr>
              <Th>Name</Th>
              <Th>Slug</Th>
              <Th>Status</Th>
              <Th>Welcome Email</Th>
              <Th>Created</Th>
              <Th />
            </tr>
          </Thead>
          <tbody className="divide-y divide-gray-200">
            {forms.map((form) => (
              <tr key={form.id} className="hover:bg-gray-50">
                <Td>
                  <Link href={`/forms/${form.id}`} className="font-medium text-blue-600 hover:text-blue-800">
                    {form.name}
                  </Link>
                </Td>
                <Td>
                  <code className="text-xs bg-gray-100 px-1.5 py-0.5 rounded">{form.slug}</code>
                </Td>
                <Td>
                  <Badge color={form.is_active ? 'green' : 'gray'}>
                    {form.is_active ? 'Active' : 'Inactive'}
                  </Badge>
                </Td>
                <Td>{form.welcome_email_subject ? 'Configured' : '-'}</Td>
                <Td>{new Date(form.created_at).toLocaleDateString()}</Td>
                <Td>
                  <Link href={`/embed/${form.slug}`} target="_blank" className="text-gray-400 hover:text-blue-600">
                    <ExternalLink className="w-4 h-4" />
                  </Link>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}
