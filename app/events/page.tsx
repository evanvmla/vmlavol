'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { PageHeader } from '@/components/layout/PageHeader';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Badge';
import { Plus, MapPin, Calendar } from 'lucide-react';
import type { Event } from '@/lib/types';

const statusColors: Record<string, 'blue' | 'green' | 'gray' | 'red'> = {
  upcoming: 'blue',
  ongoing: 'green',
  completed: 'gray',
  cancelled: 'red',
};

export default function EventsPage() {
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/events')
      .then((r) => r.json())
      .then((json) => {
        setEvents(json.data || []);
        setLoading(false);
      });
  }, []);

  return (
    <div>
      <PageHeader
        title="Events"
        description="Manage campaign events and volunteer assignments"
        actions={
          <Link href="/events/new">
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Create Event
            </Button>
          </Link>
        }
      />

      {loading ? (
        <p className="text-gray-500">Loading...</p>
      ) : events.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
          <p className="text-gray-500">No events yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {events.map((event) => (
            <Link key={event.id} href={`/events/${event.id}`}>
              <div className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-sm transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-gray-900">{event.title}</h3>
                  <Badge color={statusColors[event.status]}>{event.status}</Badge>
                </div>
                <div className="space-y-1.5 text-sm text-gray-500">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4" />
                    {new Date(event.event_date + 'T00:00:00').toLocaleDateString()}
                    {event.start_time && ` at ${event.start_time.slice(0, 5)}`}
                  </div>
                  {event.location && (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      {event.location}
                    </div>
                  )}
                </div>
                {event.capacity && (
                  <p className="mt-2 text-xs text-gray-400">Capacity: {event.capacity}</p>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
