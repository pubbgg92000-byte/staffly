"use client";

import { Suspense, type ReactNode } from "react";
import { NotificationsInbox } from "@staffly/ui";

export default function NotificationsPage(): ReactNode {
  return (
    <Suspense>
      <NotificationsInbox />
    </Suspense>
  );
}
