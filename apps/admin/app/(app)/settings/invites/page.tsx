"use client";

import { useCallback, useEffect, useState, Suspense } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Badge,
  Button,
  ConfirmDialog,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Label,
  PageHeader,
  Select,
  Skeleton,
  StatusBadge,
  type StatusTone,
  extractErrorMessage,
  toast,
  useCreateInvite,
  useInvites,
  usePermissionCheck,
  useResendInvite,
  useRevokeInvite,
} from "@staffly/ui";
import {
  InviteSchema,
  type InviteFormValues,
  type InviteIssuedResponse,
  type InviteListItem,
  type InviteStatus,
} from "@staffly/types";
import { Copy, Mail, Plus, ShieldOff } from "lucide-react";

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "pending", label: "Pending" },
  { value: "accepted", label: "Accepted" },
  { value: "revoked", label: "Revoked" },
  { value: "expired", label: "Expired" },
];

const STATUS_TONE: Record<InviteStatus, StatusTone> = {
  pending: "warning",
  accepted: "success",
  revoked: "destructive",
  expired: "muted",
};

const FRIENDLY: Record<string, string> = {
  "invite.already_pending":
    "This email already has a pending invite. Resend or revoke it first.",
  "invite.super_admin_protected":
    "super_admin invites cannot be issued — that role is only set at org bootstrap.",
  "invite.not_revokable": "Only pending invites can be revoked.",
  "invite.already_accepted": "This invite has already been accepted.",
  "invite.revoked": "This invite was revoked; create a new one instead.",
  "invite.not_found": "Invite not found.",
  "role.not_found": "That role does not exist.",
};

function friendly(err: unknown): string | undefined {
  const code =
    err && typeof err === "object" && "code" in err
      ? String((err as { code: unknown }).code)
      : undefined;
  return code ? (FRIENDLY[code] ?? undefined) : undefined;
}

function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Create-invite dialog ─────────────────────────────────────────────────────

