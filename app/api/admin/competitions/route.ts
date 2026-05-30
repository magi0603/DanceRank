import { NextResponse } from "next/server";

import { hashJudgePin } from "@/lib/auth";
import { splitIntoHeats } from "@/lib/heats";
import { connectMongoDB } from "@/lib/mongoose";
import { getCompetitionRounds, type CompetitionRound } from "@/lib/rounds";
import {
  CategoryModel,
  CompetitionModel,
  CompetitorModel,
  JudgeModel,
  RoundModel,
} from "@/models";

type JudgeInput = {
  code: string;
  name: string;
  pin: string;
};

type CategoryInput = {
  name: string;
  discipline: "latin" | "standard";
  ageGroup: string;
  dances: string[];
  maxFinalists?: number;
  competitorNumbers: number[];
};

type CreateCompetitionPayload = {
  name: string;
  date?: string;
  location?: string;
  organizer?: string;
  judges: JudgeInput[];
  categories: CategoryInput[];
};

const roundLabel: Record<CompetitionRound, string> = {
  round_of_16: "Round of 1/8",
  quarter_final: "Quarter Final",
  semi_final: "Semi Final",
  final: "Final",
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 });
}

function normalizeJudge(input: JudgeInput, index: number) {
  return {
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    pin: input.pin.trim(),
    displayOrder: index + 1,
    isActive: true,
  };
}

function normalizeCategory(input: CategoryInput) {
  const competitorNumbers = Array.from(
    new Set(
      input.competitorNumbers
        .map((number) => Math.floor(number))
        .filter((number) => Number.isFinite(number) && number > 0),
    ),
  ).sort((a, b) => a - b);

  return {
    name: input.name.trim(),
    discipline: input.discipline,
    ageGroup: input.ageGroup.trim(),
    dances: input.dances.map((dance) => dance.trim()).filter(Boolean),
    maxFinalists: Math.max(1, Math.floor(input.maxFinalists ?? 6)),
    competitorNumbers,
  };
}

async function dropLegacyIndex(
  model: typeof JudgeModel | typeof CategoryModel,
  indexName: string,
) {
  try {
    await model.collection.dropIndex(indexName);
  } catch (error) {
    const codeName =
      typeof error === "object" && error && "codeName" in error
        ? String(error.codeName)
        : "";
    if (codeName !== "IndexNotFound" && codeName !== "NamespaceNotFound") {
      throw error;
    }
  }
}

async function ensureCompetitionScopedIndexes() {
  await Promise.all([
    dropLegacyIndex(JudgeModel, "code_1"),
    dropLegacyIndex(CategoryModel, "discipline_1_ageGroup_1_name_1"),
  ]);
  await Promise.all([JudgeModel.syncIndexes(), CategoryModel.syncIndexes()]);
}

export async function GET() {
  await connectMongoDB();

  const [competitions, categoryCounts, judgeCounts] = await Promise.all([
    CompetitionModel.find().sort({ createdAt: -1 }).lean(),
    CategoryModel.aggregate<{ _id: unknown; count: number }>([
      { $group: { _id: "$competition", count: { $sum: 1 } } },
    ]),
    JudgeModel.aggregate<{ _id: unknown; count: number }>([
      { $group: { _id: "$competition", count: { $sum: 1 } } },
    ]),
  ]);

  const categoriesByCompetition = new Map(
    categoryCounts.map((row) => [String(row._id), row.count]),
  );
  const judgesByCompetition = new Map(
    judgeCounts.map((row) => [String(row._id), row.count]),
  );

  return NextResponse.json({
    ok: true,
    competitions: competitions.map((competition) => ({
      id: String(competition._id),
      name: competition.name,
      date: competition.date?.toISOString() ?? null,
      location: competition.location ?? "",
      organizer: competition.organizer ?? "",
      status: competition.status,
      categories: categoriesByCompetition.get(String(competition._id)) ?? 0,
      judges: judgesByCompetition.get(String(competition._id)) ?? 0,
    })),
  });
}

