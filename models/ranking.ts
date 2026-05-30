import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const DanceRankingSchema = new Schema(
  {
    dance: {
      type: String,
      required: true,
      trim: true,
    },
    placement: {
      type: Number,
      required: true,
      min: 1,
    },
    points: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  {
    _id: false,
  },
);

const RankingSchema = new Schema(
  {
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
    placement: {
      type: Number,
      required: true,
      min: 1,
    },
    totalPoints: {
      type: Number,
      required: true,
      min: 0,
    },
    marks: {
      type: Number,
      default: 0,
      min: 0,
    },
    isQualified: {
      type: Boolean,
      default: false,
    },
    isWinner: {
      type: Boolean,
      default: false,
    },
    dances: {
      type: [DanceRankingSchema],
      default: [],
    },
    calculatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

RankingSchema.index({ round: 1, competitor: 1 }, { unique: true });
RankingSchema.index({ round: 1, placement: 1 });
RankingSchema.index({ round: 1, isQualified: 1 });

export type Ranking = InferSchemaType<typeof RankingSchema>;

export const RankingModel =
  (mongoose.models.Ranking as Model<Ranking> | undefined) ??
  mongoose.model<Ranking>("Ranking", RankingSchema);

