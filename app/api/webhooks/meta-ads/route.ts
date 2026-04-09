import { NextRequest, NextResponse } from 'next/server';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import { handleError } from '@/lib/api-helpers';
import { isValidEmail } from '@/lib/validation';

type MetaLead = {
  id?: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  zip_code?: string;
  platform?: string;
  spoken_language?: string;
  'how_would_you_like_to_help?_'?: string;
  ad_name?: string;
  campaign_name?: string;
  form_name?: string;
  [key: string]: unknown;
};

const LANGUAGE_MAP: Record<string, string> = {
  english: 'English',
  spanish: 'Spanish',
};

const HELP_MAP: Record<string, string> = {
  'phone/texting': 'Phone/Texting',
  canvassing: 'Canvassing',
  "however_i'm_needed": "However I'm Needed",
  'translation/language_support': 'Translation/Language Support',
  'social_media_amplification': 'Social Media Amplification',
};

function stripPrefix(value: unknown, prefix: string): string | null {
  if (value === null || value === undefined) return null;
  const str = String(value).trim();
  if (!str) return null;
  return str.startsWith(prefix) ? str.slice(prefix.length).trim() : str;
}

function normalizeValue(raw: unknown, map: Record<string, string>): string {
  const str = String(raw ?? '').trim();
  const lower = str.toLowerCase();
  return map[lower] ?? str;
}

function verifyMetaAdsSecret(request: Request): boolean {
  const auth = request.headers.get('authorization');
  const secret = process.env.META_ADS_SYNC_SECRET;
  if (!secret) return false;
  return auth === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  try {
    if (!verifyMetaAdsSecret(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = (await request.json()) as { leads?: MetaLead[] };
    const leads = Array.isArray(body.leads) ? body.leads : [];

    if (leads.length === 0) {
      return NextResponse.json({ success: 0, errors: [] });
    }

    const supabase = createSupabaseAdmin();

    let success = 0;
    const errors: Array<{ meta_lead_id: string | null; error: string }> = [];

    for (const lead of leads) {
      const metaLeadId = stripPrefix(lead.id, 'l:');

      try {
        const email = String(lead.email ?? '').toLowerCase().trim();
        const firstName = String(lead.first_name ?? '').trim();
        const lastName = String(lead.last_name ?? '').trim();

        if (!email || !isValidEmail(email)) {
          errors.push({ meta_lead_id: metaLeadId, error: 'Invalid email' });
          continue;
        }
        if (!firstName || !lastName) {
          errors.push({ meta_lead_id: metaLeadId, error: 'Missing first or last name' });
          continue;
        }

        const phone = stripPrefix(lead.phone_number, 'p:');
        const zipCode = stripPrefix(lead.zip_code, 'z:');
        const platform = String(lead.platform ?? '').trim();

        const spokenLanguage = lead.spoken_language
          ? normalizeValue(lead.spoken_language, LANGUAGE_MAP)
          : null;
        const howToHelp = lead['how_would_you_like_to_help?_']
          ? normalizeValue(lead['how_would_you_like_to_help?_'], HELP_MAP)
          : null;

        const customData: Record<string, string[]> = {};
        if (spokenLanguage) customData['spoken-language'] = [spokenLanguage];
        if (howToHelp) customData['how-would-you-like-to-help'] = [howToHelp];

        // Fetch existing volunteer to merge tags and custom_data without wiping
        const { data: existing } = await supabase
          .from('volunteers')
          .select('tags, custom_data')
          .eq('email', email)
          .maybeSingle();

        const baseTags = ['meta-ads', ...(platform ? [platform] : [])];
        const mergedTags = existing?.tags
          ? Array.from(new Set([...(existing.tags as string[]), ...baseTags]))
          : baseTags;

        const mergedCustomData = {
          ...((existing?.custom_data as Record<string, unknown>) || {}),
          ...customData,
        };

        const { data: volunteer, error: volError } = await supabase
          .from('volunteers')
          .upsert(
            {
              email,
              first_name: firstName,
              last_name: lastName,
              phone: phone || null,
              zip_code: zipCode || null,
              source_form_id: null,
              custom_data: mergedCustomData,
              tags: mergedTags,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'email' }
          )
          .select()
          .single();

        if (volError) throw volError;

        // Log signup interaction (non-fatal)
        try {
          await supabase.from('interactions').insert({
            volunteer_id: volunteer.id,
            type: 'signup',
            description: `Signed up via Meta Ads${lead.form_name ? ` (${lead.form_name})` : ''}`,
            metadata: {
              meta_lead_id: metaLeadId,
              ad_name: lead.ad_name ?? null,
              campaign_name: lead.campaign_name ?? null,
              form_name: lead.form_name ?? null,
              platform: platform || null,
            },
            created_by: 'system',
          });
        } catch (interactionErr) {
          console.error('[webhooks/meta-ads/interaction]', interactionErr);
        }

        success += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        errors.push({ meta_lead_id: metaLeadId, error: message });
      }
    }

    return NextResponse.json({ success, errors });
  } catch (err) {
    return handleError(err, 'POST /api/webhooks/meta-ads');
  }
}
