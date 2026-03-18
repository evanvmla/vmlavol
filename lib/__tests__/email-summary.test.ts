import {
  computeSummary,
  buildTagDistributions,
  buildTagBreakdown,
} from '../email-summary';
import type { EmailSend, RecipientStat, RecipientTagStat } from '../email-summary';

const makeSend = (overrides: Partial<EmailSend> = {}): EmailSend => ({
  id: 'send-1',
  subject: 'Test Email',
  body: '<p>Hi</p>',
  filter_criteria: null,
  recipient_count: 100,
  status: 'sent',
  sent_at: '2025-01-15T12:00:00Z',
  created_at: '2025-01-15T12:00:00Z',
  ...overrides,
});

describe('buildTagDistributions', () => {
  it('returns empty map for empty input', () => {
    expect(buildTagDistributions([])).toEqual(new Map());
  });

  it('sums counts across statuses for each tag', () => {
    const tagStats: RecipientTagStat[] = [
      { email_send_id: 's1', tag: 'Canvassers', status: 'delivered', count: 45 },
      { email_send_id: 's1', tag: 'Canvassers', status: 'opened',    count: 20 },
      { email_send_id: 's1', tag: 'Phone Bank', status: 'delivered', count: 30 },
    ];
    const result = buildTagDistributions(tagStats);
    expect(result.get('s1')).toEqual([
      { tag: 'Canvassers', count: 65 },
      { tag: 'Phone Bank', count: 30 },
    ]);
  });

  it('groups correctly across multiple sends', () => {
    const tagStats: RecipientTagStat[] = [
      { email_send_id: 's1', tag: 'Alpha', status: 'delivered', count: 10 },
      { email_send_id: 's2', tag: 'Beta',  status: 'delivered', count: 20 },
    ];
    const result = buildTagDistributions(tagStats);
    expect(result.get('s1')).toEqual([{ tag: 'Alpha', count: 10 }]);
    expect(result.get('s2')).toEqual([{ tag: 'Beta',  count: 20 }]);
  });

  it('sorts tags by count descending within a send', () => {
    const tagStats: RecipientTagStat[] = [
      { email_send_id: 's1', tag: 'Small',  status: 'delivered', count: 5  },
      { email_send_id: 's1', tag: 'Large',  status: 'delivered', count: 50 },
      { email_send_id: 's1', tag: 'Medium', status: 'delivered', count: 20 },
    ];
    const result = buildTagDistributions(tagStats);
    const tags = result.get('s1')!.map(t => t.tag);
    expect(tags).toEqual(['Large', 'Medium', 'Small']);
  });
});

describe('buildTagBreakdown', () => {
  it('returns empty array for empty input', () => {
    expect(buildTagBreakdown([])).toEqual([]);
  });

  it('counts delivered/opened/failed per tag', () => {
    const tagStats: RecipientTagStat[] = [
      { email_send_id: 's1', tag: 'Canvassers', status: 'delivered', count: 45 },
      { email_send_id: 's1', tag: 'Canvassers', status: 'opened',    count: 20 },
      { email_send_id: 's1', tag: 'Canvassers', status: 'failed',    count: 5  },
    ];
    const result = buildTagBreakdown(tagStats);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      tag: 'Canvassers',
      sendCount: 1,
      stats: { delivered: 45, opened: 20, failed: 5 },
    });
  });

  it('counts unique sends per tag (not row count)', () => {
    const tagStats: RecipientTagStat[] = [
      { email_send_id: 's1', tag: 'Alpha', status: 'delivered', count: 10 },
      { email_send_id: 's2', tag: 'Alpha', status: 'delivered', count: 20 },
      { email_send_id: 's1', tag: 'Beta',  status: 'delivered', count: 10 },
    ];
    const result = buildTagBreakdown(tagStats);
    const alpha = result.find(t => t.tag === 'Alpha')!;
    const beta  = result.find(t => t.tag === 'Beta')!;
    expect(alpha.sendCount).toBe(2);
    expect(beta.sendCount).toBe(1);
  });

  it('volunteer with no tags contributes nothing', () => {
    // No rows → no tags
    expect(buildTagBreakdown([])).toEqual([]);
  });
});

