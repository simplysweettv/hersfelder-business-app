import { SectionTabs } from "@/components/layout/SectionTabs";

const TABS = [
  { label: "Wochenplan", href: "/social/wochenplan" },
  { label: "Freigaben", href: "/social/freigaben" },
  { label: "Generator", href: "/social/generator" },
  { label: "Kalender", href: "/social/kalender" },
];

export default function SocialLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <SectionTabs tabs={TABS} />
      {children}
    </>
  );
}
