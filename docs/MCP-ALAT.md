# Alat MCP Kuizen

Pelayan MCP berada di `https://kuizen.fun/api/mcp` (OAuth 2.1). Alat yang
tersedia bergantung pada peranan pengguna: `ALL` = admin, educator dan
participant; `STAFF` = admin dan educator sahaja. Alat bertanda `write: true`
memerlukan skop `kuizen:write` pada token.

Semua tulisan memanggil route API aplikasi sendiri sebagai pengguna, jadi
semakan pemilikan, peranan dan had pelan dijalankan oleh route dan pangkalan
data, bukan disalin ke dalam alat. Ralat (contohnya had pelan percuma) datang
daripada route itu sendiri.

## Umum

| Alat | Peranan | Kegunaan |
|---|---|---|
| whoami | ALL | Identiti, peranan, skop. Panggil dahulu jika tidak pasti. |
| search | ALL | Cari kelas, hunt dan board mengikut teks. |
| fetch | ALL | Ambil satu rekod penuh menggunakan id berprefiks. |

## Kelas, hunt dan challenge

| Alat | Peranan | Kegunaan |
|---|---|---|
| list_classes | ALL | Senarai kelas yang boleh dilihat pengguna. |
| get_class | ALL | Satu kelas dengan kiraan hunt, board, educator, ahli. |
| create_class | STAFF, tulis | Cipta kelas beserta board. |
| list_hunts | ALL | Senarai hunt dalam kelas. |
| create_hunt | STAFF, tulis | Cipta hunt. |
| update_hunt | STAFF, tulis | Kemas kini medan hunt. |
| list_challenges | ALL | Soalan dalam hunt; kunci jawapan untuk staf sahaja. |
| create_challenge | STAFF, tulis | Tambah challenge. |
| list_submissions | ALL | Penghantaran, boleh ditapis. |
| get_submission | ALL | Satu penghantaran penuh. |
| review_submission | STAFF, tulis | Tetapkan status penghantaran. |
| class_progress_report | STAFF | Ringkasan agregat kelas. |
| list_members | STAFF | Peserta kelas. |

## Board pembelajaran

| Alat | Peranan | Kegunaan |
|---|---|---|
| list_boards | ALL | Board dalam kelas. |
| get_board | ALL | Lajur dan kad, mengikut kedudukan. |
| create_board_card | ALL, tulis | Kad baharu; position dikira oleh route. |
| update_board_card | ALL, tulis | Kemas kini kad (body snake_case). |
| update_board | STAFF, tulis | Tajuk, penerangan, terbitan board. |
| create_board_column | STAFF, tulis | Lajur baharu. |
| upload_board_file | ALL, tulis | source_url atau content_base64 (had 16 KB). |
| create_upload_ticket | ALL, tulis | URL PUT bertandatangan untuk fail komputer. |
| finalize_upload | ALL, tulis | Sahkan fail sampai, dapat file_code. |

## Live Quiz (Kuiz Langsung)

Semua alat Live Quiz adalah untuk educator dan admin (STAFF). Kuiz boleh
peribadi (tanpa class_id) atau dikongsi dengan kelas.

### Baca (tiada tulisan)

| Alat | Kegunaan |
|---|---|
| list_live_quizzes | Senarai kuiz yang boleh dihoskan pengguna, dengan bilangan soalan. Argumen limit dihormati (lalai 50, maksimum 200). |
| get_live_quiz | Satu kuiz dengan semua soalan, pilihan dan kunci jawapan. |
| get_live_session | Keadaan penuh sesi dari sudut hos: status, kod, pautan sertai, pautan QR, pemain, soalan semasa, taburan jawapan. |
| get_live_leaderboard | Kedudukan dan markah sesi (semasa atau selesai), 20 teratas. |

### Tulis

| Alat | Kegunaan | Nota |
|---|---|---|
| create_live_quiz | Cipta kuiz. | class_id pilihan; streak_bonus pilihan (lalai true). |
| add_live_questions | Tambah satu atau banyak soalan. | options [{key,text}] atau option_texts; points 1..10000, time_limit_sec 5..300; semua disahkan dahulu, satu gagal bermakna tiada yang ditambah; maksimum 100 setiap panggilan. |
| import_live_questions | Import CSV atau Aiken daripada teks. | mode preview (tiada tulisan) dan mode commit; CSV semua-atau-tiada, Aiken melangkau blok rosak; had 500 KB. |
| update_live_question | Kemas kini medan soalan. | Hanya medan yang diberi. |
| delete_live_question | Padam soalan. | WAJIB confirm: true. |
| start_live_session | Cipta sesi dalam lobi. | Kuiz perlu sekurang-kurangnya satu soalan; pulangkan kod, pautan sertai dan pautan QR. |
| control_live_session | Kawal sesi. | action: start, next, reveal, end, reset; end dan reset WAJIB confirm: true (reset memadam semua jawapan sesi). |

