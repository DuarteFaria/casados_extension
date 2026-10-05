import { v, ConvexError, type Infer } from "convex/values";
import { action, internalMutation, internalQuery, query } from "./_generated/server";
import { internal, components } from "./_generated/api";
import { RateLimiter, MINUTE, HOUR } from "@convex-dev/rate-limiter";

const OPTO_API = "https://opto.sic.pt/api/v1/content/item/";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_IDS_PER_QUERY = 200;

const rateLimiter = new RateLimiter(components.rateLimiter, {
  voteBurst: { kind: "token bucket", rate: 30, period: MINUTE, capacity: 15 },
  voteHourly: { kind: "fixed window", rate: 300, period: HOUR },
  momentsHourly: { kind: "fixed window", rate: 30, period: HOUR },
});

function assertUuid(value: string, name: string) {
  if (!UUID.test(value)) throw new ConvexError(`${name} inválido`);
}

const contentMeta = v.object({
  type: v.string(),
  title: v.string(),
  seriesId: v.optional(v.string()),
  seasonId: v.optional(v.string()),
  seasonNumber: v.optional(v.number()),
  episodeNumber: v.optional(v.number()),
  verified: v.boolean(),
});

export const MIN_SCORE = 1;
export const MAX_SCORE = 5;
const MAX_MOMENTS = 99;
const EMPTY_HIST = () => Array(MAX_SCORE - MIN_SCORE + 1).fill(0);

/**
 * Set this device's score and/or the shared "Momentos o7" count for an episode
 * or movie. Moments are one value for everyone (last write wins); `moments: null`
 * clears it. Runs as an action so the first input on a
 * piece of content can be checked against Opto's public API (exists + released).
 */
export const vote = action({
  args: {
    deviceId: v.string(),
    contentId: v.string(),
    score: v.optional(v.number()),
    moments: v.optional(v.union(v.number(), v.null())),
  },
  handler: async (ctx, { deviceId, contentId, score, moments }): Promise<Stats> => {
    assertUuid(deviceId, "deviceId");
    assertUuid(contentId, "contentId");
    if (score === undefined && moments === undefined) throw new ConvexError("Nada para guardar");
    if (score !== undefined && (!Number.isInteger(score) || score < MIN_SCORE || score > MAX_SCORE)) {
      throw new ConvexError(`A nota tem de ser entre ${MIN_SCORE} e ${MAX_SCORE}`);
    }
    if (moments != null && (!Number.isInteger(moments) || moments < 0 || moments > MAX_MOMENTS)) {
      throw new ConvexError(`Momentos o7 tem de ser entre 0 e ${MAX_MOMENTS}`);
    }

    await rateLimiter.limit(ctx, "voteBurst", { key: deviceId, throws: true });
    await rateLimiter.limit(ctx, "voteHourly", { key: deviceId, throws: true });
    if (moments !== undefined) {
      await rateLimiter.limit(ctx, "momentsHourly", { key: deviceId, throws: true });
    }

    const known: boolean = await ctx.runQuery(internal.ratings.isKnown, { contentId });
    const meta = known ? undefined : await fetchOptoMeta(contentId);

    return await ctx.runMutation(internal.ratings.recordVote, {
      deviceId,
      contentId,
      score,
      moments,
      meta,
    });
  },
});

type Stats = ReturnType<typeof toStats>;
type ContentMeta = Infer<typeof contentMeta>;

async function fetchOptoMeta(contentId: string): Promise<ContentMeta> {
  let res: Response;
  try {
    res = await fetch(OPTO_API + contentId, { headers: { accept: "application/json" } });
  } catch {
    // Opto unreachable (network/geo-block): accept, but flag as unverified.
    return { type: "unknown", title: "", verified: false };
  }
  if (res.status === 400 || res.status === 404) {
    throw new ConvexError("Conteúdo não existe na Opto");
  }
  if (!res.ok) return { type: "unknown", title: "", verified: false };

  const item = await res.json();
  if (typeof item.release_date === "number" && item.release_date * 1000 > Date.now()) {
    throw new ConvexError("Este episódio ainda não estreou");
  }
  return {
    type: String(item.type ?? "unknown"),
    title: String(item.title ?? "").trim(),
    seriesId: item.series?.id,
    seasonId: item.season?.id,
    seasonNumber: item.season?.season,
    episodeNumber: item.episode_number,
    verified: true,
  };
}

