-- 0016_mcp_upload_tickets.sql
-- Tiket muat naik bertandatangan untuk MCP.
--
-- KENAPA INI WUJUD
-- upload_board_file hanya menerima content_base64. Base64 dijana sebagai
-- output model, jadi setiap bait fail menjadi kos token: 1.5 MB bahan kursus
-- menelan kira-kira 503,000 token. Chunking tidak membantu, kerana jumlah
-- token kekal sama walaupun dipecahkan.
--
-- Penyelesaiannya: MCP tidak lagi menerima bait. Ia mengeluarkan kebenaran
-- terhad masa, dan alat tempatan menghantar fail terus ke storan S5.
--
-- Tiket ialah kebenaran, jadi ia mesti berkeadaan. "Guna sekali sahaja" dan
-- "tamat tempoh" tidak boleh dikuatkuasakan tanpa rekod.

create table if not exists mcp.upload_tickets (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid        not null,
  class_id       uuid        not null,
  board_id       uuid,

  -- Laluan objek SENTIASA dijana oleh pelayan. Menerima laluan daripada
  -- klien membenarkan penulisan silang penyewa.
  object_key     text        not null unique,

  file_name      text        not null,
  mime_type      text,
  declared_size  bigint,

  expires_at     timestamptz not null,
  consumed_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index if not exists upload_tickets_user_idx
  on mcp.upload_tickets (user_id, created_at desc);

create index if not exists upload_tickets_pending_idx
  on mcp.upload_tickets (expires_at) where consumed_at is null;

-- Hanya service_role menyentuh jadual ini. RLS aktif tanpa sebarang polisi
-- bermakna anon dan authenticated tidak nampak apa-apa, iaitu yang kita mahu.
alter table mcp.upload_tickets enable row level security;

grant all on mcp.upload_tickets to service_role;

-- WAJIB. Tanpa ini PostgREST tidak nampak jadual baharu dan setiap panggilan
-- akan gagal dengan "Could not find the table in the schema cache".
notify pgrst, 'reload schema';
