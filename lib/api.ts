/** API request and response shapes (contract §4). Browser-safe: zod and types only. */
import { z } from "zod";
import { SLOT_KEYS, type Blueprint, type ReviewView, type Session } from "./types";
import type { Catalog } from "./engine";

export const TEXT_MAX = 2000;
export const NOTE_MAX = 2000;
const text = z.string().trim().min(1).max(TEXT_MAX);

/** POST /api/sessions/[id] body. Requester actions only. */
export const ClientActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("answer"), value: text }),
  z.object({ type: z.literal("edit"), key: z.enum(SLOT_KEYS), value: text }),
  z.object({ type: z.literal("resolve"), choice: z.enum(["selfreport", "route", "keep"]) }),
  z.object({
    type: z.literal("choose_scope"),
    scope: z.enum(["faq", "guided", "open"]),
    role: z.enum(["cheap", "capable"]),
    // The engine still runs cleanKnobs. Missing or NaN knobs are a 400 now, not a default.
    knobs: z.object({ studentsPerMonth: z.number(), convsPerStudent: z.number() }),
  }),
  z.object({ type: z.literal("continue") }),       // tests -> blueprint
  z.object({ type: z.literal("reopen_scope") }),   // tests | blueprint -> scope
  z.object({ type: z.literal("submit") }),         // blueprint -> review
  z.object({ type: z.literal("retry") }),
  z.object({ type: z.literal("reset") }),
]);
export type ClientAction = z.infer<typeof ClientActionSchema>;

/** POST /api/review/[reviewId] body. Reviewer actions only. */
export const ReviewActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("open"), version: z.number().int().positive() }),
  z.object({
    type: z.literal("decide"),
    version: z.number().int().positive(),
    status: z.enum(["approved", "changes", "rejected"]),
    note: z.string().trim().max(NOTE_MAX).optional(),
  }),
]).superRefine((a, ctx) => {
  if (a.type === "decide" && a.status !== "approved" && !a.note) {
    ctx.addIssue({ code: "custom", message: "Say what should change, or why it's rejected." });
  }
});
export type ReviewAction = z.infer<typeof ReviewActionSchema>;

export interface SessionResponse {
  session?: Session;
  /** Present when session.step is "blueprint" (draft) or "review" | "done" (frozen latest version). */
  blueprint?: Blueprint;
  error?: string;
  mode?: string;
  catalog?: Catalog;
}

export interface ReviewResponse {
  review?: ReviewView;
  error?: string;
  mode?: string;
}

/** Relative reviewer path. FE prefixes window.location.origin. */
export const reviewPath = (reviewId: string) => `/review/${reviewId}`;
