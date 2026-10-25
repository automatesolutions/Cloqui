-- Local development only. Production uses a private Cloudflare R2 bucket created by hand.
insert into storage.buckets (id, name, public)
values ('cloqui-media', 'cloqui-media', false)
on conflict (id) do update set public = false;
