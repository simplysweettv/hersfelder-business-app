import { SectionTabs } from "@/components/layout/SectionTabs";

const TABS = [
  { label: "Freigaben", href: "/social/freigaben" },
  { label: "Kalender", href: "/social/kalender" },
  { label: "Analytics", href: "/social/analytics" },
  { label: "Generator", href: "/social/generator" },
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
