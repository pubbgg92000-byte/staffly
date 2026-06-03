"use client";

import { useRouter } from "next/navigation";
import {
  toast,
  useCreateEmployee,
  useDepartments,
  useDesignations,
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
    />
  );
}
