import { GeneratorForm } from "@/components/social/GeneratorForm";

export default function GeneratorPage() {
  return (
    <div className="flex-1 p-5 bg-background">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Post-Generator</h1>
        <p className="text-sm text-muted-foreground">
          KI erstellt Bild + Caption nach deinem Briefing.
        </p>
      </div>
      <GeneratorForm />
    </div>
  );
}
