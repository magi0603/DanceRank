import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const SCORE_TYPES = ["selection", "ranking"] as const;

const ScoreSchema = new Schema(
  {
    judge: {
      type: Schema.Types.ObjectId,
      ref: "Judge",
      required: true,
      index: true,
    },
    category: {
      type: Schema.Types.ObjectId,
      ref: "Category",
      required: true,
      index: true,
    },
    round: {
      type: Schema.Types.ObjectId,
      ref: "Round",
      required: true,
      index: true,
    },
    competitor: {
      type: Schema.Types.ObjectId,
      ref: "Competitor",
      required: true,
      index: true,
    },
    dance: {
      type: String,
      required: true,
      trim: true,
    },
    type: {
      type: String,
      enum: SCORE_TYPES,
      required: true,
    },
    heatNumber: {
      type: Number,
      min: 1,
    },
    selected: {
      type: Boolean,
      default: false,
    },
    rank: {
      type: Number,
      min: 1,
    },
    submittedAt: {
      type: Date,
    },
    confirmationPinHash: {
      type: String,
      select: false,
    },
    signature: {
      type: String,
      select: false,
    },
    isLocked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

ScoreSchema.index(
  { judge: 1, round: 1, dance: 1, competitor: 1 },
  { unique: true },
);
ScoreSchema.index({ round: 1, dance: 1, type: 1 });
ScoreSchema.index({ judge: 1, round: 1, submittedAt: 1 });

ScoreSchema.pre("validate", function validateScoreShape() {
  if (this.type === "selection") {
    this.rank = undefined;
    return;
  }

  if (typeof this.rank !== "number") {
    throw new Error("Ranking score requires a rank");
  }

  this.selected = false;
});

export type ScoreType = (typeof SCORE_TYPES)[number];
export type Score = InferSchemaType<typeof ScoreSchema>;

export const ScoreModel =
  (mongoose.models.Score as Model<Score> | undefined) ??
  mongoose.model<Score>("Score", ScoreSchema);
