import OpenAI from "openai";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, "../public/facebook");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
if (!OPENAI_API_KEY) {
  console.error("OPENAI_API_KEY fehlt");
  process.exit(1);
}
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

async function generate(label, prompt, size) {
  console.log(`\n🎨 Generiere: ${label} (${size})...`);
  const res = await openai.images.generate({
    model: "gpt-image-1",
    prompt,
    size,
    n: 1,
    output_format: "jpeg",
    output_compression: 92,
  });
  const b64 = res.data?.[0]?.b64_json;
  if (!b64) throw new Error("Kein Bild erhalten");
  const filename = path.join(OUT_DIR, `${label}.jpg`);
  fs.writeFileSync(filename, Buffer.from(b64, "base64"));
  console.log(`✅ Gespeichert: ${filename}`);
  return filename;
}

// Facebook Cover — 1536x1024 (Querformat, nächste verfügbare Größe)
// Facebook-Titelbild empfohlen: 1640×624 — wir generieren 1536×1024 und
// schneiden dann in der Anleitung den oberen/unteren Rand mit Canva zu.
const COVER_PROMPT = `
Professional Facebook cover photo for "Hersfelder Schützenbekleidung" (schuetzen-ausstatter.de) — a German brand for Schützenverein uniforms.

Scene: A warm, cinematic wide-angle photo of a festive Schützenverein gathering.
In the center: a group of 4-6 people in elegant dark green Schützen uniforms are laughing together, arms around each other, captured in a candid, documentary-style moment. Golden afternoon sunlight fills the scene. Background: a blurred Schützenfest atmosphere — bunting, trees, a village square.

Composition: Wide landscape format. The left 30% of the image is slightly darker/more atmospheric to allow a profile picture overlay there. The main action is center-right. Natural depth of field.

Style: Warm, authentic, reportage photography — like a talented friend took this at the festival. NOT a posed studio shot. Cinematic color grading: warm golden tones, deep greens, soft shadows.

STRICT RULES:
- NO weapons of any kind (no rifles, no pistols)
- NO political symbols, no military iconography
- NO logos or text in the image
- NO alcohol prominently displayed
- Uniforms are dark green, traditional German Schützenverein style — elegant and proud

Mood: Community, joy, belonging, tradition — the best feeling of being part of something bigger.
`;

// Facebook Profil-Hintergrundbild / Zusatz-Post-Bild (quadratisch 1024×1024)
// Kein Ersatz fürs Logo — sondern ein Lifestyle-Bild für den ersten Highlight-Post
const LIFESTYLE_PROMPT = `
Square lifestyle photo (1:1) for "Hersfelder Schützenbekleidung" Instagram/Facebook — elegant and warm.

Scene: Two or three people in beautiful dark green traditional Schützen uniforms stand together on a sunlit village square. They are smiling genuinely — not posing stiffly, but in a natural, candid moment. Golden hour light from the side. Background: slightly blurred historic German village architecture with warm bokeh.

Style: Premium lifestyle photography — like a high-end magazine editorial meets authentic community moment. Clean, bright, warm color tones. Sharp on the faces, soft background.

STRICT RULES:
- NO weapons of any kind
- NO political symbols
- NO logos or brand text in the image
- Uniforms: dark green, traditional, well-fitted — quality is visible but not the focus
- People: various ages, genuine smiles, diverse group (men and women)

Feel: Pride, warmth, belonging. The uniform is part of who they are — not just clothing.
`;

(async () => {
  try {
    await generate("facebook-cover", COVER_PROMPT, "1536x1024");
    await generate("lifestyle-quadrat", LIFESTYLE_PROMPT, "1024x1024");
    console.log("\n🎉 Alle Bilder fertig! Liegen in: public/facebook/");
  } catch (err) {
    console.error("Fehler:", err.message);
    process.exit(1);
  }
})();
