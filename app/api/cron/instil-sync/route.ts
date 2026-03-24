import { NextRequest, NextResponse } from 'next/server';
import { verifyCronSecret } from '@/lib/api-helpers';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import chromium from '@sparticuz/chromium-min';

// Lazy-init puppeteer-extra with stealth to avoid build-time timeout
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let puppeteer: any;
function getPuppeteer() {
  if (!puppeteer) {
    /* eslint-disable @typescript-eslint/no-require-imports */
    const puppeteerCore = require('puppeteer-core');
    const { addExtra } = require('puppeteer-extra');
    const StealthPlugin = require('puppeteer-extra-plugin-stealth');
    /* eslint-enable @typescript-eslint/no-require-imports */
    puppeteer = addExtra(puppeteerCore);
    puppeteer.use(StealthPlugin());
  }
  return puppeteer;
}

const FIELD_SELECTORS = {
  first_name: 'input[name="field:82ae94b9-b235-4423-bc2e-fdf0c7d1ac23:first_name"]',
  last_name: 'input[name="field:82ae94b9-b235-4423-bc2e-fdf0c7d1ac23:last_name"]',
  email: 'input[name="field:8138f26e-0f52-4592-a6e5-314035977312:email"]',
  phone: 'input[name="field:6bb494e5-f4fc-4064-a795-ebe0dfaaccba:phone_number"]',
  zip_code: 'input[name="field:dec0acfb-2d08-40db-9f0e-894ffd30b3e4:postal_code"]',
  acknowledgment: 'input[name="field:d9ade027-a76c-4deb-8463-95a39bbd8e8e:checkbox"]',
} as const;

// Default values for required multi-select fields when volunteer data doesn't include them
const DEFAULT_SPOKEN_LANGUAGE = ['English'];
const DEFAULT_HOW_TO_HELP = ['However I\'m needed'];

// Option indices (1-based) matching the live Instil form dropdowns.
// Verified 2026-03-14 via manual browser test.
const LANGUAGE_OPTIONS: Record<string, number> = {
  'english': 1, 'spanish': 2, 'korean': 3, 'armenian': 4,
  'chinese': 5, 'tagalog': 6, 'other': 7,
};

const HELP_OPTIONS: Record<string, number> = {
  'phone/texting': 1, 'canvassing': 2, 'events/house parties': 3,
  'social media amplification': 4, 'fundraising': 5,
  'translation/language support': 6, "however i'm needed": 7,
};

