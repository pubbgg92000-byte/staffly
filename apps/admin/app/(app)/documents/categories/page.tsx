"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import {
  Badge,
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Skeleton,
  extractErrorMessage,
  toast,
  useCreateCategory,
  useDeleteCategory,
  useDocumentCategories,
  useUpdateCategory,
} from "@staffly/ui";
import {
  CategorySchema,
  type CategoryFormValues,
  type DocumentCategory,
} from "@staffly/types";
import { ArrowLeft, FolderOpen, Plus } from "lucide-react";

const FRIENDLY: Record<string, string> = {
  "document.category.conflict_name_or_code":
    "A category with this name or code already exists.",
  "document.category.system_undeletable":
    "System categories cannot be deleted.",
  "document.category.in_use":
    "This category still has documents. Archive or move them first.",
};

function friendly(err: unknown): string | undefined {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  return code ? (FRIENDLY[code] ?? undefined) : undefined;
}

// ─── Category dialog ─────────────────────────────────────────────────────

function CategoryDialog({
  open,
  onOpenChange,
  edit,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  edit: DocumentCategory | null;
}): React.ReactNode {
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const isEdit = !!edit;
  const [serverError, setServerError] = useState<string | undefined>();

  const form = useForm<CategoryFormValues>({
    resolver: zodResolver(CategorySchema),
    defaultValues: {
      name: "",
      code: "",
      color: "",
      description: "",
      isActive: true,
      isPersonal: false,
    },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      name: edit?.name ?? "",
      code: edit?.code ?? "",
      color: edit?.color ?? "",
      description: edit?.description ?? "",
      isActive: edit?.isActive ?? true,
      isPersonal: edit?.isPersonal ?? false,
    });
    setServerError(undefined);
  }, [open, edit, form]);

  const doSave = form.handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      if (isEdit && edit) {
        await update.mutateAsync({ id: edit.id, body: values });
        toast.success("Category updated");
      } else {
        await create.mutateAsync(values);
        toast.success("Category created");
      }
      onOpenChange(false);
    } catch (err) {
      setServerError(
        friendly(err) ?? extractErrorMessage(err, "Failed to save category"),
      );
    }
  });

  const FE = ({ name }: { name: keyof CategoryFormValues }) => {
    const e = form.formState.errors[name];
    if (!e?.message) return null;
    return <p className="mt-1 text-xs text-destructive">{String(e.message)}</p>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit category" : "Create category"}
          </DialogTitle>
          <DialogDescription>
            Categories group documents for filtering and access control.
          </DialogDescription>
        </DialogHeader>

        {serverError ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}

        <form onSubmit={doSave} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Name *</Label>
            <Input
              {...form.register("name")}
              placeholder="e.g. Company Policy"
            />
            <FE name="name" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Code</Label>
              <Input
                {...form.register("code")}
                placeholder="POLICY"
                className="uppercase"
              />
              <FE name="code" />
            </div>
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  className="h-9 w-9 cursor-pointer rounded border border-input bg-background p-0.5"
                  value={form.watch("color") || "#94A3B8"}
                  onChange={(e) => form.setValue("color", e.target.value)}
                />
                <Input
                  {...form.register("color")}
                  placeholder="#94A3B8"
                  className="flex-1"
                />
              </div>
              <FE name="color" />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Description</Label>
            <textarea
              rows={2}
              className="flex min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              {...form.register("description")}
            />
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...form.register("isActive")}
              />
              Active
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                className="h-4 w-4 rounded border-input"
                {...form.register("isPersonal")}
              />
              Personal (employee-specific documents)
            </label>
          </div>

          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="submit"
              disabled={create.isPending || update.isPending}
            >
              {create.isPending || update.isPending
                ? "Saving…"
                : isEdit
                  ? "Save changes"
                  : "Create category"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Delete confirmation ──────────────────────────────────────────────────

function DeleteDialog({
  category,
  onOpenChange,
}: {
  category: DocumentCategory | null;
  onOpenChange: (o: boolean) => void;
}): React.ReactNode {
  const del = useDeleteCategory();

  const handleDelete = async () => {
    if (!category) return;
    try {
      await del.mutateAsync(category.id);
      toast.success("Category deleted");
      onOpenChange(false);
    } catch (err) {
      toast.error(
        friendly(err) ?? extractErrorMessage(err, "Failed to delete category"),
      );
    }
  };

  return (
    <Dialog open={!!category} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete &ldquo;{category?.name}&rdquo;?</DialogTitle>
          <DialogDescription>
            This will soft-delete the category. It cannot be deleted if
            documents are still assigned to it.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={del.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleDelete}
            disabled={del.isPending}
          >
            {del.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────

export default function DocumentCategoriesPage(): React.ReactNode {
  const { data, isLoading } = useDocumentCategories({ pageSize: 100 });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<DocumentCategory | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DocumentCategory | null>(
    null,
  );

  const items = data?.items ?? [];

  return (
    <div className="space-y-6">
      <Link
        href="/documents"
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Back to documents
      </Link>

      <div className="flex items-center justify-between">
        <PageHeader
          title="Document categories"
          subtitle="Categorize documents for filtering, audience scoping, and compliance."
        />
        <Button
          onClick={() => {
            setEditTarget(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-4 w-4" /> Add category
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<FolderOpen className="h-8 w-8" />}
          title="No categories yet"
          description="Create at least one category before uploading documents."
          action={
            <Button
              onClick={() => {
                setEditTarget(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="h-4 w-4" /> Add category
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="hidden px-4 py-3 font-medium sm:table-cell">
                  Code
                </th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="hidden px-4 py-3 font-medium lg:table-cell">
                  Description
                </th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((cat) => (
                <tr key={cat.id} className="hover:bg-accent/40">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span
                        className="h-3 w-3 shrink-0 rounded-full"
                        style={{ backgroundColor: cat.color }}
                      />
                      <span className="font-medium">{cat.name}</span>
                      {cat.isSystem ? (
                        <Badge variant="secondary" className="text-xs">
                          System
                        </Badge>
                      ) : null}
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">
                    {cat.code ?? "—"}
                  </td>
                  <td className="px-4 py-3">
                    <Badge variant="outline">
                      {cat.isPersonal ? "Personal" : "Distributed"}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    {cat.isActive ? (
                      <Badge
                        variant="outline"
                        className="text-green-700 dark:text-green-400"
                      >
                        Active
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Inactive</Badge>
                    )}
                  </td>
                  <td className="hidden max-w-xs truncate px-4 py-3 text-muted-foreground lg:table-cell">
                    {cat.description ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setEditTarget(cat);
                          setDialogOpen(true);
                        }}
                      >
                        Edit
                      </Button>
                      {!cat.isSystem ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleteTarget(cat)}
                        >
                          Delete
                        </Button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CategoryDialog
        open={dialogOpen}
        onOpenChange={(o) => {
          setDialogOpen(o);
          if (!o) setEditTarget(null);
        }}
        edit={editTarget}
      />

      <DeleteDialog
        category={deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
      />
    </div>
  );
}
