import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  useConnectorTypes,
  useTestConnection,
  useCreateConnector,
  type ConnectorType,
  type ConfigField,
  type TestConnectionResult,
} from "@/lib/hooks/use-connectors.js";
import { Spinner } from "@/components/ui/spinner.js";

export const Route = createFileRoute("/sources/new")({
  component: NewSourceWizard,
});

// Icon mapping — connector type id → emoji
const CONNECTOR_ICONS: Record<string, string> = {
  mysql: "🐬",
  postgresql: "🐘",
  csv: "📄",
  "rest-api": "🌐",
  webhook: "🔗",
  mongodb: "🍃",
};

function getIcon(typeId: string): string {
  return CONNECTOR_ICONS[typeId] ?? "📊";
}

type Step = "select-type" | "configure" | "review";

function NewSourceWizard() {
  const navigate = useNavigate();
  const { data: types, isLoading: typesLoading } = useConnectorTypes();

  const [step, setStep] = useState<Step>("select-type");
  const [selectedType, setSelectedType] = useState<ConnectorType | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [name, setName] = useState("");
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  const testMutation = useTestConnection();
  const createMutation = useCreateConnector();

  // Step 1 → 2: select type, reset all state
  function handleSelectType(ct: ConnectorType) {
    setSelectedType(ct);
    setConfig(buildDefaults(ct.configFields));
    setName("");
    setTestResult(null);
    testMutation.reset();
    createMutation.reset();
    setStep("configure");
  }

  // Go back: reset errors
  function handleBack() {
    if (step === "configure") {
      setTestResult(null);
      testMutation.reset();
      setStep("select-type");
    } else if (step === "review") {
      createMutation.reset();
      setStep("configure");
    } else {
      navigate({ to: "/sources" });
    }
  }

  function handleFieldChange(fieldKey: string, value: unknown) {
    setConfig((prev) => ({ ...prev, [fieldKey]: value }));
  }

  function handleTestInline() {
    if (!selectedType) return;
    setTestResult(null);
    testMutation.mutate(
      { connectorTypeId: selectedType.id, config },
      { onSuccess: (data) => setTestResult(data) },
    );
  }

  function handleCreate() {
    if (!selectedType) return;
    const connectorName = name.trim() || `My ${selectedType.name}`;
    createMutation.mutate(
      { connectorTypeId: selectedType.id, name: connectorName, config },
      {
        onSuccess: (data) => {
          navigate({
            to: "/sources/$sourceId",
            params: { sourceId: data.id },
          });
        },
      },
    );
  }

  const supportsTest = selectedType
    ? selectedType.category === "database" || selectedType.category === "api"
    : false;

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      <button
        type="button"
        onClick={handleBack}
        className="mb-4 text-xs font-medium text-gray-500 hover:text-gray-700"
      >
        &larr;{" "}
        {step === "select-type"
          ? "Sources"
          : step === "configure"
            ? "Select Type"
            : "Configure"}
      </button>

      <h1 className="text-2xl font-bold tracking-tight">Add Data Source</h1>

      <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
        <StepDot active={step === "select-type"} done={step !== "select-type"}>
          1. Select Type
        </StepDot>
        <span>&mdash;</span>
        <StepDot active={step === "configure"} done={step === "review"}>
          2. Configure
        </StepDot>
        <span>&mdash;</span>
        <StepDot active={step === "review"} done={false}>
          3. Review
        </StepDot>
      </div>

      {step === "select-type" && (
        <SelectTypeStep
          types={types ?? []}
          loading={typesLoading}
          onSelect={handleSelectType}
        />
      )}

      {step === "configure" && selectedType && (
        <ConfigureStep
          connectorType={selectedType}
          config={config}
          name={name}
          onNameChange={setName}
          onFieldChange={handleFieldChange}
          onTest={supportsTest ? handleTestInline : undefined}
          testPending={testMutation.isPending}
          testResult={testResult}
          testError={testMutation.isError ? (testMutation.error as Error).message : null}
          onNext={() => setStep("review")}
        />
      )}

      {step === "review" && selectedType && (
        <ReviewStep
          connectorType={selectedType}
          name={name.trim() || `My ${selectedType.name}`}
          config={config}
          onCreate={handleCreate}
          creating={createMutation.isPending}
          createError={
            createMutation.isError
              ? (createMutation.error as Error).message
              : null
          }
        />
      )}
    </div>
  );
}

