"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getCompetitionRounds } from "@/lib/rounds";

type JudgeDraft = {
  code: string;
  name: string;
  pin: string;
};

type CategoryDraft = {
  name: string;
  discipline: "latin" | "standard";
  ageGroup: string;
  dancesText: string;
  maxFinalists: string;
  competitorNumbersText: string;
};

const defaultJudges: JudgeDraft[] = [
  { code: "S1", name: "Judge 1", pin: "1001" },
  { code: "S2", name: "Judge 2", pin: "1002" },
  { code: "S3", name: "Judge 3", pin: "1003" },
  { code: "S4", name: "Judge 4", pin: "1004" },
  { code: "S5", name: "Judge 5", pin: "1005" },
];

const defaultCategory: CategoryDraft = {
  name: "Latin Adults",
  discipline: "latin",
  ageGroup: "Adults",
  dancesText: "Samba, Cha Cha, Rumba, Paso Doble, Jive",
  maxFinalists: "6",
  competitorNumbersText: "101-112",
};

function parseCompetitorNumbers(value: string) {
  const numbers = new Set<number>();
  const parts = value
    .split(/[\s,]+/g)
    .map((part) => part.trim())
    .filter(Boolean);

  parts.forEach((part) => {
    const range = part.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      const low = Math.min(start, end);
      const high = Math.max(start, end);
      for (let current = low; current <= high; current += 1) {
        numbers.add(current);
      }
      return;
    }

    const number = Number(part);
    if (Number.isFinite(number) && number > 0) {
      numbers.add(Math.floor(number));
    }
  });

  return Array.from(numbers).sort((a, b) => a - b);
}

function getInvalidCompetitorTokens(value: string) {
  return value
    .split(/[\s,]+/g)
    .map((part) => part.trim())
    .filter(Boolean)
    .filter((part) => {
      if (/^\d+-\d+$/.test(part)) return false;
      const number = Number(part);
      return !Number.isFinite(number) || number <= 0;
    });
}

function parseDances(value: string) {
  return value
    .split(",")
    .map((dance) => dance.trim())
    .filter(Boolean);
}

function validateDraft(
  competitionName: string,
  judges: JudgeDraft[],
  categories: CategoryDraft[],
) {
  const errors: string[] = [];

  if (!competitionName.trim()) {
    errors.push("Competition name is required.");
  }

  const completeJudges = judges.filter(
    (judge) => judge.code.trim() && judge.name.trim() && judge.pin.trim(),
  );
  if (completeJudges.length === 0) {
    errors.push("Add at least one judge with a code and name.");
  }

  judges.forEach((judge, index) => {
    if (judge.code.trim() && !judge.name.trim()) {
      errors.push(`Judge ${index + 1} needs a name.`);
    }
    if (!judge.code.trim() && judge.name.trim()) {
      errors.push(`Judge ${index + 1} needs a code.`);
    }
    if ((judge.code.trim() || judge.name.trim()) && !judge.pin.trim()) {
      errors.push(`Judge ${index + 1} needs a PIN.`);
    }
    if (judge.pin.trim() && judge.pin.trim().length < 4) {
      errors.push(`Judge ${index + 1} PIN must be at least 4 characters.`);
    }
  });

  const judgeCodes = completeJudges.map((judge) =>
    judge.code.trim().toUpperCase(),
  );
  if (new Set(judgeCodes).size !== judgeCodes.length) {
    errors.push("Judge codes must be unique.");
  }
  if (completeJudges.length > 0 && completeJudges.length % 2 === 0) {
    errors.push("The judge panel must have an odd number of judges.");
  }

  if (categories.length === 0) {
    errors.push("Add at least one category.");
  }

  const categoryKeys = new Set<string>();
  categories.forEach((category, index) => {
    const label = `Category ${index + 1}`;
    const categoryName = category.name.trim();
    const ageGroup = category.ageGroup.trim();
    const dances = parseDances(category.dancesText);
    const competitorNumbers = parseCompetitorNumbers(
      category.competitorNumbersText,
    );
    const invalidTokens = getInvalidCompetitorTokens(
      category.competitorNumbersText,
    );
    const maxFinalists = Number(category.maxFinalists);

    if (!categoryName) errors.push(`${label} needs a name.`);
    if (!ageGroup) errors.push(`${label} needs an age group.`);
    if (dances.length === 0) errors.push(`${label} needs at least one dance.`);
    if (competitorNumbers.length === 0) {
      errors.push(`${label} needs at least one competitor number.`);
    }
    if (invalidTokens.length > 0) {
      errors.push(`${label} has invalid competitor entries.`);
    }
    if (!Number.isFinite(maxFinalists) || maxFinalists < 1) {
      errors.push(`${label} needs at least one finalist.`);
    }
    if (
      Number.isFinite(maxFinalists) &&
      competitorNumbers.length > 0 &&
      maxFinalists > competitorNumbers.length
    ) {
      errors.push(`${label} cannot have more finalists than competitors.`);
    }

    const key = [
      category.discipline,
      ageGroup.toLowerCase(),
      categoryName.toLowerCase(),
    ].join(":");
    if (categoryName && ageGroup) {
      if (categoryKeys.has(key)) {
        errors.push(`${label} duplicates another category.`);
      }
      categoryKeys.add(key);
    }
  });

  return {
    errors,
    isValid: errors.length === 0,
  };
}

