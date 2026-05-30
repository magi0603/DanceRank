import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const CompetitorSchema = new Schema(
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
    number: {
      type: Number,
      required: true,
      min: 1,
    },
    leadName: {
      type: String,
      trim: true,
    },
    followName: {
      type: String,
      trim: true,
    },
    club: {
      type: String,
      trim: true,
    },
    country: {
      type: String,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  },
);

CompetitorSchema.index({ category: 1, number: 1 }, { unique: true });
CompetitorSchema.index({ category: 1, isActive: 1 });

export type Competitor = InferSchemaType<typeof CompetitorSchema>;

export const CompetitorModel =
  (mongoose.models.Competitor as Model<Competitor> | undefined) ??
  mongoose.model<Competitor>("Competitor", CompetitorSchema);