function CreateInviteDialog({
  open,
  onOpenChange,
  onIssued,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onIssued: (res: InviteIssuedResponse) => void;
}): React.ReactNode {
  const create = useCreateInvite();
  const [serverError, setServerError] = useState<string | undefined>();

  const form = useForm<InviteFormValues>({
    resolver: zodResolver(InviteSchema),
    defaultValues: { email: "", roleKey: "employee" },
  });

  useEffect(() => {
    if (open) {
      form.reset({ email: "", roleKey: "employee" });
      setServerError(undefined);
    }
  }, [open, form]);

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(undefined);
    try {
      const res = await create.mutateAsync({
        email: values.email,
        roleKey: values.roleKey,
      });
      toast.success("Invite sent");
      onOpenChange(false);
      onIssued(res);
    } catch (err) {
      setServerError(
        friendly(err) ?? extractErrorMessage(err, "Failed to send invite"),
      );
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Send invite</DialogTitle>
          <DialogDescription>
            The recipient will receive an invite link to set up their account.
          </DialogDescription>
        </DialogHeader>

        {serverError ? (
          <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive">
            {serverError}
          </div>
        ) : null}

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              placeholder="name@example.com"
              {...form.register("email")}
            />
            {form.formState.errors.email?.message ? (
              <p className="text-xs text-destructive">
                {form.formState.errors.email.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="roleKey">Role *</Label>
            <Select id="roleKey" {...form.register("roleKey")}>
              <option value="employee">Employee</option>
              <option value="manager">Manager</option>
              <option value="hr_admin">HR Admin</option>
            </Select>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Sending…" : "Send invite"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Invite-URL dialog (after create / resend) ────────────────────────────────

function InviteUrlDialog({
  issued,
  onOpenChange,
}: {
  issued: InviteIssuedResponse | null;
  onOpenChange: (o: boolean) => void;
}): React.ReactNode {
  const copy = async (): Promise<void> => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.inviteUrl);
      toast.success("Invite link copied");
    } catch {
      toast.error("Could not copy — select and copy manually");
    }
  };

  return (
    <Dialog open={!!issued} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite link</DialogTitle>
          <DialogDescription>
            Share this link with {issued?.email}. It expires on{" "}
            {issued ? fmtDateTime(issued.expiresAt) : "—"}.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2">
          <Input readOnly value={issued?.inviteUrl ?? ""} className="text-xs" />
          <Button type="button" variant="outline" size="sm" onClick={copy}>
            <Copy className="h-4 w-4" /> Copy
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Revoke confirmation ──────────────────────────────────────────────────────

function RevokeDialog({
  invite,
  onOpenChange,
}: {
  invite: InviteListItem | null;
  onOpenChange: (o: boolean) => void;
}): React.ReactNode {
  const revoke = useRevokeInvite();

  const onConfirm = async (): Promise<void> => {
    if (!invite) return;
    try {
      await revoke.mutateAsync(invite.id);
      toast.success("Invite revoked");
      onOpenChange(false);
    } catch (err) {
      toast.error(
        friendly(err) ?? extractErrorMessage(err, "Failed to revoke invite"),
      );
      onOpenChange(false);
    }
  };

  return (
    <ConfirmDialog
      open={!!invite}
      onOpenChange={onOpenChange}
      tone="destructive"
      title="Revoke invite?"
      description={
        invite
          ? `The invite link for ${invite.email} will stop working immediately.`
          : undefined
      }
      confirmLabel="Revoke"
      pendingLabel="Revoking…"
      onConfirm={onConfirm}
    />
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

function InvitesContent(): React.ReactNode {
  const router = useRouter();
  const sp = useSearchParams();
  const { has, isLoading: permsLoading } = usePermissionCheck();

  const statusParam = sp.get("status") ?? "";
  const pageParam = Math.max(1, Number(sp.get("page")) || 1);

  const [createOpen, setCreateOpen] = useState(false);
  const [issued, setIssued] = useState<InviteIssuedResponse | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<InviteListItem | null>(null);

  const canInvite = has("employee.invite");
  const resend = useResendInvite();

  const { data, isLoading, isError, refetch } = useInvites({
    page: pageParam,
    pageSize: 20,
    status: (statusParam as InviteStatus) || undefined,
  });

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      const next = new URLSearchParams(sp);
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      if (updates.status !== undefined) next.delete("page");
      router.push(`/settings/invites?${next.toString()}`);
    },
    [router, sp],
  );

  useEffect(() => {
    if (isError && canInvite) {
      toast.error("Failed to load invites", {
        action: { label: "Retry", onClick: refetch },
      });
    }
  }, [isError, refetch, canInvite]);

  if (!permsLoading && !canInvite) {
    return (
      <div className="space-y-6">
        <PageHeader title="Invites" subtitle="Invite people to your team" />
        <EmptyState
          icon={<ShieldOff className="h-8 w-8" />}
          title="Forbidden"
          description="You need the employee.invite permission to manage invites."
        />
      </div>
    );
  }

  const items = data?.items ?? [];
  const meta = data?.meta;
  const isEmpty = !isLoading && items.length === 0;

  const onResend = async (invite: InviteListItem): Promise<void> => {
    try {
      const res = await resend.mutateAsync(invite.id);
      toast.success("Invite resent");
      setIssued(res);
    } catch (err) {
      toast.error(
        friendly(err) ?? extractErrorMessage(err, "Failed to resend invite"),
      );
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invites"
        subtitle="Invite people to your organization and manage pending invitations."
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" />
            Send invite
          </Button>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="w-full sm:w-44">
          <Label htmlFor="status" className="sr-only">
            Status
          </Label>
          <Select
            id="status"
            value={statusParam}
            onChange={(e) => updateParams({ status: e.target.value })}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Role</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="hidden px-4 py-3 font-medium md:table-cell">
                Expires
              </th>
              <th className="hidden px-4 py-3 font-medium lg:table-cell">
                Created
              </th>
              <th className="px-4 py-3 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-48" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-16" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </td>
                    <td className="hidden px-4 py-3 md:table-cell">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="hidden px-4 py-3 lg:table-cell">
                      <Skeleton className="h-4 w-32" />
                    </td>
                    <td className="px-4 py-3">
                      <Skeleton className="ml-auto h-8 w-20" />
                    </td>
                  </tr>
                ))
              : items.map((inv) => (
                  <tr key={inv.id} className="hover:bg-accent/40">
                    <td className="px-4 py-3 font-medium">{inv.email}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">
                        {inv.roleKey.replace(/_/g, " ")}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge tone={STATUS_TONE[inv.status]}>
                        {inv.status}
                      </StatusBadge>
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-muted-foreground md:table-cell">
                      {fmtDateTime(inv.expiresAt)}
                    </td>
                    <td className="hidden px-4 py-3 tabular-nums text-muted-foreground lg:table-cell">
                      {fmtDateTime(inv.createdAt)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {inv.status === "pending" ? (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => onResend(inv)}
                            disabled={resend.isPending}
                          >
                            Resend
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRevokeTarget(inv)}
                          >
                            Revoke
                          </Button>
                        </div>
                      ) : null}
                    </td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {isEmpty ? (
        <EmptyState
          icon={<Mail className="h-8 w-8" />}
          title="No invites"
          description={
            statusParam
              ? "Try changing the status filter."
              : "Send your first invite to get started."
          }
          action={
            !statusParam ? (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className="h-4 w-4" /> Send invite
              </Button>
            ) : undefined
          }
        />
      ) : null}

      {meta && meta.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Showing {(meta.page - 1) * meta.pageSize + 1}–
            {Math.min(meta.page * meta.pageSize, meta.total)} of {meta.total}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page <= 1}
              onClick={() => updateParams({ page: String(meta.page - 1) })}
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={meta.page >= meta.totalPages}
              onClick={() => updateParams({ page: String(meta.page + 1) })}
            >
              Next
            </Button>
          </div>
        </div>
      ) : null}

      <CreateInviteDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onIssued={setIssued}
      />
      <InviteUrlDialog
        issued={issued}
        onOpenChange={(o) => !o && setIssued(null)}
      />
      <RevokeDialog
        invite={revokeTarget}
        onOpenChange={(o) => !o && setRevokeTarget(null)}
      />
    </div>
  );
}

export default function InvitesPage(): React.ReactNode {
  return (
    <Suspense>
      <InvitesContent />
    </Suspense>
  );
}
