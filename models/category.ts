import "server-only";

import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const DISCIPLINES = ["standard", "latin"] as const;
export const CATEGORY_STATUSES = ["draft", "active", "completed"] as const;

const CategorySchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    competition: {
      type: Schema.Types.ObjectId,
      ref: "Competition",
      index: true,
    },
    discipline: {
      type: String,
      enum: DISCIPLINES,
      required: true,
    },
    ageGroup: {
      type: String,
      required: true,
      trim: true,
    },
    dances: {
      type: [String],
      required: true,
      validate: {
        validator: (dances: string[]) => dances.length > 0,
        message: "Category must include at least one dance",
      },
    },
    status: {
      type: String,
      enum: CATEGORY_STATUSES,
      default: "draft",
    },
    maxFinalists: {
      type: Number,
      default: 6,
      min: 1,
    },
  },
  {
    timestamps: true,
  },
);

CategorySchema.index(
  { competition: 1, discipline: 1, ageGroup: 1, name: 1 },
  { unique: true },
);
CategorySchema.index({ status: 1 });

export type Discipline = (typeof DISCIPLINES)[number];
export type CategoryStatus = (typeof CATEGORY_STATUSES)[number];
export type Category = InferSchemaType<typeof CategorySchema>;

export const CategoryModel =
  (mongoose.models.Category as Model<Category> | undefined) ??
  mongoose.model<Category>("Category", CategorySchema);
