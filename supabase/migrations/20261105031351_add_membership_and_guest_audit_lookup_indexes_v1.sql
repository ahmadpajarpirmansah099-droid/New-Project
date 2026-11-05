-- Support the actual authentication and guest-audit lookup patterns.
CREATE INDEX workspace_memberships_user_workspace_idx
ON public.workspace_memberships (user_id, workspace_id);

CREATE INDEX guest_status_history_workspace_guest_time_idx
ON public.guest_status_history (workspace_id, guest_id, changed_at);
