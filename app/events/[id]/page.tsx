'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';
import { Textarea } from '@/components/ui/Textarea';
import { Table, Thead, Th, Td } from '@/components/ui/Table';
import { Badge } from '@/components/ui/Badge';
import { ArrowLeft, Save, Trash2, UserPlus } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import type { Event, EventVolunteer, Volunteer } from '@/lib/types';

const rsvpColors: Record<string, 'blue' | 'green' | 'gray' | 'red' | 'yellow'> = {
  rsvp: 'blue',
  confirmed: 'green',
  attended: 'green',
  no_show: 'red',
  cancelled: 'gray',
};

export default function EventDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [event, setEvent] = useState<Event | null>(null);
  const [assignments, setAssignments] = useState<EventVolunteer[]>([]);
  const [saving, setSaving] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [volSearch, setVolSearch] = useState('');
  const [searchResults, setSearchResults] = useState<Volunteer[]>([]);

  const [form, setForm] = useState({
    title: '',
    description: '',
    location: '',
    event_date: '',
    start_time: '',
    end_time: '',
    capacity: '',
    status: 'upcoming',
  });

  const fetchAssignments = useCallback(async () => {
    const res = await fetch(`/api/events/${id}/volunteers`);
    const data = await res.json();
    setAssignments(data);
  }, [id]);

  useEffect(() => {
    fetch(`/api/events/${id}`)
      .then((r) => r.json())
      .then((data) => {
        setEvent(data);
        setForm({
          title: data.title,
          description: data.description || '',
          location: data.location || '',
          event_date: data.event_date,
          start_time: data.start_time || '',
          end_time: data.end_time || '',
          capacity: data.capacity?.toString() || '',
          status: data.status,
        });
      });
    fetchAssignments();
  }, [id, fetchAssignments]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch(`/api/events/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        capacity: form.capacity ? parseInt(form.capacity) : null,
      }),
    });
    if (res.ok) setEvent(await res.json());
    setSaving(false);
  }

  async function handleDelete() {
    if (!confirm('Delete this event?')) return;
    await fetch(`/api/events/${id}`, { method: 'DELETE' });
    router.push('/events');
  }

  async function searchVolunteers(query: string) {
    setVolSearch(query);
    if (query.length < 2) { setSearchResults([]); return; }
    const res = await fetch(`/api/volunteers?search=${encodeURIComponent(query)}&limit=10`);
    const json = await res.json();
    setSearchResults(json.data || []);
  }

  async function assignVolunteer(volunteerId: string) {
    const res = await fetch(`/api/events/${id}/volunteers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ volunteer_id: volunteerId }),
    });
    if (res.ok) {
      fetchAssignments();
      setShowAssign(false);
      setVolSearch('');
      setSearchResults([]);
    }
  }

  async function updateRsvpStatus(evId: string, status: string) {
    await fetch(`/api/events/${id}/volunteers`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event_volunteer_id: evId, status }),
    });
    fetchAssignments();
  }

  if (!event) return <p className="text-gray-500">Loading...</p>;

  return (
    <div>
      <PageHeader
        title={event.title}
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => router.push('/events')}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            <Button variant="danger" onClick={handleDelete}>
              <Trash2 className="w-4 h-4 mr-2" />
              Delete
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <form onSubmit={handleSave} className="bg-white rounded-lg border border-gray-200 p-6 space-y-4">
          <h3 className="font-semibold">Event Details</h3>
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <Textarea label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          <Input label="Location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
          <div className="grid grid-cols-3 gap-4">
            <Input label="Date" type="date" value={form.event_date} onChange={(e) => setForm({ ...form, event_date: e.target.value })} required />
            <Input label="Start" type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value })} />
            <Input label="End" type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Capacity" type="number" value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
            <Select
              label="Status"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value })}
              options={[
                { value: 'upcoming', label: 'Upcoming' },
                { value: 'ongoing', label: 'Ongoing' },
                { value: 'completed', label: 'Completed' },
                { value: 'cancelled', label: 'Cancelled' },
              ]}
            />
          </div>
          <div className="flex justify-end pt-4 border-t">
            <Button type="submit" disabled={saving}>
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save'}
            </Button>
          </div>
        </form>

        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">
              Volunteers ({assignments.length}
              {event.capacity ? `/${event.capacity}` : ''})
            </h3>
            <Button size="sm" onClick={() => setShowAssign(true)}>
              <UserPlus className="w-4 h-4 mr-2" />
              Assign
            </Button>
          </div>

          {assignments.length === 0 ? (
            <p className="text-sm text-gray-500">No volunteers assigned yet.</p>
          ) : (
            <Table>
              <Thead>
                <tr>
                  <Th>Name</Th>
                  <Th>Status</Th>
                  <Th />
                </tr>
              </Thead>
              <tbody className="divide-y divide-gray-200">
                {assignments.map((a) => (
                  <tr key={a.id}>
                    <Td className="font-medium">
                      {a.volunteer?.first_name} {a.volunteer?.last_name}
                    </Td>
                    <Td>
                      <Badge color={rsvpColors[a.status]}>{a.status}</Badge>
                    </Td>
                    <Td>
                      <select
                        value={a.status}
                        onChange={(e) => updateRsvpStatus(a.id, e.target.value)}
                        className="text-xs border border-gray-300 rounded px-2 py-1"
                      >
                        <option value="rsvp">RSVP</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="attended">Attended</option>
                        <option value="no_show">No Show</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </div>
      </div>

      <Modal open={showAssign} onClose={() => setShowAssign(false)} title="Assign Volunteer">
        <Input
          placeholder="Search by name or email..."
          value={volSearch}
          onChange={(e) => searchVolunteers(e.target.value)}
        />
        <div className="mt-3 max-h-60 overflow-y-auto divide-y divide-gray-200">
          {searchResults.map((vol) => (
            <button
              key={vol.id}
              onClick={() => assignVolunteer(vol.id)}
              className="w-full text-left p-3 hover:bg-gray-50 text-sm"
            >
              <p className="font-medium">{vol.first_name} {vol.last_name}</p>
              <p className="text-gray-500 text-xs">{vol.email}</p>
            </button>
          ))}
          {volSearch.length >= 2 && searchResults.length === 0 && (
            <p className="text-sm text-gray-500 p-3">No volunteers found.</p>
          )}
        </div>
      </Modal>
    </div>
  );
}