describe('computeSummary', () => {
  it('returns zero totals for empty sends', () => {
    const result = computeSummary([], [], []);
    expect(result.totals.totalSends).toBe(0);
    expect(result.totals.totalRecipients).toBe(0);
    expect(result.totals.deliveryRate).toBe(0);
    expect(result.totals.openRate).toBe(0);
    expect(result.tagBreakdown).toEqual([]);
    expect(result.sends).toEqual([]);
  });

  it('guards against div-by-zero when 0 recipients', () => {
    const sends = [makeSend({ recipient_count: 0 })];
    const result = computeSummary(sends, [], []);
    expect(result.totals.deliveryRate).toBe(0);
    expect(result.totals.openRate).toBe(0);
    expect(Number.isNaN(result.totals.deliveryRate)).toBe(false);
    expect(Number.isNaN(result.totals.openRate)).toBe(false);
  });

  it('computes correct per-status counts', () => {
    const sends = [makeSend({ id: 's1', recipient_count: 50 })];
    const stats: RecipientStat[] = [
      { email_send_id: 's1', status: 'delivered', count: 30 },
      { email_send_id: 's1', status: 'opened',    count: 10 },
      { email_send_id: 's1', status: 'failed',    count: 5  },
      { email_send_id: 's1', status: 'sent',      count: 5  },
    ];
    const result = computeSummary(sends, stats, []);

    expect(result.totals.deliveredCount).toBe(30);
    expect(result.totals.openedCount).toBe(10);
    expect(result.totals.failedCount).toBe(5);
    expect(result.totals.deliveryRate).toBeCloseTo(0.6);
    expect(result.totals.openRate).toBeCloseTo(0.2);

    expect(result.sends[0].stats).toEqual({
      sent: 5,
      delivered: 30,
      opened: 10,
      failed: 5,
    });
  });

  it('populates per-send tags from actual recipient tags', () => {
    const sends = [makeSend({ id: 's1', recipient_count: 80 })];
    const tagStats: RecipientTagStat[] = [
      { email_send_id: 's1', tag: 'Canvassers', status: 'delivered', count: 50 },
      { email_send_id: 's1', tag: 'Phone Bank', status: 'delivered', count: 30 },
    ];
    const result = computeSummary(sends, [], tagStats);
    expect(result.sends[0].tags).toEqual([
      { tag: 'Canvassers', count: 50 },
      { tag: 'Phone Bank', count: 30 },
    ]);
  });

  it('builds tag breakdown from actual recipient tags', () => {
    const sends = [
      makeSend({ id: 's1', recipient_count: 40 }),
      makeSend({ id: 's2', recipient_count: 60 }),
    ];
    const tagStats: RecipientTagStat[] = [
      { email_send_id: 's1', tag: 'canvassers', status: 'delivered', count: 35 },
      { email_send_id: 's2', tag: 'canvassers', status: 'delivered', count: 50 },
      { email_send_id: 's2', tag: 'canvassers', status: 'opened',    count: 20 },
    ];
    const result = computeSummary(sends, [], tagStats);

    expect(result.tagBreakdown).toHaveLength(1);
    expect(result.tagBreakdown[0]).toMatchObject({
      tag: 'canvassers',
      sendCount: 2,
      stats: { delivered: 85, opened: 20, failed: 0 },
    });
  });

  it('send with 0 recipients and no tagStats shows empty tags', () => {
    const sends = [makeSend({ id: 's1', recipient_count: 0, filter_criteria: null })];
    const result = computeSummary(sends, [], []);
    expect(result.sends[0].tags).toEqual([]);
    expect(result.tagBreakdown).toEqual([]);
  });

  it('aggregates totals across multiple sends', () => {
    const sends = [
      makeSend({ id: 's1', recipient_count: 100 }),
      makeSend({ id: 's2', recipient_count: 200 }),
    ];
    const stats: RecipientStat[] = [
      { email_send_id: 's1', status: 'delivered', count: 90  },
      { email_send_id: 's1', status: 'opened',    count: 40  },
      { email_send_id: 's2', status: 'delivered', count: 180 },
      { email_send_id: 's2', status: 'failed',    count: 10  },
    ];
    const result = computeSummary(sends, stats, []);

    expect(result.totals.totalSends).toBe(2);
    expect(result.totals.totalRecipients).toBe(300);
    expect(result.totals.deliveredCount).toBe(270);
    expect(result.totals.openedCount).toBe(40);
    expect(result.totals.failedCount).toBe(10);
    expect(result.totals.deliveryRate).toBeCloseTo(0.9);
  });
});
