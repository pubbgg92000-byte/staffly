"use client";

import { Suspense } from "react";
import { AcceptInviteForm } from "@staffly/ui";

export default function AcceptInvitePage(): React.ReactNode {
  return (
    <Suspense fallback={null}>
      <AcceptInviteForm portal="employee" />
    </Suspense>
  );
}
