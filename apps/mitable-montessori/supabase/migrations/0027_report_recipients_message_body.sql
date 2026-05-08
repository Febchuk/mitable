-- 0027 — Add message_body to report_recipients
-- Stores the admin's personal note that accompanies the report email.

alter table report_recipients
  add column if not exists message_body text;
