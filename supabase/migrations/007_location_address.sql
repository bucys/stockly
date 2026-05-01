-- Add optional address field to locations
alter table locations
  add column if not exists address text;
