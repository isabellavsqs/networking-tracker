interface DataApiError {
  code?: string;
  message?: string;
}

/**
 * Maps Postgres/Data API errors to plain-language messages. The 23514/23502
 * codes are the real trust boundary (CHECK/NOT NULL constraints in db/schema.sql) —
 * this only translates them for display, it doesn't decide what's valid.
 */
export function friendlyContactError(error: unknown): string {
  const err = error as DataApiError | null | undefined;
  if (!err) return "Something went wrong. Please try again.";

  switch (err.code) {
    case "23514":
      if (err.message?.includes("contacts_name_not_blank")) {
        return "Name can't be empty.";
      }
      if (err.message?.includes("contacts_priority_valid")) {
        return "Priority must be high, medium, or low.";
      }
      return "That value isn't allowed.";
    case "23502":
      return "Name is required.";
    case "PGRST301":
      return "You don't have access to this contact.";
    case "42501":
      return "Permission denied.";
    default:
      return err.message ?? "Something went wrong. Please try again.";
  }
}
