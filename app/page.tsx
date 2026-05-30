import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,oklch(0.98_0.05_160),transparent_60%),radial-gradient(circle_at_bottom,oklch(0.97_0.06_95),transparent_55%)] px-4 py-10 text-foreground">
      <Card className="w-full max-w-xl bg-white/90 backdrop-blur-sm">
        <CardContent className="px-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            DanceRank
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Competition judging
          </h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            Admins manage competitions from the control area. Judges should use
            the private link provided for their competition.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button asChild>
              <Link href="/admin">Admin Login</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
