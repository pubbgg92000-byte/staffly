"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import { ApiError } from "./error";
import { sessionKeys } from "./session";
import type {
  LogoPresignInput,
  LogoPresignResponse,
  OrgSettings,
  OrganizationProfile,
  UpdateOrganizationInput,
  UpdateOrgSettingsInput,
} from "@staffly/types";

export const organizationKeys = {
  profile: ["organization", "profile"] as const,
  settings: ["organization", "settings"] as const,
};

// ─── Queries ────────────────────────────────────────────────────────────────

export function useOrganization(): {
  data: OrganizationProfile | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
  refetch: () => void;
} {
  const q = useQuery({
    queryKey: organizationKeys.profile,
    queryFn: () => api.get<OrganizationProfile>("/organization"),
    staleTime: 60_000,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error instanceof ApiError ? q.error : null,
    refetch: () => q.refetch(),
  };
}

export function useOrgSettings(): {
  data: OrgSettings | undefined;
  isLoading: boolean;
  isError: boolean;
  error: ApiError | null;
} {
  const q = useQuery({
    queryKey: organizationKeys.settings,
    queryFn: () => api.get<OrgSettings>("/organization/settings"),
    staleTime: 60_000,
    retry: 1,
  });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isError: q.isError,
    error: q.error instanceof ApiError ? q.error : null,
  };
}

// ─── Mutations ──────────────────────────────────────────────────────────────

export function useUpdateOrganization(): ReturnType<
  typeof useMutation<OrganizationProfile, ApiError, UpdateOrganizationInput>
> {
  const qc = useQueryClient();
  return useMutation<OrganizationProfile, ApiError, UpdateOrganizationInput>({
    mutationFn: (body) => api.patch<OrganizationProfile>("/organization", body),
    onSuccess: (next) => {
      qc.setQueryData(organizationKeys.profile, next);
      // Sidebar/header read org name + logo from the session payload.
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
    },
  });
}

export function useUpdateOrgSettings(): ReturnType<
  typeof useMutation<OrgSettings, ApiError, UpdateOrgSettingsInput>
> {
  const qc = useQueryClient();
  return useMutation<OrgSettings, ApiError, UpdateOrgSettingsInput>({
    mutationFn: (patch) =>
      api.patch<OrgSettings>("/organization/settings", patch),
    onSuccess: (next) => {
      qc.setQueryData(organizationKeys.settings, next);
    },
  });
}

export function usePresignLogoUpload(): ReturnType<
  typeof useMutation<LogoPresignResponse, ApiError, LogoPresignInput>
> {
  return useMutation<LogoPresignResponse, ApiError, LogoPresignInput>({
    mutationFn: (body) =>
      api.post<LogoPresignResponse>("/organization/logo/presign-upload", body),
  });
}

export function useConfirmLogo(): ReturnType<
  typeof useMutation<OrganizationProfile, ApiError, { key: string }>
> {
  const qc = useQueryClient();
  return useMutation<OrganizationProfile, ApiError, { key: string }>({
    mutationFn: (body) =>
      api.post<OrganizationProfile>("/organization/logo", body),
    onSuccess: (next) => {
      qc.setQueryData(organizationKeys.profile, next);
      void qc.invalidateQueries({ queryKey: sessionKeys.me });
    },
  });
}

/**
 * Bundles the 3-step upload flow (presign → PUT → confirm) into one hook so
 * callers can `await uploadLogo(file)` without orchestrating it themselves.
 * Errors at any step surface to the consumer.
 */
export function useLogoUpload(): {
  upload: (file: File) => Promise<OrganizationProfile>;
  isUploading: boolean;
  error: Error | null;
} {
  const presign = usePresignLogoUpload();
  const confirm = useConfirmLogo();
  const upload = async (file: File): Promise<OrganizationProfile> => {
    const presigned = await presign.mutateAsync({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
    });
    const put = await fetch(presigned.url, {
      method: "PUT",
      body: file,
      headers: { "Content-Type": file.type },
    });
    if (!put.ok) throw new Error(`Logo upload failed: HTTP ${put.status}`);
    return confirm.mutateAsync({ key: presigned.key });
  };
  return {
    upload,
    isUploading: presign.isPending || confirm.isPending,
    error:
      (presign.error as Error | null) ??
      (confirm.error as Error | null) ??
      null,
  };
}