export default function NewCompetitionPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [location, setLocation] = useState("");
  const [organizer, setOrganizer] = useState("");
  const [judges, setJudges] = useState<JudgeDraft[]>(defaultJudges);
  const [categories, setCategories] = useState<CategoryDraft[]>([
    defaultCategory,
  ]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const summary = useMemo(() => {
    const competitorCount = categories.reduce(
      (total, category) =>
        total + parseCompetitorNumbers(category.competitorNumbersText).length,
      0,
    );
    const danceCount = categories.reduce(
      (total, category) => total + parseDances(category.dancesText).length,
      0,
    );

    return {
      judges: judges.filter(
        (judge) => judge.code.trim() && judge.name.trim() && judge.pin.trim(),
      ).length,
      categories: categories.length,
      competitors: competitorCount,
      dances: danceCount,
      rounds: categories.reduce(
        (total, category) =>
          total +
          getCompetitionRounds(
            parseCompetitorNumbers(category.competitorNumbersText).length,
          ).length,
        0,
      ),
    };
  }, [categories, judges]);

  const validation = useMemo(
    () => validateDraft(name, judges, categories),
    [categories, judges, name],
  );

  function updateJudge(index: number, patch: Partial<JudgeDraft>) {
    setMessage(null);
    setJudges((prev) =>
      prev.map((judge, judgeIndex) =>
        judgeIndex === index ? { ...judge, ...patch } : judge,
      ),
    );
  }

  function updateCategory(index: number, patch: Partial<CategoryDraft>) {
    setMessage(null);
    setCategories((prev) =>
      prev.map((category, categoryIndex) =>
        categoryIndex === index ? { ...category, ...patch } : category,
      ),
    );
  }

  function addCategory() {
    setCategories((prev) => [
      ...prev,
      {
        ...defaultCategory,
        name: "",
        ageGroup: "",
        competitorNumbersText: "",
      },
    ]);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowValidation(true);
    if (!validation.isValid) {
      setMessage({
        type: "error",
        text: "Fix the setup checks before creating the competition.",
      });
      return;
    }

    setIsSubmitting(true);
    setMessage(null);

    try {
      const res = await fetch("/api/admin/competitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          date: date || undefined,
          location,
          organizer,
          judges,
          categories: categories.map((category) => ({
            name: category.name,
            discipline: category.discipline,
            ageGroup: category.ageGroup,
            dances: parseDances(category.dancesText),
            maxFinalists: Number(category.maxFinalists) || 6,
            competitorNumbers: parseCompetitorNumbers(
              category.competitorNumbersText,
            ),
          })),
        }),
      });

      const data = (await res.json()) as {
        error?: string;
        competition?: { id: string };
      };
      if (!res.ok) {
        setMessage({
          type: "error",
          text: data.error ?? "Competition could not be created.",
        });
        return;
      }

      setMessage({ type: "success", text: "Competition created." });
      router.push(
        data.competition?.id
          ? `/admin/competitions/${data.competition.id}`
          : "/admin/competitions",
      );
    } catch {
      setMessage({
        type: "error",
        text: "Competition could not be created.",
      });
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_oklch(0.98_0.05_160),_transparent_60%),radial-gradient(circle_at_bottom,_oklch(0.97_0.06_95),_transparent_55%)] px-4 pb-12 pt-8 text-foreground sm:px-6 lg:px-10">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Admin Setup
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              New Competition
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Create the event, judge panel, categories, competitors, and first
              active rounds.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/admin">Back to Dashboard</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto mt-8 grid w-full max-w-6xl gap-6 lg:grid-cols-[1fr_280px]">
        <form className="flex flex-col gap-6" onSubmit={handleSubmit}>
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <div className="border-b border-border pb-4">
                <h2 className="text-lg font-semibold">Competition Details</h2>
                <p className="text-sm text-muted-foreground">
                  This becomes the parent record for all judging data.
                </p>
              </div>

              <div className="mt-5 grid gap-4 sm:grid-cols-2">
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Competition Name
                  <input
                    required
                    value={name}
                    onChange={(event) => {
                      setMessage(null);
                      setName(event.target.value);
                    }}
                    placeholder="Sofia Dance Open"
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Date
                  <input
                    type="date"
                    value={date}
                    onChange={(event) => {
                      setMessage(null);
                      setDate(event.target.value);
                    }}
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Location
                  <input
                    value={location}
                    onChange={(event) => {
                      setMessage(null);
                      setLocation(event.target.value);
                    }}
                    placeholder="Sofia"
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="flex flex-col gap-2 text-sm font-medium">
                  Organizer
                  <input
                    value={organizer}
                    onChange={(event) => {
                      setMessage(null);
                      setOrganizer(event.target.value);
                    }}
                    placeholder="Dance Club"
                    className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-semibold">Judges</h2>
                  <p className="text-sm text-muted-foreground">
                    Use an odd number of judges. Codes become the judge links and submission identity.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    setJudges((prev) => [
                      ...prev,
                      {
                        code: `S${prev.length + 1}`,
                        name: "",
                        pin: String(1000 + prev.length + 1),
                      },
                    ])
                  }
                >
                  Add Judge
                </Button>
              </div>

              <div className="mt-5 flex flex-col gap-3">
                {judges.map((judge, index) => (
                  <div
                    key={index}
                    className="grid gap-3 sm:grid-cols-[120px_1fr_120px_auto]"
                  >
                    <input
                      value={judge.code}
                      onChange={(event) =>
                        updateJudge(index, { code: event.target.value })
                      }
                      className="rounded-md border border-border bg-white px-3 py-2 text-sm uppercase outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                    <input
                      value={judge.name}
                      onChange={(event) =>
                        updateJudge(index, { name: event.target.value })
                      }
                      placeholder="Judge name"
                      className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                    <input
                      value={judge.pin}
                      onChange={(event) =>
                        updateJudge(index, { pin: event.target.value })
                      }
                      placeholder="PIN"
                      className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={judges.length <= 1}
                      onClick={() =>
                        setJudges((prev) =>
                          prev.filter((_, judgeIndex) => judgeIndex !== index),
                        )
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                <div>
                  <h2 className="text-lg font-semibold">Categories</h2>
                  <p className="text-sm text-muted-foreground">
                    Rounds and heats are generated from competitor count.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={addCategory}>
                  Add Category
                </Button>
              </div>

              <div className="mt-5 flex flex-col gap-5">
                {categories.map((category, index) => {
                  const competitorCount = parseCompetitorNumbers(
                    category.competitorNumbersText,
                  ).length;
                  const danceCount = parseDances(category.dancesText).length;
                  const invalidTokens = getInvalidCompetitorTokens(
                    category.competitorNumbersText,
                  );
                  const roundCount = getCompetitionRounds(competitorCount)
                    .length;
                  return (
                    <div
                      key={index}
                      className="rounded-lg border border-border bg-white px-4 py-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="font-semibold">Category {index + 1}</h3>
                        <div className="flex items-center gap-2">
                          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {competitorCount} competitors
                          </span>
                          <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                            {roundCount} rounds
                          </span>
                          <Button
                            type="button"
                            variant="outline"
                            disabled={categories.length <= 1}
                            onClick={() =>
                              setCategories((prev) =>
                                prev.filter(
                                  (_, categoryIndex) => categoryIndex !== index,
                                ),
                              )
                            }
                          >
                            Remove
                          </Button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-4 sm:grid-cols-2">
                        <label className="flex flex-col gap-2 text-sm font-medium">
                          Name
                          <input
                            required
                            value={category.name}
                            onChange={(event) =>
                              updateCategory(index, {
                                name: event.target.value,
                              })
                            }
                            placeholder="Latin Adults"
                            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                          Age Group
                          <input
                            required
                            value={category.ageGroup}
                            onChange={(event) =>
                              updateCategory(index, {
                                ageGroup: event.target.value,
                              })
                            }
                            placeholder="Adults"
                            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                          Discipline
                          <select
                            value={category.discipline}
                            onChange={(event) =>
                              updateCategory(index, {
                                discipline: event.target.value as
                                  | "latin"
                                  | "standard",
                              })
                            }
                            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                          >
                            <option value="latin">Latin</option>
                            <option value="standard">Standard</option>
                          </select>
                        </label>
                        <label className="flex flex-col gap-2 text-sm font-medium">
                          Max Finalists
                          <input
                            type="number"
                            min="1"
                            value={category.maxFinalists}
                            onChange={(event) =>
                              updateCategory(index, {
                                maxFinalists: event.target.value,
                              })
                            }
                            className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>
                      </div>

                      <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
                        Dances
                        <input
                          required
                          value={category.dancesText}
                          onChange={(event) =>
                            updateCategory(index, {
                              dancesText: event.target.value,
                            })
                          }
                          placeholder="Waltz, Tango, Quickstep"
                          className="rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                        />
                        <span className="text-xs text-muted-foreground">
                          {danceCount} dances parsed.
                        </span>
                      </label>

                      <label className="mt-4 flex flex-col gap-2 text-sm font-medium">
                        Competitor Numbers
                        <textarea
                          required
                          rows={3}
                          value={category.competitorNumbersText}
                          onChange={(event) =>
                            updateCategory(index, {
                              competitorNumbersText: event.target.value,
                            })
                          }
                          placeholder="101-112, 118, 122"
                          className="resize-none rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                        />
                        <span className="text-xs text-muted-foreground">
                          Use commas, spaces, new lines, or ranges like 101-112.
                        </span>
                        {invalidTokens.length > 0 ? (
                          <span className="text-xs font-medium text-red-600">
                            Invalid entries: {invalidTokens.join(", ")}
                          </span>
                        ) : null}
                      </label>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {message ? (
            <div
              className={`rounded-lg border px-4 py-3 text-sm font-medium ${
                message.type === "success"
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}
            >
              {message.text}
            </div>
          ) : null}

          {showValidation && !validation.isValid ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              <p className="font-semibold">Setup checks</p>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {validation.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button asChild type="button" variant="outline">
              <Link href="/admin">Cancel</Link>
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Creating..." : "Create Competition"}
            </Button>
          </div>
        </form>

        <aside className="h-fit rounded-lg border border-border bg-white/90 p-5 text-sm shadow-sm backdrop-blur-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Setup Summary
          </p>
          <dl className="mt-4 grid grid-cols-2 gap-3">
            <div>
              <dt className="text-muted-foreground">Judges</dt>
              <dd className="text-2xl font-semibold">{summary.judges}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Categories</dt>
              <dd className="text-2xl font-semibold">{summary.categories}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Competitors</dt>
              <dd className="text-2xl font-semibold">{summary.competitors}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Dances</dt>
              <dd className="text-2xl font-semibold">{summary.dances}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rounds</dt>
              <dd className="text-2xl font-semibold">{summary.rounds}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Checks</dt>
              <dd
                className={`text-2xl font-semibold ${
                  validation.isValid ? "text-emerald-600" : "text-red-600"
                }`}
              >
                {validation.isValid ? "OK" : validation.errors.length}
              </dd>
            </div>
          </dl>
          {!validation.isValid ? (
            <p className="mt-4 text-red-600">{validation.errors[0]}</p>
          ) : null}
          <p className="mt-5 text-muted-foreground">
            After creation, the first round in each category is active and ready
            for judges.
          </p>
        </aside>
      </main>
    </div>
  );
}
