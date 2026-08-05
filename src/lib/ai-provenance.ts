/**
 * KI-Herkunft im Bild selbst (XMP / IPTC "Digital Source Type").
 *
 * Warum das nötig ist: Instagram, Facebook und LinkedIn haben KEIN API-Feld
 * für die KI-Kennzeichnung (anders als TikTok, siehe `isAiGenerated` in
 * publishers/blotato.ts). Diese Plattformen setzen ihr "KI-Info"-Label
 * automatisch, wenn sie im Bild die Standard-Metadaten C2PA oder IPTC finden.
 *
 * Unsere Bilder verlieren die Herkunft unterwegs: gpt-image-1 liefert zwar ein
 * gekennzeichnetes Foto, aber `renderPoster` baut daraus per Satori ein NEUES
 * Bild (Foto + Marken-Layout) — ohne jede Metadaten. Deshalb schreiben wir die
 * Kennzeichnung nach dem Rendern selbst wieder hinein.
 *
 * `trainedAlgorithmicMedia` ist der IPTC-Code für "von generativer KI erzeugt".
 */
const IPTC_DIGITAL_SOURCE_TYPE =
  "http://cv.iptc.org/newscodes/digitalsourcetype/trainedAlgorithmicMedia";

/**
 * Für Posts, deren Foto ein ECHTES Bild aus der Bildbibliothek ist: Das Motiv
 * stammt aus der Kamera, aber die gerenderten Plakat-Texte kommen aus der KI.
 * Der IPTC-Code dafür ist „compositeWithTrainedAlgorithmicMedia" — eine
 * Mischung aus echtem und KI-erzeugtem Material. Die Kennzeichnung bleibt also
 * bestehen, sie sagt nur die Wahrheit über das Foto.
 */
const IPTC_COMPOSITE_SOURCE_TYPE =
  "http://cv.iptc.org/newscodes/digitalsourcetype/compositeWithTrainedAlgorithmicMedia";

const xmp = (sourceType: string, description: string) => `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
    xmlns:Iptc4xmpExt="http://iptc.org/std/Iptc4xmpExt/2008-02-29/"
    xmlns:dc="http://purl.org/dc/elements/1.1/">
   <Iptc4xmpExt:DigitalSourceType>${sourceType}</Iptc4xmpExt:DigitalSourceType>
   <dc:description>
    <rdf:Alt>
     <rdf:li xml:lang="x-default">${description}</rdf:li>
    </rdf:Alt>
   </dc:description>
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;

export const AI_PROVENANCE_XMP = xmp(IPTC_DIGITAL_SOURCE_TYPE, "Mit KI erstellt (generative AI).");

/** Echtes Foto + KI-Texte im Layout. */
export const AI_COMPOSITE_PROVENANCE_XMP = xmp(
  IPTC_COMPOSITE_SOURCE_TYPE,
  "Echtes Foto, Gestaltung und Texte mit KI erstellt.",
);
