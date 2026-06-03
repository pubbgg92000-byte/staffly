"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Button,
  Skeleton,
  PageHeader,
  EmployeeStatusBadge,
  Avatar,
  AvatarFallback,
  Separator,
  toast,
  useEmployee,
  useDeleteEmployee,
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@staffly/ui";
import { ArrowLeft, Pencil, Trash2, User } from "lucide-react";
import { useState } from "react";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export default function EmployeeDetailPage(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: emp, isLoading, isError, refetch } = useEmployee(id);
  const deleteEmp = useDeleteEmployee();
  const [offboardOpen, setOffboardOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Loading…" />
        <div className="space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-48 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  if (isError || !emp) {
    return (
      <div className="space-y-6">
        <PageHeader title="Employee not found" />
        <div className="flex flex-col items-center gap-4 rounded-lg border bg-card p-12 text-center">
          <User className="h-12 w-12 text-muted-foreground" />
          <p className="text-muted-foreground">
            Could not load this employee.
          </p>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => refetch()}>
              Retry
            </Button>
            <Button variant="outline" asChild>
              <Link href="/employees">Back to employees</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const handleOffboard = async () => {
    try {
      await deleteEmp.mutateAsync(id);
      toast.success(`${emp.displayName} has been offboarded`);
      router.push("/employees");
    } catch {
      toast.error("Failed to offboard employee");
    }
    setOffboardOpen(false);
  };

  const canOffboard = emp.status !== "offboarded";

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/employees"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to employees
      </Link>

      {/* Profile header */}
      <div className="flex flex-col gap-4 rounded-lg border bg-card p-6 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-center gap-4">
          <Avatar className="h-14 w-14">
            <AvatarFallback className="text-lg">
              {initials(emp.displayName)}
            </AvatarFallback>
          </Avatar>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold">{emp.displayName}</h1>
              <EmployeeStatusBadge status={emp.status} />
            </div>
            <p className="text-sm text-muted-foreground">
              {emp.employeeCode} · {emp.workEmail}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href={`/employees/${id}/edit`}>
              <Pencil className="h-4 w-4" />
              Edit
            </Link>
          </Button>
          {canOffboard ? (
            <Dialog open={offboardOpen} onOpenChange={setOffboardOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive">
                  <Trash2 className="h-4 w-4" />
                  Offboard
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Offboard {emp.displayName}?</DialogTitle>
                  <DialogDescription>
                    This will mark the employee as offboarded and deactivate
                    their account. This action cannot be undone.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <DialogClose asChild>
                    <Button variant="outline">Cancel</Button>
                  </DialogClose>
                  <Button
                    variant="destructive"
                    onClick={handleOffboard}
                    disabled={deleteEmp.isPending}
                  >
                    {deleteEmp.isPending
                      ? "Offboarding…"
                      : "Confirm Offboard"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          ) : null}
        </div>
      </div>

      {/* Details grid */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Work info */}
        <div className="rounded-lg border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Work Information</h2>
          <div className="space-y-3 text-sm">
            <Row label="Department" value={emp.department?.name} />
            <Row label="Designation" value={emp.designation?.name} />
            <Row label="Location" value={emp.location?.name} />
            <Row
              label="Manager"
              value={emp.manager?.displayName ?? null}
              sub={emp.manager ? emp.manager.employeeCode : undefined}
            />
            <Separator />
            <Row
              label="Employment Type"
              value={emp.employmentType.replace("_", " ")}
            />
            <Row label="Work Mode" value={emp.workMode} />
            <Row label="Joined On" value={fmtDate(emp.joinedOn)} />
          </div>
        </div>

        {/* Contact & personal */}
        <div className="rounded-lg border bg-card p-5">
          <h2 className="mb-4 text-sm font-semibold">Contact & Personal</h2>
          <div className="space-y-3 text-sm">
            <Row label="Work Email" value={emp.workEmail} />
            <Row label="Personal Email" value={emp.personalEmail} />
            <Row label="Phone" value={emp.mobilePhoneE164} />
            <Separator />
            <Row label="Date of Birth" value={fmtDate(emp.dateOfBirth)} />
            <Row label="Gender" value={emp.gender ?? null} />
            <Row label="Nationality" value={emp.nationality ?? null} />
            <Row label="Blood Group" value={emp.bloodGroup ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | null | undefined;
  sub?: string;
}): React.ReactNode {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">
        {value ?? "—"}
        {sub ? (
          <span className="ml-1 text-xs text-muted-foreground">({sub})</span>
        ) : null}
      </span>
    </div>
  );
}
