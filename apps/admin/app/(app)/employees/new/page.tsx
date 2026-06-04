"use client";

import { useRouter } from "next/navigation";
import {
  toast,
  useCreateEmployee,
  useDepartments,
  useDesignations,
  useEmployees,
  useLocations,
} from "@staffly/ui";
import { EmployeeForm } from "../_components/employee-form";
import type { CreateEmployeeFormValues } from "@staffly/types";

export default function NewEmployeePage(): React.ReactNode {
  const router = useRouter();
  const create = useCreateEmployee();
  const { data: depts } = useDepartments();
  const { data: desigs } = useDesignations();
  const { data: locs } = useLocations();
  const { data: emps } = useEmployees({
    pageSize: 100,
    status: "active",
    sortBy: "displayName",
  });

  const managers = (emps?.items ?? []).map((e) => ({
    id: e.id,
    displayName: e.displayName,
    employeeCode: e.employeeCode,
  }));

  const handleSubmit = async (values: CreateEmployeeFormValues) => {
    try {
      const created = await create.mutateAsync(values);
      toast.success(`Employee ${created.displayName} created`);
      router.push(`/employees/${created.id}`);
    } catch {
      toast.error(
        "Failed to create employee. Check for duplicate code or email.",
      );
    }
  };

  return (
    <EmployeeForm
      mode="create"
      onSubmit={handleSubmit}
      isPending={create.isPending}
      serverError={create.error?.message}
      departments={depts?.items ?? []}
      designations={desigs?.items ?? []}
      locations={locs?.items ?? []}
      managers={managers}
    />
  );
}
