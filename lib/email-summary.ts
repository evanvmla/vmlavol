// Pure functions for email summary aggregation — no Supabase dependency.

export interface RecipientStat {
  email_send_id: string;
  status: string;
  count: number;
}

export interface RecipientTagStat {
  email_send_id: string;
  tag: string;
  status: string;
  count: number;
}

export interface TagDistribution {
  tag: string;
  count: number;
}

export interface EmailSend {
  id: string;
  subject: string;
  body: string;
  filter_criteria: Record<string, unknown> | null;
  recipient_count: number;
  status: string;
  sent_at: string | null;
  created_at: string;
}

export interface SendStats {
  sent: number;
  delivered: number;
  opened: number;
  failed: number;
}

export interface SummarySend {
  id: string;
  subject: string;
  sent_at: string | null;
  status: string;
  recipient_count: number;
  tags: TagDistribution[];
  stats: SendStats;
}

export interface TagBreakdown {
  tag: string;
  sendCount: number;
  recipientCount: number;
  stats: { delivered: number; opened: number; failed: number };
}

export interface SummaryTotals {
  totalSends: number;
  totalRecipients: number;
  deliveredCount: number;
  openedCount: number;
  failedCount: number;
  deliveryRate: number;
  openRate: number;
}

export interface SummaryResult {
  totals: SummaryTotals;
  tagBreakdown: TagBreakdown[];
  sends: SummarySend[];
}

/**
 * Build a stats map from the RPC result: send_id → { sent, delivered, opened, failed }
 */
function buildStatsMap(stats: RecipientStat[]): Map<string, SendStats> {
  const map = new Map<string, SendStats>();
  for (const row of stats) {
    let entry = map.get(row.email_send_id);
    if (!entry) {
      entry = { sent: 0, delivered: 0, opened: 0, failed: 0 };
      map.set(row.email_send_id, entry);
    }
    const count = Number(row.count) || 0;
    switch (row.status) {
      case 'sent':      entry.sent      += count; break;
      case 'delivered': entry.delivered += count; break;
      case 'opened':    entry.opened    += count; break;
      case 'failed':    entry.failed    += count; break;
    }
  }
  return map;
}

/**
 * Build per-send tag distributions from actual recipient tags.
 * Returns a map of send_id → TagDistribution[] sorted by count desc.
 */
export function buildTagDistributions(
  tagStats: RecipientTagStat[],
): Map<string, TagDistribution[]> {
  // send_id → tag → total recipients (sum across all statuses)
  const intermediate = new Map<string, Map<string, number>>();

  for (const row of tagStats) {
    let sendMap = intermediate.get(row.email_send_id);
    if (!sendMap) {
      sendMap = new Map();
      intermediate.set(row.email_send_id, sendMap);
    }
    sendMap.set(row.tag, (sendMap.get(row.tag) || 0) + Number(row.count));
  }

  const result = new Map<string, TagDistribution[]>();
  intermediate.forEach((tagMap, sendId) => {
    const distributions: TagDistribution[] = Array.from(tagMap.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);
    result.set(sendId, distributions);
  });
  return result;
}

/**
 * Build aggregate delivery stats per actual recipient tag.
 * A recipient with tags [A, B] counted as +1 for both A and B (RPC unnest handles this).
 */
export function buildTagBreakdown(tagStats: RecipientTagStat[]): TagBreakdown[] {
  // tag → { sends seen, total recipients, delivered, opened, failed }
  const tagMap = new Map<string, {
    sends: Set<string>;
    recipientCount: number;
    delivered: number;
    opened: number;
    failed: number;
  }>();

  for (const row of tagStats) {
    let entry = tagMap.get(row.tag);
    if (!entry) {
      entry = { sends: new Set(), recipientCount: 0, delivered: 0, opened: 0, failed: 0 };
      tagMap.set(row.tag, entry);
    }
    entry.sends.add(row.email_send_id);
    const count = Number(row.count) || 0;
    // All statuses contribute to recipientCount (total recipients with this tag)
    entry.recipientCount += count;
    switch (row.status) {
      case 'delivered': entry.delivered += count; break;
      case 'opened':    entry.opened    += count; break;
      case 'failed':    entry.failed    += count; break;
    }
  }

  return Array.from(tagMap.entries())
    .sort((a, b) => b[1].sends.size - a[1].sends.size)
    .map(([tag, data]) => ({
      tag,
      sendCount: data.sends.size,
      recipientCount: data.recipientCount,
      stats: { delivered: data.delivered, opened: data.opened, failed: data.failed },
    }));
}

/**
 * Compute full summary from sends + recipient stats + actual recipient tag stats.
 */
export function computeSummary(
  sends: EmailSend[],
  stats: RecipientStat[],
  tagStats: RecipientTagStat[],
): SummaryResult {
  const statsMap = buildStatsMap(stats);
  const tagDistributions = buildTagDistributions(tagStats);

  let totalRecipients = 0;
  let deliveredCount = 0;
  let openedCount = 0;
  let failedCount = 0;

  const summarySends: SummarySend[] = sends.map(send => {
    const sendStats = statsMap.get(send.id) || { sent: 0, delivered: 0, opened: 0, failed: 0 };
    const tags = tagDistributions.get(send.id) || [];

    totalRecipients += send.recipient_count;
    deliveredCount  += sendStats.delivered;
    openedCount     += sendStats.opened;
    failedCount     += sendStats.failed;

    return {
      id: send.id,
      subject: send.subject,
      sent_at: send.sent_at,
      status: send.status,
      recipient_count: send.recipient_count,
      tags,
      stats: sendStats,
    };
  });

  const totalSends = sends.length;
  const deliveryRate = totalRecipients > 0 ? deliveredCount / totalRecipients : 0;
  const openRate    = totalRecipients > 0 ? openedCount    / totalRecipients : 0;

  return {
    totals: {
      totalSends,
      totalRecipients,
      deliveredCount,
      openedCount,
      failedCount,
      deliveryRate,
      openRate,
    },
    tagBreakdown: buildTagBreakdown(tagStats),
    sends: summarySends,
  };
}
