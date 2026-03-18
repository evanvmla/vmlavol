import { NextRequest, NextResponse } from 'next/server';
import { handleError, verifyCronSecret } from '@/lib/api-helpers';
import { createSupabaseAdmin } from '@/lib/supabase-server';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';

const FIELD_SELECTORS = {
  first_name: 'input[name="field:82ae94b9-b235-4423-bc2e-fdf0c7d1ac23:first_name"]',
  last_name: 'input[name="field:82ae94b9-b235-4423-bc2e-fdf0c7d1ac23:last_name"]',
  email: 'input[name="field:8138f26e-0f52-4592-a6e5-314035977312:email"]',
  phone: 'input[name="field:6bb494e5-f4fc-4064-a795-ebe0dfaaccba:phone_number"]',
  zip_code: 'input[name="field:dec0acfb-2d08-40db-9f0e-894ffd30b3e4:postal_code"]',
  spoken_language: 'field:07cb6b49-02f8-4f04-bf95-819f5be346cb',
  how_to_help: 'field:df72a02d-0151-45af-982d-d9340f7310fe',
  acknowledgment: 'input[name="field:d9ade027-a76c-4deb-8463-95a39bbd8e8e:checkbox"]',
} as const;

export async function POST(request: NextRequest) {
  if (!verifyCronSecret(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const instilFormUrl = process.env.INSTIL_FORM_URL;
  if (!instilFormUrl) {
    return NextResponse.json({ error: 'INSTIL_FORM_URL not configured' }, { status: 500 });
  }

  const supabase = createSupabaseAdmin();

  // Fetch pending queue entries
  const { data: entries, error: fetchErr } = await supabase
    .from('instil_sync_queue')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(5);

  if (fetchErr) {
    return handleError(fetchErr, 'POST /api/cron/instil-sync');
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({ processed: 0, failed: 0 });
  }

  let browser;
  let processed = 0;
  let failed = 0;

  try {
    browser = await puppeteer.launch({
      args: chromium.args,
      defaultViewport: { width: 1280, height: 720 },
      executablePath: await chromium.executablePath(),
      headless: true,
    });

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

        // Phone — MUI tel input: click, select all, type
        if (vol.phone) {
          const phoneInput = await page.$(FIELD_SELECTORS.phone);
          if (phoneInput) {
            await phoneInput.click({ clickCount: 3 });
            await phoneInput.type(vol.phone);
          }
        }

        if (vol.zip_code) {
          await page.type(FIELD_SELECTORS.zip_code, vol.zip_code);
        }

        // Multiselect checkboxes — spoken_language
        if (Array.isArray(vol.spoken_language)) {
          for (const lang of vol.spoken_language) {
            const checkbox = await page.$(`input[name^="${FIELD_SELECTORS.spoken_language}"][value="${lang}"]`);
            if (checkbox) {
              await checkbox.click();
            } else {
              // Try clicking by label text
              await page.evaluate((fieldId: string, labelText: string) => {
                const labels = Array.from(document.querySelectorAll('label'));
                for (const label of labels) {
                  const input = label.querySelector(`input[name*="${fieldId}"]`);
                  if (input && label.textContent?.trim() === labelText) {
                    (input as HTMLInputElement).click();
                    break;
                  }
                }
              }, FIELD_SELECTORS.spoken_language, lang);
            }
          }
        }

        // Multiselect checkboxes — how_to_help
        if (Array.isArray(vol.how_to_help)) {
          for (const help of vol.how_to_help) {
            const checkbox = await page.$(`input[name^="${FIELD_SELECTORS.how_to_help}"][value="${help}"]`);
            if (checkbox) {
              await checkbox.click();
            } else {
              await page.evaluate((fieldId: string, labelText: string) => {
                const labels = Array.from(document.querySelectorAll('label'));
                for (const label of labels) {
                  const input = label.querySelector(`input[name*="${fieldId}"]`);
                  if (input && label.textContent?.trim() === labelText) {
                    (input as HTMLInputElement).click();
                    break;
                  }
                }
              }, FIELD_SELECTORS.how_to_help, help);
            }
          }
        }

        // Check acknowledgment
        const ackCheckbox = await page.$(FIELD_SELECTORS.acknowledgment);
        if (ackCheckbox) {
          await ackCheckbox.click();
        }

        // Submit the form
        const submitButton = await page.$('button[type="submit"]');
        if (!submitButton) throw new Error('Submit button not found');
        await submitButton.click();

        // Wait for success indicator
        await page.waitForFunction(
          () => {
            const body = document.body.innerText.toLowerCase();
            return body.includes('thank') || body.includes('success') || body.includes('submitted');
          },
          { timeout: 15000 }
        );

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
            status: entry.retry_count >= 2 ? 'failed' : 'pending',
            retry_count: entry.retry_count + 1,
            error: entryErr instanceof Error ? entryErr.message : String(entryErr),
          })
          .eq('id', entry.id);
      }
    }
  } finally {
    if (browser) {
      await browser.close();
    }
  }

  console.log(`[instil-sync] processed=${processed} failed=${failed}`);
  return NextResponse.json({ processed, failed });
}