// GET: queue stats for debugging
export async function GET(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const supabase = createSupabaseAdmin();
  const [pending, synced, failed] = await Promise.all([
    supabase.from('instil_sync_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('instil_sync_queue').select('id', { count: 'exact', head: true }).eq('status', 'synced'),
    supabase.from('instil_sync_queue').select('id', { count: 'exact', head: true }).eq('status', 'failed'),
  ]);
  return NextResponse.json({
    pending: pending.count ?? 0,
    synced: synced.count ?? 0,
    failed: failed.count ?? 0,
  });
}

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const instilFormUrl = process.env.INSTIL_FORM_URL;
  if (!instilFormUrl) {
    return NextResponse.json({ error: 'INSTIL_FORM_URL not configured' }, { status: 500 });
  }

  const supabase = createSupabaseAdmin();

  // Fetch one pending entry (one per cron invocation to stay within timeout)
  const { data: entries, error: fetchErr } = await supabase
    .from('instil_sync_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(1);

  if (fetchErr) {
    console.error('[instil-sync] fetch error:', fetchErr);
    return NextResponse.json({ error: 'Failed to fetch queue' }, { status: 500 });
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0 });
  }

  let browser;
  let processed = 0;
  let failed = 0;

  try {
    browser = await getPuppeteer().launch({
      args: [
        ...chromium.args,
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--lang=en-US,en',
      ],
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(
        'https://github.com/Sparticuz/chromium/releases/download/v143.0.4/chromium-v143.0.4-pack.x64.tar'
      ),
      headless: 'shell',
    });
  } catch (launchErr) {
    const msg = launchErr instanceof Error ? launchErr.message : String(launchErr);
    console.error('[instil-sync] Browser launch failed:', msg);
    // Mark entries so retry_count increments (prevents infinite silent retries)
    for (const entry of entries) {
      await supabase
        .from('instil_sync_queue')
        .update({
          status: entry.retry_count >= 2 ? 'failed' : 'pending',
          retry_count: entry.retry_count + 1,
          error: `Browser launch failed: ${msg}`,
        })
        .eq('id', entry.id);
    }
    return NextResponse.json({ error: `Browser launch failed: ${msg}` }, { status: 500 });
  }

  try {
    for (const entry of entries) {
      try {
        const page = await browser.newPage();
        const vol = entry.volunteer_data;

        await page.goto(instilFormUrl, { waitUntil: 'networkidle0', timeout: 30000 });

        // Fill text fields
        await page.waitForSelector(FIELD_SELECTORS.first_name, { timeout: 10000 });
        await page.type(FIELD_SELECTORS.first_name, vol.first_name);
        await page.type(FIELD_SELECTORS.last_name, vol.last_name);
        await page.type(FIELD_SELECTORS.email, vol.email);

        // Phone — MUI tel input has "+1" prefilled; triple-click selects it, typing replaces
        const phoneInput = await page.$(FIELD_SELECTORS.phone);
        if (phoneInput) {
          await phoneInput.click({ clickCount: 3 });
          const rawPhone = vol.phone?.trim() || '2131111111';
          const phone = rawPhone.replace(/^\+?1/, '');
          await phoneInput.type(phone);
        }

        const zipCode = vol.zip_code?.trim() || '00000';
        await page.type(FIELD_SELECTORS.zip_code, zipCode);

        // Click-by-index for MUI Autocomplete multi-selects
        const selectByIndex = async (labelText: string, values: string[], optionMap: Record<string, number>) => {
          const input = await page.evaluateHandle((label: string) => {
            const combos = Array.from(document.querySelectorAll('[role="combobox"]'));
            for (const combo of combos) {
              const labelId = combo.getAttribute('aria-labelledby')?.split(' ')[0];
              if (labelId) {
                const labelEl = document.getElementById(labelId);
                if (labelEl?.textContent?.includes(label)) return combo;
              }
            }
            return null;
          }, labelText);

          if (!input) throw new Error(`Combobox "${labelText}" not found`);
          const el = input as unknown as import('puppeteer-core').ElementHandle;

          for (const value of values) {
            const index = optionMap[value.toLowerCase()];
            if (!index) throw new Error(`Unknown option "${value}" for "${labelText}"`);

            await el.click();
            await page.waitForSelector('[role="listbox"]', { timeout: 5000 });
            await page.click(`[role="option"]:nth-child(${index})`);
            await new Promise(r => setTimeout(r, 300));
          }

          await page.keyboard.press('Escape');
        };

        const languages = Array.isArray(vol.spoken_language) && vol.spoken_language.length > 0
          ? vol.spoken_language : DEFAULT_SPOKEN_LANGUAGE;
        await selectByIndex('Spoken Language', languages, LANGUAGE_OPTIONS);

        const helpOptions = Array.isArray(vol.how_to_help) && vol.how_to_help.length > 0
          ? vol.how_to_help : DEFAULT_HOW_TO_HELP;
        await selectByIndex('How would you like to help', helpOptions, HELP_OPTIONS);

        // Check acknowledgment
        const ackCheckbox = await page.$(FIELD_SELECTORS.acknowledgment);
        if (ackCheckbox) {
          await ackCheckbox.click();
        }

        // Submit and poll for success screen
        const submitButton = await page.$('button[type="submit"]');
        if (!submitButton) throw new Error('Submit button not found');
        await submitButton.click();

        // Poll for success: "keep an eye on your email" only appears on the success screen
        const submitted = await page.waitForFunction(
          () => document.body.innerText.includes('keep an eye on your email'),
          { timeout: 30000, polling: 1000 }
        ).then(() => true).catch(() => false);

        if (!submitted) {
          const debugInfo = await page.evaluate(() => {
            const inputs = Array.from(document.querySelectorAll('input'));
            const inputValues = inputs
              .filter(i => i.name || i.type)
              .map(i => `${i.name || i.type}: "${i.value}"`)
              .join(', ');
            const hasRecaptcha = !!document.querySelector('iframe[src*="recaptcha"]');
            const pageText = document.body.innerText.substring(0, 2000);
            return { inputValues, hasRecaptcha, pageText };
          });
          const fullError =
            `Form submission failed. reCAPTCHA: ${debugInfo.hasRecaptcha}. ` +
            `Inputs: ${debugInfo.inputValues}. Page: ${debugInfo.pageText}`;
          console.error('[instil-sync] Debug:', fullError);
          throw new Error(fullError.substring(0, 1000));
        }

        // Mark as synced
        await supabase
          .from('instil_sync_queue')
          .update({ status: 'synced', synced_at: new Date().toISOString() })
          .eq('id', entry.id);

        processed++;
        await page.close();
      } catch (entryErr) {
        console.error(`[instil-sync] Failed for entry ${entry.id}:`, entryErr);
        failed++;
        await supabase
          .from('instil_sync_queue')
          .update({
            status: 'failed',
            retry_count: entry.retry_count + 1,
            error: entryErr instanceof Error ? entryErr.message : String(entryErr),
          })
          .eq('id', entry.id);
      }
    }
  } finally {
    await browser.close();
  }

  console.log(`[instil-sync] processed=${processed} failed=${failed}`);
  return NextResponse.json({ processed, failed });
}
