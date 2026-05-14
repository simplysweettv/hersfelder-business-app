import OpenAI from "openai";

export function getOpenAIClient(apiKey?: string) {
  const key = apiKey || process.env.OPENAI_API_KEY;
  if (!key) {
    throw new Error(
      "OPENAI_API_KEY ist nicht gesetzt (weder in env noch in settings).",
    );
  }
  return new OpenAI({ apiKey: key });
}

const DEFAULT_BRAND_STYLE = `Hersfelder Schützenbekleidung: dunkelgrüne Uniformen, Vereinsleben, Tradition, Gemeinschaft. Bold typography auf dunklem Hintergrund, professionell, authentisch.`;

export function buildImagePrompt(input: {
  brandStyle?: string | null;
  theme: string;
  product: string;
  message: string;
}) {
  const brand = (input.brandStyle ?? DEFAULT_BRAND_STYLE).trim();
  return [
    brand,
    `Erstelle ein Social-Media-Bild für: ${input.theme}.`,
    `Produkt: ${input.product}.`,
    `Botschaft: ${input.message}.`,
    `Stil: Schützenbekleidung, dunkelgrüne Uniformen, Vereinsleben, bold typography auf dunklem Hintergrund, professionell.`,
    `Format: 1024x1024 (quadratisch).`,
  ].join("\n");
}

export function buildCaptionPrompt(input: {
  theme: string;
  product: string;
  message: string;
}) {
  return `Schreibe eine Instagram-Caption für Hersfelder Schützenbekleidung.
Thema: ${input.theme}
Produkt: ${input.product}
Botschaft: ${input.message}
Ton: Authentisch, gemeinschaftlich, traditionell aber modern.
Sprache: Deutsch.
Max 200 Zeichen, danach 5 relevante Hashtags. Website: schuetzen-ausstatter.de.
Antworte NUR mit der fertigen Caption (inkl. Hashtags), ohne Anführungszeichen.`;
}

export async function generateImage(opts: {
  apiKey?: string;
  prompt: string;
  size?: "1024x1024" | "1024x1536" | "1536x1024";
}) {
  const client = getOpenAIClient(opts.apiKey);
  const res = await client.images.generate({
    model: "gpt-image-1",
    prompt: opts.prompt,
    size: opts.size ?? "1024x1024",
    n: 1,
  });
  const item = res.data?.[0];
  if (!item) throw new Error("Kein Bild von OpenAI erhalten.");
  // gpt-image-1 returns b64_json by default
  return {
    b64: item.b64_json ?? null,
    url: item.url ?? null,
  };
}

export async function generateCaption(opts: {
  apiKey?: string;
  prompt: string;
}) {
  const client = getOpenAIClient(opts.apiKey);
  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "Du bist Social-Media-Texter für die Schützenbekleidungs-Marke Hersfelder.",
      },
      { role: "user", content: opts.prompt },
    ],
    temperature: 0.8,
    max_tokens: 400,
  });
  return res.choices?.[0]?.message?.content?.trim() ?? "";
}
