-- Mark disconnected sessions offline after the approved 120-second grace period.
-- The daily retention migration removes offline sessions after seven days.

do $job$
begin
  if exists (select 1 from cron.job where jobname = 'user-monitoring-mark-offline') then
    perform cron.unschedule(jobid)
    from cron.job
    where jobname = 'user-monitoring-mark-offline';
  end if;
end;
$job$;

select cron.schedule(
  'user-monitoring-mark-offline',
  '* * * * *',
  $command$
    update public.user_monitoring_sessions
    set status = 'offline',
        ended_at = coalesce(ended_at, last_seen_at)
    where status = 'online'
      and last_seen_at < now() - interval '120 seconds';
  $command$
);
