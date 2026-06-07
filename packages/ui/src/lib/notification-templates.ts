import type {
  AnnouncementPublishedPayload,
  NotificationListItem,
  NotificationPriority,
} from "@staffly/types";

export interface NotificationDisplay {
  title: string;
  description: string;
  priority: NotificationPriority;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

/**
 * Notification template registry.
 *
 * The Notification table stores no rendered text — only a `templateId` and a
 * JSON `payload`. This maps each known templateId to display text. Unknown
 * templateIds (e.g. a producer added in a later sprint before the UI catches
 * up) fall back to a safe generic rendering so a notification is never blank.
 *
 * Supported templates:
 *   - announcement.published → { announcementId, title, priority,
 *     requiresAcknowledgment }
 */
export function renderNotification(
  n: NotificationListItem,
): NotificationDisplay {
  switch (n.templateId) {
    case "announcement.published": {
      const p = (n.payload ?? {}) as Partial<AnnouncementPublishedPayload>;
      return {
        title: asString(p.title, "New announcement"),
        description: p.requiresAcknowledgment
          ? "New announcement · acknowledgment required"
          : "New announcement published",
        priority: n.priority,
      };
    }
    default:
      return {
        title: "Notification",
        description: n.templateId,
        priority: n.priority,
      };
  }
}

const PRIORITY_LABEL: Record<NotificationPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
};

export function priorityLabel(priority: NotificationPriority): string {
  return PRIORITY_LABEL[priority] ?? priority;
}