Aliran biasa satu sesi dari Claude:

1. `create_live_quiz` atau gunakan kuiz sedia ada daripada `list_live_quizzes`.
2. `add_live_questions` atau `import_live_questions` (preview dahulu, kemudian commit).
3. `start_live_session` untuk dapat kod dan QR; kongsikan pautan kepada pemain.
4. `control_live_session` dengan action `start`, kemudian `reveal` dan `next`
   untuk setiap soalan; pantau dengan `get_live_session` dan
   `get_live_leaderboard`.
5. `control_live_session` dengan action `end` dan `confirm: true` untuk tamat.

Had pelan dikuatkuasakan oleh pangkalan data: had kuiz milikan (pencetus pada
`qm_live_quizzes`) dan had pemain sesi (`max_live_players`, dipetik pada masa
sesi dicipta). Ralat daripada had itu dihantar balik seperti sedia ada.

## Penilaian rakan (peer review)

Semua alat penilaian rakan adalah untuk educator dan admin (STAFF) dan perlu
class_id serta round_id. Semua tulisan melalui route
`/api/classes/[id]/peer-rounds/**`, jadi semakan pendidik kelas dijalankan
oleh route. Had enam pusingan dan sekatan pelan dikuatkuasakan oleh
pangkalan data; ralatnya dihantar balik seperti sedia ada.

| Alat | Peranan | Kegunaan |
|---|---|---|
| list_peer_rounds | STAFF | Senarai pusingan satu kelas: nama, jenis, minggu, tarikh buka/tutup, tarikh pengiraan. |
| create_peer_round | STAFF, tulis | Cipta pusingan formatif: name, opens_at, closes_at, week pilihan 1..52. |
| update_peer_round | STAFF, tulis | Sunting nama, minggu atau tarikh; hanya medan yang diberi. |
| compute_peer_round | STAFF, tulis | Jalankan pengiraan keputusan (RPC qm_peer_compute); pulangkan written. |
| get_peer_results | STAFF | Keputusan pelajar, justifikasi tanpa nama penilai, senarai belum menghantar. |
| delete_peer_round | STAFF, tulis | Padam pusingan; gagal 409 jika sudah ada penilaian. WAJIB confirm: true. |

Keprivasian terpelihara: nama penilai tidak pernah keluar daripada sistem
(ralat ialah reka bentuk laluan results, bukan tapisan alat).

## Jemputan pendidik

| Alat | Peranan | Kegunaan |
|---|---|---|
| invite_educator | STAFF, tulis | Jemput pendidik (co-educator) ke kelas melalui emel. Pemilik kelas sahaja. send_email: true menghantar emel jemputan; jika emel gagal, jemputan tetap wujud dan ralat dilaporkan dalam email_error. |

Senarai, hantar semula atau batal jemputan pendidik tiada laluannya di
aplikasi, jadi tidak disokong oleh alat MCP. Google Form tiada ciri di
platform, jadi tiada alatnya.

## Status kelas

- `set_class_status` (educator, admin): `class_id`, `status` = `active` | `ended` | `archived`, `confirm: true` untuk ended dan archived. ended menyekat hantaran dan penyertaan baharu; archived turut menyembunyikan kelas daripada `list_classes`.
- `list_classes` dan `get_class` kini memulangkan medan `status` terbitan.
- `update_class` (educator, admin): `class_id` dan sekurang-kurangnya satu daripada `name`, `description` (rentetan kosong mengosongkan), `color` (#RRGGBB).

## Sijil

| Alat | Peranan | Kegunaan |
|---|---|---|
| create_certificate_template | STAFF, tulis | Cipta templat sijil kelas. criteria.type: all_members, hunt_completed (perlu hunt_id), min_score (min_score, pilihan hunt_id) atau live_attended (perlu quiz_id). |
| issue_certificates | STAFF, tulis | Tanpa confirm: pratonton kelayakan (nama, layak, sebab, sudah dikeluarkan). Dengan confirm: true: keluarkan sijil sebenar kepada participant_ids yang diberi, atau semua yang layak jika tiada senarai. Fungsi pelayan yang sama dengan laluan API. |
| list_certificates | STAFF, baca | Senarai sijil kelas: kod, nama, program, tarikh, status, sebab pembatalan dan emailed_at. |
| revoke_certificate | STAFF, tulis | Batalkan sijil dengan sebab (wajib). Halaman awam /sijil/<kod> menunjukkan Dibatalkan. |

Muat naik imej latar dan logo templat tiada laluannya dalam alat MCP; ia
dibuat melalui UI pendidik (bucket certificate-assets). Emel pukal sijil
juga hanya melalui UI pendidik.
