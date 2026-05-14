import { cn } from "@/lib/utils";
import { STATUS_LABEL, type PostStatus } from "@/types";

const STATUS_STYLES: Record<PostStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-emerald-100 text-emerald-800",
  scheduled: "bg-blue-100 text-blue-800",
  published: "bg-emerald-600 text-white",
  failed: "bg-red-100 text-red-800",
};

export function StatusBadge({ status }: { status: PostStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-[10px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded",
        STATUS_STYLES[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}
