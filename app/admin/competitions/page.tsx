import Form from "next/form";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { connectMongoDB } from "@/lib/mongoose";
import {
  CategoryModel,
  CompetitionModel,
  CompetitorModel,
  JudgeModel,
  RoundModel,
} from "@/models";

type CountRow = {
  _id: unknown;
  count: number;
};

function formatDate(value: Date | null | undefined) {
  if (!value) return "No date";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
  }).format(value);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

type CompetitionsPageProps = {
  searchParams: Promise<{ q?: string | string[] }>;
};

export default async function CompetitionsPage({
  searchParams,
}: CompetitionsPageProps) {
  await connectMongoDB();

  const rawQuery = (await searchParams).q;
  const query = typeof rawQuery === "string" ? rawQuery.trim() : "";
  const competitionFilter = query
    ? {
        $or: [
          { name: { $regex: escapeRegExp(query), $options: "i" } },
          { location: { $regex: escapeRegExp(query), $options: "i" } },
          { organizer: { $regex: escapeRegExp(query), $options: "i" } },
          { status: { $regex: `^${escapeRegExp(query)}$`, $options: "i" } },
        ],
      }
    : {};

  const [
    competitions,
    categoryCounts,
    judgeCounts,
    competitorCounts,
    roundCounts,
  ] = await Promise.all([
    CompetitionModel.find(competitionFilter).sort({ createdAt: -1 }).lean(),
    CategoryModel.aggregate<CountRow>([
      { $group: { _id: "$competition", count: { $sum: 1 } } },
    ]),
    JudgeModel.aggregate<CountRow>([
      { $group: { _id: "$competition", count: { $sum: 1 } } },
    ]),
    CompetitorModel.aggregate<CountRow>([
      { $group: { _id: "$competition", count: { $sum: 1 } } },
    ]),
    RoundModel.aggregate<CountRow>([
      { $group: { _id: "$competition", count: { $sum: 1 } } },
    ]),
  ]);

  const categoriesByCompetition = new Map(
    categoryCounts.map((row) => [String(row._id), row.count]),
  );
  const judgesByCompetition = new Map(
    judgeCounts.map((row) => [String(row._id), row.count]),
  );
  const competitorsByCompetition = new Map(
    competitorCounts.map((row) => [String(row._id), row.count]),
  );
  const roundsByCompetition = new Map(
    roundCounts.map((row) => [String(row._id), row.count]),
  );

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,oklch(0.98_0.05_160),transparent_60%),radial-gradient(circle_at_bottom,oklch(0.97_0.06_95),transparent_55%)] px-4 pb-12 pt-8 text-foreground sm:px-6 lg:px-10">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Admin Setup
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">
              Competitions
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Pick an event to manage categories, judges, rounds, and links.
            </p>
          </div>
          <Button asChild>
            <Link href="/admin/competitions/new">New Competition</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto mt-8 flex w-full max-w-6xl flex-col gap-5">
        <Card className="bg-white/90 backdrop-blur-sm">
          <CardContent className="px-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">Find Competition</h2>
                <p className="text-sm text-muted-foreground">
                  Search by name, organizer, location, or status.
                </p>
              </div>
              <Form action="" className="flex w-full max-w-xl flex-col gap-3 sm:flex-row">
                <input
                  name="q"
                  defaultValue={query}
                  placeholder="Search competitions"
                  className="h-10 flex-1 rounded-lg border border-border bg-white px-3 text-sm outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
                />
                <div className="flex gap-2">
                  <Button type="submit">Search</Button>
                  {query ? (
                    <Button asChild variant="outline">
                      <Link href="/admin/competitions">Clear</Link>
                    </Button>
                  ) : null}
                </div>
              </Form>
            </div>
          </CardContent>
        </Card>

        {competitions.length === 0 ? (
          <Card className="bg-white/90 backdrop-blur-sm">
            <CardContent className="px-6">
              <p className="text-sm text-muted-foreground">
                {query
                  ? `No competitions match "${query}".`
                  : "No competitions yet."}
              </p>
              <Button asChild className="mt-4">
                <Link href="/admin/competitions/new">
                  {query ? "Create Competition" : "Create First Competition"}
                </Link>
              </Button>
            </CardContent>
          </Card>
        ) : null}

        {competitions.map((competition) => {
          const id = String(competition._id);
          return (
            <Card key={id} className="bg-white/90 backdrop-blur-sm">
              <CardContent className="px-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold">
                        {competition.name}
                      </h2>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                        {competition.status}
                      </span>
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">
                      {formatDate(competition.date)} ·{" "}
                      {competition.location || "No location"}
                    </p>
                    {competition.organizer ? (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {competition.organizer}
                      </p>
                    ) : null}
                  </div>
                  <Button asChild>
                    <Link href={`/admin/competitions/${id}`}>
                      Open Competition
                    </Link>
                  </Button>
                </div>

                <dl className="mt-5 grid gap-3 sm:grid-cols-4">
                  <div className="rounded-lg border border-border bg-white px-4 py-3">
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Judges
                    </dt>
                    <dd className="mt-2 text-2xl font-semibold">
                      {judgesByCompetition.get(id) ?? 0}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-border bg-white px-4 py-3">
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Categories
                    </dt>
                    <dd className="mt-2 text-2xl font-semibold">
                      {categoriesByCompetition.get(id) ?? 0}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-border bg-white px-4 py-3">
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Competitors
                    </dt>
                    <dd className="mt-2 text-2xl font-semibold">
                      {competitorsByCompetition.get(id) ?? 0}
                    </dd>
                  </div>
                  <div className="rounded-lg border border-border bg-white px-4 py-3">
                    <dt className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      Rounds
                    </dt>
                    <dd className="mt-2 text-2xl font-semibold">
                      {roundsByCompetition.get(id) ?? 0}
                    </dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
