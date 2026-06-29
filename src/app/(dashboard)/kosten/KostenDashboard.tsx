"use client";

import Link from "next/link";
import {
  Wallet,
  Images,
  FileText,
  Receipt,
  TrendingUp,
  Settings,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { CostSummary } from "@/lib/ai-cost";

type Props = {
  summary: CostSummary;
  rate: number; // USD → EUR
  blotatoEur: number; // monatlicher Fixbetrag
};

const fmtEur = (n: number) =>
  n.toLocaleString("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtUsd = (n: number) =>
  "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function KostenDashboard({ summary, rate, blotatoEur }: Props) {
  const cur = summary.current;
  const aiEur = cur.aiUsd * rate;
  const totalEur = aiEur + blotatoEur;
  const totalUsd = cur.aiUsd + (rate > 0 ? blotatoEur / rate : 0);
  const monthLabel = `${cur.label} ${cur.key.slice(0, 4)}`;

  const maxAi = Math.max(0.0001, ...summary.months.map((m) => m.aiUsd));
  const maxOp = Math.max(0.0001, ...summary.byOperation.map((o) => o.usd));

  return (
    <div className="flex-1 bg-background pb-24 md:pb-6">
      {/* Hero */}
      <div
        className="px-4 pt-5 pb-6 md:px-6"
        style={{ background: "linear-gradient(135deg, var(--brand-primary) 0%, #1a4a2a 100%)" }}
      >
        <div className="flex items-center gap-2 mb-3">
          <Wallet className="w-4 h-4 text-white/70" />
          <span className="text-white/70 text-xs font-medium uppercase tracking-wider">
            Kosten
          </span>
          {summary.hasEstimated && (
            <span className="ml-auto text-[10px] font-semibold px-2 py-0.5 rounded-full bg-white/15 text-white/80">
              ≈ teils geschätzt
            </span>
          )}
        </div>
        <div className="text-white/60 text-[11px] mb-1">
          Diesen Monat gesamt · {monthLabel}
        </div>
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-white text-3xl font-bold tabular-nums">{fmtEur(totalEur)}</span>
          <span className="text-white/55 text-sm tabular-nums">{fmtUsd(totalUsd)}</span>
        </div>
        <div className="text-white/55 text-[11px] mt-1.5">
          davon KI {fmtEur(aiEur)} · Blotato-Abo {fmtEur(blotatoEur)}
        </div>
      </div>

      <div className="px-3 md:px-5 space-y-4 mt-4">
        {/* Aufteilung des aktuellen Monats */}
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          <CostCard
            icon={Images}
            label="KI-Bilder"
            eur={cur.imageUsd * rate}
            usd={cur.imageUsd}
            sub={`${cur.imageCount} Bild${cur.imageCount === 1 ? "" : "er"} diesen Monat`}
          />
          <CostCard
            icon={FileText}
            label="KI-Texte"
            eur={cur.textUsd * rate}
            usd={cur.textUsd}
            sub="Briefing · Caption · Prüfung"
          />
          <BlotatoCard eur={blotatoEur} />
        </div>

        {/* Verlauf */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="w-4 h-4" style={{ color: "var(--brand-primary)" }} />
            <h2 className="font-semibold text-sm">Verlauf — KI-Kosten</h2>
            <span className="ml-auto text-[11px] text-muted-foreground">letzte 6 Monate</span>
          </div>
          <div className="flex items-end gap-2 h-32">
            {summary.months.map((m) => {
              const h = Math.max(2, Math.round((m.aiUsd / maxAi) * 100));
              const isCur = m.key === cur.key;
              return (
                <div
                  key={m.key}
                  className="flex-1 flex flex-col items-center justify-end gap-1 h-full"
                >
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    {m.aiUsd > 0 ? fmtEur(m.aiUsd * rate) : "—"}
                  </span>
                  <div
                    className="w-full rounded-t-md transition-all"
                    style={{
                      height: `${h}%`,
                      background: "var(--brand-primary)",
                      opacity: isCur ? 1 : 0.45,
                    }}
                    title={`${m.label}: ${fmtEur(m.aiUsd * rate)}${m.estimated ? " (teils geschätzt)" : ""}`}
                  />
                  <span
                    className={cn(
                      "text-[10px]",
                      isCur ? "font-semibold text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {m.label}
                  </span>
                </div>
              );
            })}
          </div>
          {blotatoEur > 0 && (
            <p className="text-[11px] text-muted-foreground mt-3">
              Hinzu kommt das Blotato-Abo mit fix {fmtEur(blotatoEur)}/Monat.
            </p>
          )}
        </Card>

        {/* Aufschlüsselung nach Art */}
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-4">
            <Receipt className="w-4 h-4" style={{ color: "var(--brand-primary)" }} />
            <h2 className="font-semibold text-sm">Diesen Monat nach Art</h2>
          </div>
          {summary.byOperation.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine KI-Aktivität in diesem Monat erfasst.
            </p>
          ) : (
            <div className="space-y-2.5">
              {summary.byOperation.map((o) => {
                const pct = Math.round((o.usd / maxOp) * 100);
                return (
                  <div key={o.operation} className="flex items-center gap-2">
                    <div className="w-32 text-xs truncate">
                      {o.label}{" "}
                      <span className="text-muted-foreground tabular-nums">×{o.count}</span>
                    </div>
                    <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${Math.max(2, pct)}%`, background: "var(--brand-primary)" }}
                      />
                    </div>
                    <div className="w-24 text-right text-xs tabular-nums">
                      <span className="font-medium">{fmtEur(o.usd * rate)}</span>
                      <span className="text-muted-foreground ml-1">{fmtUsd(o.usd)}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>

        {/* Fußnote */}
        <p className="text-[11px] text-center text-muted-foreground pb-2 px-4 leading-relaxed">
          Berechnet aus der OpenAI-Token-Nutzung · Kurs 1&nbsp;$&nbsp;=&nbsp;{rate.toLocaleString("de-DE")}&nbsp;€
          {" · "}
          {summary.totalImages} Bilder in den letzten 6&nbsp;Monaten
          {summary.hasEstimated && (
            <>
              {' · „≈ geschätzt“: Altdaten ohne Token-Messung, pauschal angesetzt.'}
            </>
          )}
          <br />
          <Link
            href="/einstellungen"
            className="inline-flex items-center gap-1 mt-1.5 hover:text-foreground transition-colors"
          >
            <Settings className="w-3 h-3" />
            Blotato-Betrag &amp; Wechselkurs in den Einstellungen anpassen
          </Link>
        </p>
      </div>
    </div>
  );
}

function CostCard({
  icon: Icon,
  label,
  eur,
  usd,
  sub,
}: {
  icon: typeof Wallet;
  label: string;
  eur: number;
  usd: number;
  sub: string;
}) {
  return (
    <Card className="p-3.5 gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <div className="w-7 h-7 rounded-xl flex items-center justify-center bg-muted">
          <Icon className="w-3.5 h-3.5" style={{ color: "var(--brand-primary)" }} />
        </div>
      </div>
      <div className="flex items-baseline gap-1.5 flex-wrap">
        <span className="text-xl font-bold tabular-nums">{fmtEur(eur)}</span>
        <span className="text-[11px] text-muted-foreground tabular-nums">{fmtUsd(usd)}</span>
      </div>
      <div className="text-[11px] text-muted-foreground">{sub}</div>
    </Card>
  );
}

function BlotatoCard({ eur }: { eur: number }) {
  return (
    <Card className="p-3.5 gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Blotato-Abo
        </span>
        <div className="w-7 h-7 rounded-xl flex items-center justify-center bg-muted">
          <Wallet className="w-3.5 h-3.5" style={{ color: "var(--brand-primary)" }} />
        </div>
      </div>
      {eur > 0 ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-xl font-bold tabular-nums">{fmtEur(eur)}</span>
          </div>
          <div className="text-[11px] text-muted-foreground">fixer Monatsbeitrag</div>
        </>
      ) : (
        <>
          <div className="text-xl font-bold text-muted-foreground/50">—</div>
          <Link
            href="/einstellungen"
            className="text-[11px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Betrag hinterlegen
          </Link>
        </>
      )}
    </Card>
  );
}
