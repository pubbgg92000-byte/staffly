"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateEmployeeSchema,
  UpdateEmployeeSchema,
  type CreateEmployeeFormValues,
} from "@staffly/types";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Input,
  Select,
  Label,
  PageHeader,
} from "@staffly/ui";
import { ArrowLeft } from "lucide-react";

type OrgItem = { id: string; name: string };
type Mode = "create" | "edit";

const STATUS_OPTS = [
  { value: "active", label: "Active" },
  { value: "invited", label: "Invited" },
  { value: "on_leave", label: "On Leave" },
  { value: "suspended", label: "Suspended" },
];

const EMPLOYMENT_OPTS = [
  { value: "full_time", label: "Full Time" },
  { value: "part_time", label: "Part Time" },
  { value: "intern", label: "Intern" },
  { value: "contractor", label: "Contractor" },
  { value: "consultant", label: "Consultant" },
];

const WORK_MODE_OPTS = [
  { value: "onsite", label: "On-Site" },
  { value: "hybrid", label: "Hybrid" },
  { value: "remote", label: "Remote" },
];

interface EmployeeFormProps {
  mode: Mode;
  defaultValues?: Record<string, string | undefined>;
  onSubmit: (values: CreateEmployeeFormValues) => Promise<void>;
  isPending: boolean;
  serverError?: string;
  departments: OrgItem[];
  designations: OrgItem[];
  locations: OrgItem[];
}

export function EmployeeForm({
  mode,
  defaultValues,
  onSubmit,
  isPending,
  serverError,
  departments,
  designations,
  locations,
}: EmployeeFormProps): React.ReactNode {
  const router = useRouter();
  const schema = mode === "create" ? CreateEmployeeSchema : UpdateEmployeeSchema;

  const form = useForm<CreateEmployeeFormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      employeeCode: "",
      firstName: "",
      middleName: "",
      lastName: "",
      workEmail: "",
      personalEmail: "",
      mobilePhoneE164: "",
      status: "active",
      joinedOn: "",
      departmentId: "",
      designationId: "",
      locationId: "",
      employmentType: "full_time",
      workMode: "onsite",
    },
  });

  const handleSubmit = form.handleSubmit(onSubmit);
  const title = mode === "create" ? "Add Employee" : "Edit Employee";
  const subtitle =
    mode === "create"
      ? "Create a new employee record"
      : "Update employee information";

  const FieldError = ({ name }: { name: string }) => {
    const err = form.formState.errors[name as keyof typeof form.formState.errors];
    if (!err?.message) return null;
    return <p className="text-xs text-destructive mt-1">{String(err.message)}</p>;
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <Link
        href="/employees"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to employees
      </Link>

      <PageHeader title={title} subtitle={subtitle} />

      {serverError ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
          {serverError}
        </div>
      ) : null}

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* Basic info */}
        <section className="rounded-lg border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Basic Information</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="firstName">First Name *</Label>
              <Input id="firstName" {...form.register("firstName")} />
              <FieldError name="firstName" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="middleName">Middle Name</Label>
              <Input id="middleName" {...form.register("middleName")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="lastName">Last Name *</Label>
              <Input id="lastName" {...form.register("lastName")} />
              <FieldError name="lastName" />
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="employeeCode">Employee Code *</Label>
              <Input id="employeeCode" {...form.register("employeeCode")} />
              <FieldError name="employeeCode" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="status">Status</Label>
              <Select id="status" {...form.register("status")}>
                {STATUS_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          </div>
        </section>

        {/* Contact */}
        <section className="rounded-lg border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Contact</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="workEmail">Work Email *</Label>
              <Input id="workEmail" type="email" {...form.register("workEmail")} />
              <FieldError name="workEmail" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="personalEmail">Personal Email</Label>
              <Input id="personalEmail" type="email" {...form.register("personalEmail")} />
              <FieldError name="personalEmail" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="mobilePhoneE164">Phone</Label>
              <Input id="mobilePhoneE164" placeholder="+1234567890" {...form.register("mobilePhoneE164")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="joinedOn">Joined On</Label>
              <Input id="joinedOn" type="date" {...form.register("joinedOn")} />
            </div>
          </div>
        </section>

        {/* Work assignment */}
        <section className="rounded-lg border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Work Assignment</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="departmentId">Department</Label>
              <Select id="departmentId" {...form.register("departmentId")}>
                <option value="">—</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="designationId">Designation</Label>
              <Select id="designationId" {...form.register("designationId")}>
                <option value="">—</option>
                {designations.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="locationId">Location</Label>
              <Select id="locationId" {...form.register("locationId")}>
                <option value="">—</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.name}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="employmentType">Employment Type</Label>
              <Select id="employmentType" {...form.register("employmentType")}>
                {EMPLOYMENT_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="workMode">Work Mode</Label>
              <Select id="workMode" {...form.register("workMode")}>
                {WORK_MODE_OPTS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </Select>
            </div>
          </div>
        </section>

        {/* Actions */}
        <div className="flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push("/employees")}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={isPending}>
            {isPending ? "Saving…" : mode === "create" ? "Create Employee" : "Save Changes"}
          </Button>
        </div>
      </form>
    </div>
  );
}
