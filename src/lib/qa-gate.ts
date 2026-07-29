import OpenAI from "openai";
import { getOpenAIClient } from "./openai";
import { recordAiUsage } from "./ai-cost";

/**
 * Zwei-Agenten-Freigabe (ersetzt den alten Einzel-TÜV):
 *
 * 1) QA-AGENT — strenger Logik-/Fehler-Prüfer: Passt das Bild EXAKT zum Text
 *    (Motiv-Abgleich!), stimmen Grammatik/Rechtschreibung aller Texte, keine
 *    verbotenen Claims/Waffen, keine Render-/KI-Artefakte?
 * 2) SOCIAL-MEDIA-AGENT — Kreativ-/Zielgruppen-Prüfer: Ist der Post ein
 *    Scroll-Stopper? Poster-Qualität? Würde ein Schützenvereins-Account das
 *    stolz posten?
 *
 * Nur wenn BEIDE freigeben, gilt der Post als bestanden. Sonst liefert das
 * Gate konkretes Feedback + den Fehlerbereich (Bild/Text), damit die Pipeline
 * gezielt neu generieren kann.
 */

export type QaVerdict = {
  ok: boolean;
  problems: string[];
  /** Wo liegt der Fehler? Steuert die Neu-Generierung. */
  failArea: "image" | "text" | "both" | null;
};

export type SocialVerdict = {
  wouldPost: boolean;
  score: number; // 1-10
  reasons: string[];
};

export type GateResult = {
  pass: boolean;
  qa: QaVerdict;
  social: SocialVerdict;
  /** Kombinierter Score für posts.quality_score (0-10) */
  score: number;
  /** Kombinierte Notizen für posts.quality_notes */
  notes: string[];
  /** Für gezielte Regeneration */
  failArea: "image" | "text" | "both" | null;
};

const SOCIAL_PASS_SCORE = 7;

function parseJson<T>(raw: string | null | undefined): Partial<T> {
  try {
    return JSON.parse(raw ?? "{}") as Partial<T>;
  } catch {
    return {};
  }
}

