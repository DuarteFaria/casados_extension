import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  // One row per Opto episode/movie that has received at least one input.
  // Aggregates live here so reads never scan the votes table.
  contents: defineTable({
    contentId: v.string(),
    type: v.string(), // "episode" | "movie" | ...
    title: v.string(),
    seriesId: v.optional(v.string()),
    seasonId: v.optional(v.string()),
    seasonNumber: v.optional(v.number()),
    episodeNumber: v.optional(v.number()),
    // false when Opto's API could not be reached to confirm the metadata.
    verified: v.boolean(),
    count: v.number(),
    sum: v.number(),
    hist: v.array(v.number()), // votes per score, index 0..4 = score 1..5
    // "Momentos o7": one shared number per episode, editable by anyone (last write wins).
    moments: v.optional(v.number()),
    momentsUpdatedAt: v.optional(v.number()),
  })
    .index("by_contentId", ["contentId"])
    .index("by_seasonId", ["seasonId"]),

  votes: defineTable({
    deviceId: v.string(),
    contentId: v.string(),
    score: v.number(),
    updatedAt: v.number(),
  }).index("by_device_content", ["deviceId", "contentId"]),

  // Audit log of every Momentos o7 change, so vandalism can be spotted and reverted.
  momentEdits: defineTable({
    contentId: v.string(),
    deviceId: v.string(),
    from: v.optional(v.number()),
    to: v.optional(v.number()),
  })
    .index("by_contentId", ["contentId"])
    .index("by_deviceId", ["deviceId"]),
});
