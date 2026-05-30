import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const ROUND_TYPES = [
  "round_of_16",
  "quarter_final",
  "semi_final",
  "final",
] as const;

export const ROUND_STATUSES = ["pending", "active", "completed"] as const;

const HeatSchema = new Schema(
  {
    number: {
      type: Number,
      required: true,
      min: 1,
    },
    competitors: [
      {
        type: Schema.Types.ObjectId,
        ref: "Competitor",
        required: true,
      },
    ],
  },
  {
    _id: false,
  },
);

const RoundSchema = new Schema(
  {
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    competition: {
      type: Schema.Types.ObjectId,
      ref: "Competition",
      index: true,
    },
    type: {
      type: String,
      enum: ROUND_TYPES,
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      required: true,
      min: 1,
    },
    dances: {
      type: [String],
      required: true,
      validate: {
        validator: (dances: string[]) => dances.length > 0,
        message: "Round must include at least one dance",
      },
    },
    competitors: [
      {
        type: Schema.Types.ObjectId,
        ref: "Competitor",
        required: true,
      },
    ],
    heats: {
      type: [HeatSchema],
      default: [],
    },
    targetQualifierCount: {
      type: Number,
      min: 1,
    },
    previousRound: {
      type: Schema.Types.ObjectId,
      ref: "Round",
    },
    status: {
      type: String,
      enum: ROUND_STATUSES,
      default: "pending",
    },
  },
  {
    timestamps: true,
  },
);

RoundSchema.index({ category: 1, order: 1 }, { unique: true });
RoundSchema.index({ category: 1, status: 1 });

export type RoundType = (typeof ROUND_TYPES)[number];
export type RoundStatus = (typeof ROUND_STATUSES)[number];
export type Round = InferSchemaType<typeof RoundSchema>;

export const RoundModel =
  (mongoose.models.Round as Model<Round> | undefined) ??
  mongoose.model<Round>("Round", RoundSchema);
