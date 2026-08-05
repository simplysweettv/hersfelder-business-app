import { createClient } from "@/lib/supabase/server";
import { listMediaAssets, type MediaAsset } from "@/lib/media-library";
import { MediaLibrary } from "@/components/social/MediaLibrary";

export const dynamic = "force-dynamic";

export default async function BilderPage() {
  const supabase = await createClient();
  let assets: MediaAsset[] = [];
  let error: string | null = null;
  try {
    assets = await listMediaAssets(supabase);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  return (
    <div className="flex-1 p-3 md:p-5 bg-background">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Bildbibliothek</h1>
        <p className="text-sm text-muted-foreground">
          Echte Fotos aus dem Vereinsleben und vom Sortiment — sie werden in den
          Posts verwendet und dienen der KI als Vorlage für den Look.
        </p>
      </div>
      {error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Bibliothek konnte nicht geladen werden: {error}
        </p>
      ) : (
        <MediaLibrary initialAssets={assets} />
      )}
    </div>
  );
}
