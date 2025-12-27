-- Create videos table
create table if not exists public.videos (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  mux_playback_id text,
  mux_asset_id text unique,
  upload_id text, -- Mux direct upload ID
  title text,
  status text default 'processing', -- 'uploading', 'processing', 'ready', 'failed'
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  meta jsonb default '{}'::jsonb
);

-- Enable Row Level Security (RLS) for videos
alter table public.videos enable row level security;

-- Create policies for videos
create policy "Users can view their own videos"
on public.videos for select
using ( auth.uid() = user_id );

create policy "Users can insert their own videos"
on public.videos for insert
with check ( auth.uid() = user_id );

create policy "Users can update their own videos"
on public.videos for update
using ( auth.uid() = user_id );

create policy "Users can delete their own videos"
on public.videos for delete
using ( auth.uid() = user_id );

-- Create index for videos
create index if not exists videos_user_id_idx on public.videos (user_id);
create index if not exists videos_mux_asset_id_idx on public.videos (mux_asset_id);
create index if not exists videos_upload_id_idx on public.videos (upload_id);

-- Create video_scenes table (for analysis data)
-- Note: Assuming video_id references videos.id (but currently SupabaseService sends string/text for video_id)
-- If video_id in video_scenes matches videos.id or videos.mux_asset_id, we should be consistent.
-- Given SupabaseService uses video_id as string, we'll keep it loose or assume it's the video uuid.
create table if not exists public.video_scenes (
    id uuid default gen_random_uuid() primary key,
    video_id text not null, -- Can be mux_asset_id or our uuid
    scene_id text not null,
    start_time_ms float8 not null,
    end_time_ms float8 not null,
    scene_summary text,
    full_description text,
    scene_embedding vector(1536), -- Assuming OpenAI dimension
    transcript_phrases jsonb,
    objects_tracked jsonb,
    actions_detected jsonb,
    accurate_transcript text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for video_scenes (public read for now or matching video owner?)
alter table public.video_scenes enable row level security;

-- Simplistic policy for scenes: if you can see the video, you can see the scenes.
-- But joining checks in RLS can be expensive. For MVP, maybe allow authenticated read?
create policy "Authenticated users can read scenes"
on public.video_scenes for select
to authenticated
using (true);

create policy "Service role can manage scenes"
on public.video_scenes for all
using ( auth.role() = 'service_role' )
with check ( auth.role() = 'service_role' );

-- RPC function for vector search
create or replace function search_video_scenes (
  query_embedding vector(1536),
  match_threshold float,
  match_count int,
  video_filter text default null
)
returns table (
  scene_id text,
  video_id text,
  start_time_ms float8,
  end_time_ms float8,
  scene_summary text,
  full_description text,
  scene_embedding vector(1536),
  transcript_phrases jsonb,
  objects_tracked jsonb,
  actions_detected jsonb,
  accurate_transcript text,
  score float
)
language plpgsql
as $$
begin
  return query
  select
    video_scenes.scene_id,
    video_scenes.video_id,
    video_scenes.start_time_ms,
    video_scenes.end_time_ms,
    video_scenes.scene_summary,
    video_scenes.full_description,
    video_scenes.scene_embedding,
    video_scenes.transcript_phrases,
    video_scenes.objects_tracked,
    video_scenes.actions_detected,
    video_scenes.accurate_transcript,
    1 - (video_scenes.scene_embedding <=> query_embedding) as score
  from video_scenes
  where 1 - (video_scenes.scene_embedding <=> query_embedding) > match_threshold
  and (video_filter is null or video_scenes.video_id = video_filter)
  order by video_scenes.scene_embedding <=> query_embedding
  limit match_count;
end;
$$;

-- Create user_usage table for tracking usage per user
create table if not exists public.user_usage (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null unique,
  videos_uploaded int default 0,
  ai_generations int default 0,
  scenes_analyzed int default 0,
  last_reset_at timestamp with time zone default timezone('utc'::text, now()) not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for user_usage
alter table public.user_usage enable row level security;

-- Policies for user_usage
create policy "Users can view their own usage"
on public.user_usage for select
using ( auth.uid() = user_id );

create policy "Users can insert their own usage"
on public.user_usage for insert
with check ( auth.uid() = user_id );

create policy "Users can update their own usage"
on public.user_usage for update
using ( auth.uid() = user_id );

-- Create index for user_usage
create index if not exists user_usage_user_id_idx on public.user_usage (user_id);

-- Function to increment usage counter
create or replace function increment_usage(
  p_user_id uuid,
  p_field text,
  p_amount int default 1
)
returns void
language plpgsql
security definer
as $$
begin
  insert into public.user_usage (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;
  
  if p_field = 'videos_uploaded' then
    update public.user_usage 
    set videos_uploaded = videos_uploaded + p_amount, updated_at = now()
    where user_id = p_user_id;
  elsif p_field = 'ai_generations' then
    update public.user_usage 
    set ai_generations = ai_generations + p_amount, updated_at = now()
    where user_id = p_user_id;
  elsif p_field = 'scenes_analyzed' then
    update public.user_usage 
    set scenes_analyzed = scenes_analyzed + p_amount, updated_at = now()
    where user_id = p_user_id;
  end if;
end;
$$;
