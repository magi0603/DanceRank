import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const JudgeSchema = new Schema(
  {
    code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    competition: {
      type: Schema.Types.ObjectId,
      ref: "Competition",
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    pinHash: {
      type: String,
      trim: true,
      select: false,
    },
    displayOrder: {
      type: Number,
      required: true,
      min: 1,
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

JudgeSchema.index({ competition: 1, code: 1 }, { unique: true });
JudgeSchema.index({ displayOrder: 1 });

export type Judge = InferSchemaType<typeof JudgeSchema>;

export const JudgeModel =
  (mongoose.models.Judge as Model<Judge> | undefined) ??
  mongoose.model<Judge>("Judge", JudgeSchema);
