type FreshnessBadgeProps = {
  status: "actual" | "preliminary" | "estimate" | "forecast";
  period: string;
  releasedAt?: string;
};

export function FreshnessBadge({ status, period, releasedAt }: FreshnessBadgeProps) {
  const date = releasedAt ? new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(releasedAt)) : null;
  return (
    <span className={`freshness freshness--${status}`} title={date ? `Released ${date}` : "Release date unavailable"}>
      <span aria-hidden="true" className="freshness__dot" />
      {period} · {status}
    </span>
  );
}
