"use client";

import { useParams, useRouter } from "next/navigation";
import {
  toast,
  useEmployee,
  useEmployees,
  useUpdateEmployee,
  useDepartments,
  useDesignations,
  useLocations,
} from "@staffly/ui";
import { EmployeeForm } from "../../_components/employee-form";
import type { CreateEmployeeFormValues } from "@staffly/types";

export default function EditEmployeePage(): React.ReactNode {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { data: emp, isLoading } = useEmployee(id);
  const update = useUpdateEmployee(id);
  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: locs } = useLocations();
  const { data: emps } = useEmployees({
    pageSize: 100,
    status: "active",
    sortBy: "displayName",
  });

  // Best-effort self-reference guard: exclude this employee from the
  // manager picker. Backend does not enforce non-cyclic managers.
  const managers = (emps?.items ?? [])
    .filter((e) => e.id !== id)
    .map((e) => ({
      id: e.id,
      displayName: e.displayName,
      employeeCode: e.employeeCode,
    }));

  if (isLoading || !emp) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        Loading employee…
      </div>
    );
  }

  const handleSubmit = async (values: CreateEmployeeFormValues) => {
    try {
      await update.mutateAsync(values);
      toast.success("Employee updated");
      router.push(`/employees/${id}`);
    } catch {
      toast.error("Failed to update employee");
    }
  };

  const defaultValues = {
    employeeCode: emp.employeeCode,
    firstName: emp.firstName,
    middleName: emp.middleName ?? "",
    lastName: emp.lastName,
    workEmail: emp.workEmail,
    personalEmail: emp.personalEmail ?? "",
    mobilePhoneE164: emp.mobilePhoneE164 ?? "",
    status: emp.status,
    joinedOn: emp.joinedOn ? emp.joinedOn.slice(0, 10) : "",
    departmentId: emp.department?.id ?? "",
    designationId: emp.designation?.id ?? "",
    locationId: emp.location?.id ?? "",
    managerId: emp.manager?.id ?? "",
    employmentType: emp.employmentType,
    workMode: emp.workMode,
  };

  return (
    <EmployeeForm
      mode="edit"
      defaultValues={defaultValues}
      onSubmit={handleSubmit}
      isPending={update.isPending}
      serverError={update.error?.message}
      departments={depts?.items ?? []}
      designations={desigs?.items ?? []}
      locations={locs?.items ?? []}
      managers={managers}
    />
  );
}
