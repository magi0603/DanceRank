import { Card, CardContent } from "@/components/ui/card";
import { getAdminResultsCategories } from "@/lib/admin-results";

export default async function AdminResultsPage() {
  const categories = await getAdminResultsCategories();

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,oklch(0.98_0.05_160),transparent_60%),radial-gradient(circle_at_bottom,oklch(0.97_0.06_95),transparent_55%)] px-6 pb-12 pt-8 text-foreground">
      <header className="mx-auto flex w-full max-w-6xl flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Admin Dashboard
        </p>
        <h1 className="text-3xl font-semibold tracking-tight">
          Final Results
        </h1>
        <p className="text-sm text-muted-foreground">
          Aggregated placements across all judges.
        </p>
      </header>

      <main className="mx-auto mt-8 flex w-full max-w-6xl flex-col gap-6">
        {categories.length === 0 ? (
          <Card className="bg-white/90">
            <CardContent className="px-6">
              <p className="text-sm text-muted-foreground">
                No completed categories yet.
              </p>
            </CardContent>
          </Card>
        ) : null}

        {categories.map((category) => {
          return (
            <Card key={category.id} className="bg-white/90">
              <CardContent className="px-6">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
                  <div>
                    <h2 className="text-lg font-semibold">{category.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      Final round results (lower total rank wins)
                    </p>
                  </div>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                    {category.rows.length} finalists
                  </span>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="text-xs uppercase text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-4">Place</th>
                        <th className="py-2 pr-4">Competitor</th>
                        <th className="py-2 pr-4">Total</th>
                        <th className="py-2 pr-4">Firsts</th>
                        {category.judges.map((judge) => (
                          <th key={judge} className="py-2 pr-4">
                            {judge}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {category.rows.map((row, index) => (
                        <tr key={row.competitorId}>
                          <td className="py-3 pr-4 font-semibold">
                            {index + 1}
                          </td>
                          <td className="py-3 pr-4">#{row.competitorNumber}</td>
                          <td className="py-3 pr-4">{row.totalRank}</td>
                          <td className="py-3 pr-4">{row.firstPlaces}</td>
                          {category.judges.map((judge) => (
                            <td key={judge} className="py-3 pr-4">
                              {row.judgeRanks[judge] ?? "—"}
                            </td>
                          ))}
                        </tr>
                      ))}
                      {category.rows.length === 0 ? (
                        <tr>
                          <td
                            className="py-6 text-center text-muted-foreground"
                            colSpan={4 + category.judges.length}
                          >
                            No final rankings submitted yet.
                          </td>
                        </tr>
                      ) : null}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </main>
    </div>
  );
}
