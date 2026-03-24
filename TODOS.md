# TODOs

## Duplicate field name warning
- **What:** Warn users when creating a custom field whose name matches a default field (Phone, Zip Code, Email, etc.)
- **Why:** User created "Phone Number" and "Zip Code" custom fields that duplicated defaults. Now that defaults are visible in FormEditor this is less likely, but a programmatic warning is more robust.
- **Where to start:** `app/api/fields/route.ts` POST handler — compare incoming `name` against default field names before inserting.

## Mixed mode email recipients (filters + manual adds)
- **What:** Allow combining filter-based bulk selection with manually added/removed individual volunteers in a single email send.
- **Why:** Currently the email compose page has exclusive "All" vs "Specific" modes. A natural next ask is "filter to a tag, then also add my boss" or "filter to active volunteers but exclude these 3."
- **Where to start:** `app/email/page.tsx` — the sendMode toggle and To row UI. Would need to reconcile filter count + manual additions, dedup logic, and a way to exclude specific volunteers from filter results. The send API (`app/api/email/send/route.ts`) would need to accept both `filter_criteria` and `volunteer_ids` simultaneously, plus an `exclude_ids` array.
- **Depends on:** Individual volunteer selection (shipped).

## Forgot password flow
- **What:** Add a "Forgot password?" link on the login page that sends a password reset email via Resend with VMLA branding.
- **Why:** Currently there's no self-service password reset. If a team member forgets their password, an admin must re-invite them.
- **Where to start:** Create `app/api/auth/reset/route.ts` using `supabase.auth.admin.generateLink({ type: 'recovery' })` + Resend. Add a reset email template in `lib/emails/`. The reset link should redirect to `/set-password` directly (same pattern as invite flow). Add a "Forgot password?" link to `app/login/page.tsx`.

## Saved email templates
- **What:** Save/load reusable email templates from the compose page.
- **Why:** Coordinators often send similar emails (event reminders, welcome messages). Templates avoid re-composing from scratch.
- **Where to start:** New `email_templates` table in Supabase, CRUD API routes, and a template picker in the compose page.
- **Depends on:** Rich text editor (shipped).
- **Priority:** P2 | **Effort:** M

## Mobile card layout for volunteers
- **What:** Replace the single-column table on mobile with a card-based layout showing name + email/phone action icons.
- **Why:** The current CSS-only responsive approach (hiding columns) is functional but a card layout would feel more native on mobile — better touch targets, room for a subtle status indicator, and a more polished UX.
- **Where to start:** `app/volunteers/page.tsx` — conditionally render a card list on small screens instead of the `<Table>`. Each card would show the volunteer name as a link, plus `<Mail>` and `<Phone>` icon buttons. Could reuse the existing `Badge` component for status.
- **Depends on:** Nothing (current `hidden md:table-cell` approach ships first as the quick win).
- **Priority:** P3 | **Effort:** S

## Cross-page bulk selection improvements
- **What:** Extend the volunteers → email "Email Group" flow to support multi-page selection (currently only operates on the visible page of 50).
- **Why:** The sessionStorage handoff works well for single-page selections, but power users may want to select across pages or pass filter criteria directly to the email page.
- **Where to start:** Consider passing the current filter rules + selectedIds to the email page instead of resolved volunteer objects. The email page would then fetch matching volunteers itself. Alternatively, add a "select all matching" checkbox that passes filter criteria.
- **Depends on:** Email Group bulk action (shipped).
- **Priority:** P3 | **Effort:** M

## Expired invite link UX
- **What:** When a user clicks an expired invite link (>24h), they're silently redirected to `/login` with no explanation. Detect `error_description` in URL hash on `/set-password` or `/login` and show "Your invite link has expired — ask your admin for a new one."
- **Why:** Currently expired links fail silently, leaving the user confused.
- **Where to start:** Parse `window.location.hash` on `/set-password` page load for `error_description`. If present, show a user-friendly message instead of redirecting to `/login`.
- **Priority:** P2 | **Effort:** S

## Instil forward monitoring/alerting
- **What:** Add monitoring for Instil form forward failures. Currently failures are logged but not alerted on.
- **Why:** Silent breakage risk — if Instil changes their form or adds reCAPTCHA enforcement, forwards will fail silently and volunteers won't appear in Instil.
- **Where to start:** Could use Vercel log drains + alerting on `[submit/instil-forward]` error patterns, or add a simple failure counter to Supabase.
- **Priority:** P2 | **Effort:** S

## Comprehensive submit route test coverage
- **What:** Add end-to-end tests for the full submit route handler covering custom field validation, Instil forwarding with various field combinations, and edge cases.
- **Why:** Current tests cover happy path and basic validation. The Instil forwarding adds more surface area to test (field mapping correctness, multiselect serialization, missing custom_data).
- **Where to start:** Expand `__tests__/submit.test.ts` or create a dedicated integration test file.
- **Priority:** P3 | **Effort:** M

## Resend Batch API migration
- **What:** Replace the per-recipient `resend.emails.send()` loop with the Resend Batch API (single API call for all recipients).
- **Why:** Current approach makes N API calls for N recipients, hitting rate limits on larger sends. Batch API sends up to 100 emails in one call.
- **Where to start:** `lib/process-emails.ts` — replace the `for (const recipient of recipients)` loop with a single `resend.batch.send()` call. Map recipients to the batch payload format, then update all statuses from the batch response.
- **Priority:** P2 | **Effort:** M

## Phone number normalization
- **What:** Normalize phone numbers to a consistent format (e.g. E.164: `+13108663844`).
- **Why:** The Instil import brought in mixed formats (`+3108663844` vs `+1 (818) 929-4571`). Form submissions may also produce inconsistent formats. This affects search consistency and display.
- **Where to start:** Add a `normalizePhone()` helper in `lib/validation.ts`. Apply it in `POST /api/volunteers`, `POST /api/submit/[slug]`, and optionally run a one-time migration on existing data. Consider using `libphonenumber-js` for robust parsing.