function StepDot({
  active,
  done,
  children,
}: {
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={
        active
          ? "font-semibold text-gray-900"
          : done
            ? "text-gray-600"
            : "text-gray-400"
      }
    >
      {children}
    </span>
  );
}

function SelectTypeStep({
  types,
  loading,
  onSelect,
}: {
  types: ConnectorType[];
  loading: boolean;
  onSelect: (ct: ConnectorType) => void;
}) {
  if (loading) {
    return (
      <div className="mt-12 flex justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (types.length === 0) {
    return (
      <p className="mt-8 text-sm text-gray-500">
        No connector types available.
      </p>
    );
  }

  const categories = new Map<string, ConnectorType[]>();
  for (const t of types) {
    const cat = t.category || "Other";
    if (!categories.has(cat)) categories.set(cat, []);
    categories.get(cat)!.push(t);
  }

  return (
    <div className="mt-6 space-y-8">
      {Array.from(categories.entries()).map(([cat, items]) => (
        <div key={cat}>
          <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {cat}
          </h3>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((ct) => (
              <button
                key={ct.id}
                type="button"
                onClick={() => onSelect(ct)}
                className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-4 text-left shadow-sm transition-all hover:border-gray-400 hover:shadow-md"
              >
                <span className="text-2xl" aria-hidden="true">
                  {getIcon(ct.id)}
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">
                    {ct.name}
                  </p>
                  <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                    {ct.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function ConfigureStep({
  connectorType,
  config,
  name,
  onNameChange,
  onFieldChange,
  onTest,
  testPending,
  testResult,
  testError,
  onNext,
}: {
  connectorType: ConnectorType;
  config: Record<string, unknown>;
  name: string;
  onNameChange: (v: string) => void;
  onFieldChange: (field: string, value: unknown) => void;
  onTest?: () => void;
  testPending: boolean;
  testResult: TestConnectionResult | null;
  testError: string | null;
  onNext: () => void;
}) {
  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {getIcon(connectorType.id)}
        </span>
        <span className="text-sm font-semibold text-gray-900">
          {connectorType.name}
        </span>
      </div>

      <div>
        <label
          htmlFor="conn-name"
          className="block text-sm font-medium text-gray-700"
        >
          Connection Name
        </label>
        <input
          id="conn-name"
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={`My ${connectorType.name}`}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      {connectorType.configFields.map((field) => (
        <DynamicField
          key={field.key}
          field={field}
          value={config[field.key]}
          onChange={(v) => onFieldChange(field.key, v)}
        />
      ))}

      {onTest && (
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onTest}
            disabled={testPending}
            className="inline-flex items-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50"
          >
            {testPending && <Spinner className="h-4 w-4" />}
            Test Connection
          </button>

          {testResult && (
            <span
              className={`text-sm font-medium ${testResult.success ? "text-green-700" : "text-red-700"}`}
            >
              {testResult.success
                ? `Connected${testResult.latencyMs ? ` (${testResult.latencyMs}ms)` : ""}${testResult.serverVersion ? ` — ${testResult.serverVersion}` : ""}`
                : testResult.message}
            </span>
          )}
          {testError && !testResult && (
            <span className="text-sm font-medium text-red-700">
              {testError}
            </span>
          )}
        </div>
      )}

      <div className="flex justify-end pt-4 border-t border-gray-200">
        <button
          type="button"
          onClick={onNext}
          className="rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
        >
          Next
        </button>
      </div>
    </div>
  );
}

function ReviewStep({
  connectorType,
  name,
  config,
  onCreate,
  creating,
  createError,
}: {
  connectorType: ConnectorType;
  name: string;
  config: Record<string, unknown>;
  onCreate: () => void;
  creating: boolean;
  createError: string | null;
}) {
  return (
    <div className="mt-6 space-y-6">
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <div className="flex items-center gap-3">
          <span className="text-2xl" aria-hidden="true">
            {getIcon(connectorType.id)}
          </span>
          <div>
            <p className="text-sm font-semibold text-gray-900">{name}</p>
            <p className="text-xs text-gray-500">{connectorType.name}</p>
          </div>
        </div>

        <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
          {connectorType.configFields
            .filter((f) => f.type !== "password")
            .map((f) => (
              <div key={f.key}>
                <dt className="text-xs font-medium text-gray-500">{f.label}</dt>
                <dd className="text-gray-900">
                  {String(config[f.key] ?? "\u2014")}
                </dd>
              </div>
            ))}
          {connectorType.configFields
            .filter((f) => f.type === "password")
            .map((f) => (
              <div key={f.key}>
                <dt className="text-xs font-medium text-gray-500">{f.label}</dt>
                <dd className="text-gray-900">********</dd>
              </div>
            ))}
        </dl>
      </div>

      {createError && (
        <div className="rounded-md bg-red-50 p-3 text-sm text-red-800">
          {createError}
        </div>
      )}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={onCreate}
          disabled={creating}
          className="inline-flex items-center gap-2 rounded-md bg-gray-900 px-6 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50"
        >
          {creating && <Spinner className="h-4 w-4" />}
          Create Connection
        </button>
      </div>
    </div>
  );
}

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `field-${field.key}`;

  if (field.type === "boolean") {
    return (
      <div className="flex items-center gap-3">
        <button
          type="button"
          role="switch"
          id={id}
          aria-checked={Boolean(value)}
          onClick={() => onChange(!value)}
          className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 ${
            value ? "bg-gray-900" : "bg-gray-200"
          }`}
        >
          <span
            aria-hidden="true"
            className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow ring-0 transition-transform ${
              value ? "translate-x-5" : "translate-x-0"
            }`}
          />
        </button>
        <label htmlFor={id} className="text-sm font-medium text-gray-700">
          {field.label}
        </label>
        {field.helpText && (
          <span className="text-xs text-gray-400">{field.helpText}</span>
        )}
      </div>
    );
  }

  if (field.type === "select") {
    return (
      <div>
        <label htmlFor={id} className="block text-sm font-medium text-gray-700">
          {field.label}
          {field.required && <span className="text-red-500"> *</span>}
        </label>
        <select
          id={id}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          <option value="">Select...</option>
          {field.options?.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {field.helpText && (
          <p className="mt-1 text-xs text-gray-400">{field.helpText}</p>
        )}
      </div>
    );
  }

  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium text-gray-700">
        {field.label}
        {field.required && <span className="text-red-500"> *</span>}
      </label>
      <input
        id={id}
        type={field.type === "password" ? "password" : field.type === "number" ? "number" : "text"}
        placeholder={field.placeholder}
        required={field.required}
        value={String(value ?? "")}
        onChange={(e) =>
          onChange(
            field.type === "number"
              ? e.target.value === ""
                ? ""
                : Number(e.target.value)
              : e.target.value,
          )
        }
        className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
      />
      {field.helpText && (
        <p className="mt-1 text-xs text-gray-400">{field.helpText}</p>
      )}
    </div>
  );
}

function buildDefaults(fields: ConfigField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.default !== undefined) {
      out[f.key] = f.default;
    } else if (f.type === "boolean") {
      out[f.key] = false;
    } else {
      out[f.key] = "";
    }
  }
  return out;
}
