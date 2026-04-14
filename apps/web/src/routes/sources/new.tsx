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

type Step = "select-type" | "configure" | "review";

function NewSourceWizard() {
  const navigate = useNavigate();
  const { data: types, isLoading: typesLoading } = useConnectorTypes();

  const [step, setStep] = useState<Step>("select-type");
  const [selectedType, setSelectedType] = useState<ConnectorType | null>(null);
  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [name, setName] = useState("");

  const testMutation = useTestConnection();
  const createMutation = useCreateConnector();

  const [testResult, setTestResult] = useState<TestConnectionResult | null>(
    null,
  );

  // -------------------------------------------------------------------------
  // Step 1: Select type
  // -------------------------------------------------------------------------

  function handleSelectType(ct: ConnectorType) {
    setSelectedType(ct);
    setConfig(buildDefaults(ct.configFields));
    setName(`My ${ct.name}`);
    setStep("configure");
  }

  // -------------------------------------------------------------------------
  // Step 2: Configure
  // -------------------------------------------------------------------------

  function handleFieldChange(fieldName: string, value: unknown) {
    setConfig((prev) => ({ ...prev, [fieldName]: value }));
  }

  function handleTestInline() {
    if (!selectedType) return;
    setTestResult(null);
    testMutation.mutate(
      { connectorTypeId: selectedType.id, config },
      { onSuccess: (data) => setTestResult(data) },
    );
  }

  // -------------------------------------------------------------------------
  // Step 3: Review & Create
  // -------------------------------------------------------------------------

  function handleCreate() {
    if (!selectedType) return;
    createMutation.mutate(
      { connectorTypeId: selectedType.id, name, config },
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

  return (
    <div className="mx-auto max-w-3xl px-8 py-10">
      {/* Breadcrumb */}
      <button
        type="button"
        onClick={() => {
          if (step === "configure") setStep("select-type");
          else if (step === "review") setStep("configure");
          else navigate({ to: "/sources" });
        }}
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

      {/* Step indicator */}
      <div className="mt-4 flex items-center gap-2 text-xs text-gray-400">
        <StepDot active={step === "select-type"} done={step !== "select-type"}>
          1. Select Type
        </StepDot>
        <span>&mdash;</span>
        <StepDot
          active={step === "configure"}
          done={step === "review"}
        >
          2. Configure
        </StepDot>
        <span>&mdash;</span>
        <StepDot active={step === "review"} done={false}>
          3. Review
        </StepDot>
      </div>

      {/* Step content */}
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
          onTest={handleTestInline}
          testPending={testMutation.isPending}
          testResult={testResult}
          testError={testMutation.isError}
          onNext={() => setStep("review")}
        />
      )}

      {step === "review" && selectedType && (
        <ReviewStep
          connectorType={selectedType}
          name={name}
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

// ---------------------------------------------------------------------------
// Step components
// ---------------------------------------------------------------------------

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

  // Group by category
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
                  {ct.icon}
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
  onTest: () => void;
  testPending: boolean;
  testResult: TestConnectionResult | null;
  testError: boolean;
  onNext: () => void;
}) {
  return (
    <div className="mt-6 space-y-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl" aria-hidden="true">
          {connectorType.icon}
        </span>
        <span className="text-sm font-semibold text-gray-900">
          {connectorType.name}
        </span>
      </div>

      {/* Connection name */}
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
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      {/* Dynamic fields */}
      {connectorType.configFields.map((field) => (
        <DynamicField
          key={field.name}
          field={field}
          value={config[field.name]}
          onChange={(v) => onFieldChange(field.name, v)}
        />
      ))}

      {/* Test */}
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
              ? `Connected (${testResult.latencyMs}ms)`
              : testResult.message}
          </span>
        )}
        {testError && (
          <span className="text-sm font-medium text-red-700">
            Test request failed
          </span>
        )}
      </div>

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
            {connectorType.icon}
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
              <div key={f.name}>
                <dt className="text-xs font-medium text-gray-500">{f.label}</dt>
                <dd className="text-gray-900">
                  {String(config[f.name] ?? "\u2014")}
                </dd>
              </div>
            ))}
          {connectorType.configFields
            .filter((f) => f.type === "password")
            .map((f) => (
              <div key={f.name}>
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

// ---------------------------------------------------------------------------
// Dynamic form field renderer
// ---------------------------------------------------------------------------

function DynamicField({
  field,
  value,
  onChange,
}: {
  field: ConfigField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const id = `field-${field.name}`;

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
          {field.required && <span className="text-red-500"> *</span>}
        </label>
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
      </div>
    );
  }

  // text, number, password
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
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildDefaults(fields: ConfigField[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of fields) {
    if (f.defaultValue !== undefined) {
      out[f.name] = f.defaultValue;
    } else if (f.type === "boolean") {
      out[f.name] = false;
    } else {
      out[f.name] = "";
    }
  }
  return out;
}
