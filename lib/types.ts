export interface CustomField {
  id: string;
  name: string;
  key: string;
  field_type: 'text' | 'textarea' | 'select' | 'multiselect' | 'checkbox' | 'date' | 'number' | 'email' | 'phone';
  options: string[] | null;
  is_required: boolean;
  display_order: number;
  created_at: string;
}

export interface Form {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  welcome_email_subject: string | null;
  welcome_email_body: string | null;
  notification_email: string | null;
  confirmation_message: string | null;
  field_ids: string[];
  hidden_fields: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Volunteer {
  id: string;
  email: string | null;
  first_name: string;
  last_name: string;
  phone: string | null;
  zip_code: string | null;
  source_form_id: string | null;
  custom_data: Record<string, unknown>;
  tags: string[];
  notes: string | null;
  status: 'active' | 'inactive' | 'do_not_contact';
  created_at: string;
  updated_at: string;
}

export interface Event {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  event_date: string;
  start_time: string | null;
  end_time: string | null;
  capacity: number | null;
  status: 'upcoming' | 'ongoing' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

export interface EventVolunteer {
  id: string;
  event_id: string;
  volunteer_id: string;
  status: 'rsvp' | 'confirmed' | 'attended' | 'no_show' | 'cancelled';
  notes: string | null;
  created_at: string;
  volunteer?: Volunteer;
}

export interface Interaction {
  id: string;
  volunteer_id: string;
  type: 'email' | 'signup' | 'note' | 'call' | 'meeting' | 'other';
  description: string;
  metadata: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface EmailSend {
  id: string;
  subject: string;
  body: string;
  filter_criteria: Record<string, unknown> | null;
  recipient_count: number;
  status: 'draft' | 'sending' | 'sent' | 'failed';
  sent_at: string | null;
  created_at: string;
}

export interface EmailRecipient {
  id: string;
  email_send_id: string;
  volunteer_id: string;
  resend_id: string | null;
  status: 'pending' | 'sent' | 'delivered' | 'opened' | 'failed';
  error: string | null;
  retry_count: number;
  sent_at: string | null;
  delivered_at: string | null;
  opened_at: string | null;
  created_at: string;
  volunteer?: Volunteer;
}
