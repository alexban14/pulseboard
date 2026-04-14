const styles: Record<string, string> = {
  healthy: "bg-green-50 text-green-700 ring-green-600/20",
  pending: "bg-yellow-50 text-yellow-700 ring-yellow-600/20",
  error: "bg-red-50 text-red-700 ring-red-600/20",
  degraded: "bg-orange-50 text-orange-700 ring-orange-600/20",
};

export function Badge({ status }: { status: string }) {
  const cls = styles[status] ?? "bg-gray-50 text-gray-700 ring-gray-600/20";
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${cls}`}
    >
      {status}
    </span>
  );
}