export async function POST(req: Request) {
  let payload: CreateCompetitionPayload;
  try {
    payload = (await req.json()) as CreateCompetitionPayload;
  } catch {
    return badRequest("Invalid JSON payload.");
  }

  if (!isNonEmptyString(payload.name)) {
    return badRequest("Competition name is required.");
  }

  const judges = (payload.judges ?? [])
    .filter(
      (judge) =>
        isNonEmptyString(judge.code) &&
        isNonEmptyString(judge.name) &&
        isNonEmptyString(judge.pin),
    )
    .map(normalizeJudge);

  if (judges.length === 0) {
    return badRequest("Add at least one judge.");
  }
  if (judges.length % 2 === 0) {
    return badRequest("The judge panel must have an odd number of judges.");
  }

  if (new Set(judges.map((judge) => judge.code)).size !== judges.length) {
    return badRequest("Judge codes must be unique.");
  }
  if (judges.some((judge) => judge.pin.length < 4)) {
    return badRequest("Each judge PIN must be at least 4 characters.");
  }

  const categories = (payload.categories ?? [])
    .filter(
      (category) =>
        isNonEmptyString(category.name) && isNonEmptyString(category.ageGroup),
    )
    .map(normalizeCategory);

  if (categories.length === 0) {
    return badRequest("Add at least one category.");
  }

  const invalidCategory = categories.find(
    (category) =>
      category.dances.length === 0 || category.competitorNumbers.length === 0,
  );
  if (invalidCategory) {
    return badRequest(
      "Each category needs at least one dance and one competitor number.",
    );
  }

  await connectMongoDB();
  await ensureCompetitionScopedIndexes();

  const competition = await CompetitionModel.create({
    name: payload.name.trim(),
    date: payload.date ? new Date(payload.date) : undefined,
    location: payload.location?.trim(),
    organizer: payload.organizer?.trim(),
    status: "active",
  });

  try {
    const normalizedJudges = await Promise.all(
      judges.map(async (judge) => ({
        code: judge.code,
        name: judge.name,
        pinHash: await hashJudgePin(judge.pin),
        displayOrder: judge.displayOrder,
        isActive: judge.isActive,
        competition: competition._id,
      })),
    );

    await JudgeModel.insertMany(
      normalizedJudges,
    );

    const createdCategories = [];

    for (const categoryInput of categories) {
      const category = await CategoryModel.create({
        competition: competition._id,
        name: categoryInput.name,
        discipline: categoryInput.discipline,
        ageGroup: categoryInput.ageGroup,
        dances: categoryInput.dances,
        maxFinalists: categoryInput.maxFinalists,
        status: "active",
      });

      const competitors = await CompetitorModel.insertMany(
        categoryInput.competitorNumbers.map((number) => ({
          competition: competition._id,
          category: category._id,
          number,
          isActive: true,
        })),
      );

      const competitorIds = competitors.map((competitor) => competitor._id);
      const roundTypes = getCompetitionRounds(competitorIds.length);
      let previousRoundId: string | undefined;
      let plannedCompetitorCount = competitorIds.length;

      for (const [roundIndex, roundType] of roundTypes.entries()) {
        const nextRoundType = roundTypes[roundIndex + 1];
        const targetQualifierCount =
          roundType === "final"
            ? undefined
            : nextRoundType === "final"
              ? Math.min(categoryInput.maxFinalists, plannedCompetitorCount)
              : Math.max(1, Math.floor(plannedCompetitorCount / 2));
        const heatGroups = splitIntoHeats(competitorIds, 8).map(
          (group, groupIndex) => ({
            number: groupIndex + 1,
            competitors: group,
          }),
        );

        const round = await RoundModel.create({
          competition: competition._id,
          category: category._id,
          type: roundType,
          name: roundLabel[roundType],
          order: roundIndex + 1,
          dances: categoryInput.dances,
          competitors: competitorIds,
          heats: heatGroups,
          targetQualifierCount,
          previousRound: previousRoundId,
          status: roundIndex === 0 ? "active" : "pending",
        });

        previousRoundId = String(round._id);
        if (targetQualifierCount) {
          plannedCompetitorCount = targetQualifierCount;
        }
      }

      createdCategories.push({
        id: String(category._id),
        name: category.name,
        competitors: competitorIds.length,
        rounds: roundTypes.length,
      });
    }

    return NextResponse.json(
      {
        ok: true,
        competition: {
          id: String(competition._id),
          name: competition.name,
        },
        judges: judges.length,
        categories: createdCategories,
      },
      { status: 201 },
    );
  } catch (error) {
    await Promise.all([
      RoundModel.deleteMany({ competition: competition._id }),
      CompetitorModel.deleteMany({ competition: competition._id }),
      CategoryModel.deleteMany({ competition: competition._id }),
      JudgeModel.deleteMany({ competition: competition._id }),
      CompetitionModel.findByIdAndDelete(competition._id),
    ]);

    const code =
      typeof error === "object" && error && "code" in error
        ? Number(error.code)
        : 0;
    if (code === 11000) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Competition could not be created because one of the names or codes already exists.",
        },
        { status: 409 },
      );
    }

    throw error;
  }
}
