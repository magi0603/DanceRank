import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const COMPETITION_STATUSES = ["draft", "active", "completed"] as const;

const CompetitionSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    date: {
      type: Date,
    },
    location: {
      type: String,
      trim: true,
    },
    organizer: {
      type: String,
      trim: true,
    },
    status: {
      type: String,
      enum: COMPETITION_STATUSES,
      default: "active",
    },
  },
  {
    timestamps: true,
  },
);

CompetitionSchema.index({ status: 1, date: -1 });
CompetitionSchema.index({ name: 1, date: 1 });

export type CompetitionStatus = (typeof COMPETITION_STATUSES)[number];
export type Competition = InferSchemaType<typeof CompetitionSchema>;

export const CompetitionModel =
  (mongoose.models.Competition as Model<Competition> | undefined) ??
  mongoose.model<Competition>("Competition", CompetitionSchema);
