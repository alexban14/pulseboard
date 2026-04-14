import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const { tenant, user } = useAuth();

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <h1 className="text-2xl font-bold tracking-tight">
        Welcome to {tenant?.name ?? "Pulseboard"}
      </h1>
      <p className="mt-2 text-gray-500">
        Signed in as {user?.email}. Connect a data source to get started.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <QuickActionCard
          title="Connect a Source"
          description="Set up a database, warehouse, or API connection."
        />
        <QuickActionCard
          title="Create a Dashboard"
          description="Build visualizations from your connected data."
        />
        <QuickActionCard
          title="Write a Query"
          description="Explore data with the SQL or visual query editor."
        />
      </div>
    </div>
  );
}

function QuickActionCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      <p className="mt-1 text-sm text-gray-500">{description}</p>
    </div>
  );
}