export async function runQaGate(opts: {
  apiKey?: string;
  /** Fertiges Composite als JPEG-Buffer (wird als Data-URL geprüft — kein Upload nötig) */
  jpeg: Buffer;
  /** Alle im Bild gerenderten Textzeilen (damit der Prüfer nicht OCR raten muss) */
  renderedText: string;
  /** Das konkrete Motiv, das Bild UND Text tragen sollen */
  motif: string;
  caption: string;
  kind: string; // plakat | foto | typo | karussell-cover …
  lane: "emotional" | "product";
}): Promise<GateResult> {
  const client = getOpenAIClient(opts.apiKey);
  const imageUrl = `data:image/jpeg;base64,${opts.jpeg.toString("base64")}`;

  const qaPrompt = `Du bist der QA-AGENT für Social-Media-Posts von "Hersfelder Schützenbekleidung". Du prüfst GNADENLOS auf Fehler — ein durchgewunkener Fehler landet öffentlich im Feed.

POST-TYP: ${opts.kind} (Säule: ${opts.lane})
GEPLANTES MOTIV (Bild und Text müssen GENAU dazu passen): ${opts.motif}
IM BILD GERENDERTER TEXT: ${opts.renderedText || "(bewusst kein Text im Bild)"}
CAPTION (gekürzt): ${opts.caption.slice(0, 600)}

PRÜFE (jede Frage einzeln beantworten, bevor du urteilst):
1. MOTIV-LOGIK: Zeigt das BILD exakt das Motiv, von dem der TEXT spricht? (Beispiel für DURCHFALLEN: Text sagt "diese beiden Westen", Bild zeigt Sakko + Weste. Text nennt eine Zahl von Personen/Objekten, Bild zeigt andere Zahl.)
2. SPRACHE: Ist JEDER gerenderte Text und die Caption grammatikalisch korrekt, vollständig (kein abgebrochener Satz!), richtig geschrieben, Ansprache "ihr/euch" (nie "Sie")?
3. COMPLIANCE: Keine Waffen im Bild, niemand zielt/schießt. Keine Goldlitzen/Epauletten/Fantasie-/Militär-Uniformen. Kein "maßgeschneidert/handgeschneidert/atmungsaktiv/klimaregulierend/Funktionsstoff". Kein Schieß-Bezug im Text ("Schuss", "Treffer", "zielen"). Keine nationalistisch klingenden Parolen.
4. HANDWERK: Keine entstellten Gesichter/Hände, keine fremde lesbare Schrift/Etiketten im FOTO (das gerenderte Marken-Overlay ist ok), Text gut lesbar mit genug Kontrast, nichts Wichtiges abgeschnitten.

Antworte NUR als JSON:
{"ok": true/false, "problems": ["konkreter Mangel …"], "failArea": "image"|"text"|"both"|null}
failArea: "image" wenn das Foto das Problem ist, "text" wenn Text/Caption, "both" bei beidem, null wenn ok.`;

  const socialPrompt = `Du bist der SOCIAL-MEDIA-AGENT von "Hersfelder Schützenbekleidung" — erfahrener Social-Media-Manager UND Mitglied der Zielgruppe (deutsche Schützenvereine). Du entscheidest, ob dieser Post gut genug ist, um ihn STOLZ zu posten.

POST-TYP: ${opts.kind} (Säule: ${opts.lane})
IM BILD GERENDERTER TEXT: ${opts.renderedText || "(bewusst kein Text — reines Foto)"}
CAPTION (gekürzt): ${opts.caption.slice(0, 400)}

BEWERTE STRENG (Note 1-10):
- SCROLL-STOPP: Bleibt man beim Scrollen hängen? Wirkt es wie ein hochwertiges Poster/Plakat — oder wie generische KI-Werbung?
- EMOTION/IDEE: Steckt eine echte, konkrete Idee drin, die Vereinsmenschen fühlen?
- MARKE: Dunkelgrün/Creme/Wappen-Look, würdevoll, authentisch — passt es zu einem Traditions-Ausstatter?
- KLARHEIT: Versteht man in 2 Sekunden, worum es geht?
Unter 7 = nicht posten. 7 = solide. 8-9 = stark. 10 = herausragend.

Antworte NUR als JSON:
{"wouldPost": true/false, "score": 1-10, "reasons": ["kurzer Grund …"]}`;

  const runCheck = async (system: string): Promise<string> => {
    const res = await client.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "Antworte ausschließlich mit validem JSON ohne Markdown." },
        {
          role: "user",
          content: [
            { type: "text", text: system },
            { type: "image_url", image_url: { url: imageUrl, detail: "high" } },
          ] as OpenAI.Chat.Completions.ChatCompletionContentPart[],
        },
      ],
      temperature: 0.2,
      max_tokens: 400,
      response_format: { type: "json_object" },
    });
    await recordAiUsage({ operation: "review", model: "gpt-4o-mini", usage: res.usage });
    return res.choices?.[0]?.message?.content ?? "{}";
  };

  const [qaRaw, socialRaw] = await Promise.all([runCheck(qaPrompt), runCheck(socialPrompt)]);

  const qaParsed = parseJson<QaVerdict>(qaRaw);
  const socialParsed = parseJson<SocialVerdict>(socialRaw);

  const qa: QaVerdict = {
    ok: qaParsed.ok === true,
    problems: Array.isArray(qaParsed.problems) ? qaParsed.problems.map(String).slice(0, 6) : [],
    failArea:
      qaParsed.failArea === "image" || qaParsed.failArea === "text" || qaParsed.failArea === "both"
        ? qaParsed.failArea
        : qaParsed.ok === true
          ? null
          : "both",
  };
  const social: SocialVerdict = {
    wouldPost: socialParsed.wouldPost === true,
    score: typeof socialParsed.score === "number" ? Math.round(socialParsed.score) : 5,
    reasons: Array.isArray(socialParsed.reasons) ? socialParsed.reasons.map(String).slice(0, 4) : [],
  };

  const pass = qa.ok && social.wouldPost && social.score >= SOCIAL_PASS_SCORE;
  const notes = [
    ...qa.problems.map((p) => `QA: ${p}`),
    ...(!social.wouldPost || social.score < SOCIAL_PASS_SCORE
      ? social.reasons.map((r) => `Social: ${r}`)
      : []),
  ];

  return {
    pass,
    qa,
    social,
    score: qa.ok ? social.score : Math.min(social.score, 4),
    notes,
    // Social-Durchfall ohne QA-Fehler → kreatives Problem → kompletter Neuanlauf
    failArea: qa.failArea ?? (pass ? null : "both"),
  };
}