export const isKnown = internalQuery({
  args: { contentId: v.string() },
  handler: async (ctx, { contentId }) => {
    const row = await ctx.db
      .query("contents")
      .withIndex("by_contentId", (q) => q.eq("contentId", contentId))
      .unique();
    return row !== null;
  },
});

export const recordVote = internalMutation({
  args: {
    deviceId: v.string(),
    contentId: v.string(),
    score: v.optional(v.number()),
    moments: v.optional(v.union(v.number(), v.null())),
    meta: v.optional(contentMeta),
  },
  handler: async (ctx, { deviceId, contentId, score, moments, meta }) => {
    let content = await ctx.db
      .query("contents")
      .withIndex("by_contentId", (q) => q.eq("contentId", contentId))
      .unique();
    if (!content) {
      if (!meta) throw new ConvexError("Conteúdo desconhecido");
      const id = await ctx.db.insert("contents", { contentId, ...meta, count: 0, sum: 0, hist: EMPTY_HIST() });
      content = (await ctx.db.get(id))!;
    }

    const existing = await ctx.db
      .query("votes")
      .withIndex("by_device_content", (q) => q.eq("deviceId", deviceId).eq("contentId", contentId))
      .unique();

    if (score !== undefined) {
      const hist = [...content.hist];
      let { count, sum } = content;
      if (existing) {
        hist[existing.score - MIN_SCORE]--;
        sum -= existing.score;
        await ctx.db.patch(existing._id, { score, updatedAt: Date.now() });
      } else {
        count++;
        await ctx.db.insert("votes", { deviceId, contentId, score, updatedAt: Date.now() });
      }
      hist[score - MIN_SCORE]++;
      sum += score;
      await ctx.db.patch(content._id, { count, sum, hist });
    }

    if (moments !== undefined && (moments ?? undefined) !== content.moments) {
      const to = moments ?? undefined;
      await ctx.db.insert("momentEdits", { contentId, deviceId, from: content.moments, to });
      await ctx.db.patch(content._id, { moments: to, momentsUpdatedAt: Date.now() });
    }

    const updated = (await ctx.db.get(content._id))!;
    return toStats(updated, score ?? existing?.score ?? null);
  },
});

type Aggregates = {
  count: number;
  sum: number;
  hist: number[];
  moments?: number;
  momentsUpdatedAt?: number;
};

function toStats(a: Aggregates, mine: number | null) {
  return {
    count: a.count,
    avg: a.count ? a.sum / a.count : null,
    hist: a.hist,
    mine,
    moments: a.moments ?? null,
    momentsUpdatedAt: a.momentsUpdatedAt ?? null,
  };
}

const EMPTY: Aggregates = { count: 0, sum: 0, hist: EMPTY_HIST() };

/** Stats for many episodes at once, plus this device's own score on each. */
export const getStats = query({
  args: { contentIds: v.array(v.string()), deviceId: v.optional(v.string()) },
  handler: async (ctx, { contentIds, deviceId }) => {
    if (contentIds.length > MAX_IDS_PER_QUERY) throw new ConvexError("Demasiados conteúdos");
    const out: Record<string, Stats> = {};
    for (const contentId of new Set(contentIds)) {
      const content = await ctx.db
        .query("contents")
        .withIndex("by_contentId", (q) => q.eq("contentId", contentId))
        .unique();
      const mine = deviceId
        ? await ctx.db
            .query("votes")
            .withIndex("by_device_content", (q) =>
              q.eq("deviceId", deviceId).eq("contentId", contentId),
            )
            .unique()
        : null;
      out[contentId] = toStats(content ?? EMPTY, mine?.score ?? null);
    }
    return out;
  },
});
