# QuestMaster v2

Next.js 14 + TypeScript + Tailwind CSS + self-hosted Supabase rebuild of the QuestMaster Flutter scavenger-hunt app.

## Roles
- **Participant** — Home (XP bar, active hunt, achievements), Activities, Leaderboard, Submissions, Profile
- **Educator** — Activities (hunt cards + create wizard), Review (approve/reject), Teams, Rankings
- **Admin** — Overview (stats + activity feed), Users (search + list), Hunts

## Design
- Poppins font, purple (#9333EA) to blue (#2563EB) gradient
- Mobile-first (390x844), white cards with subtle shadows
- Quick Demo Login with role switcher

## Getting Started

```bash
npm install
cp .env.example .env.local   # edit with your Supabase keys
npm run dev                   # http://localhost:3000
```

## Database
Run `supabase/migrations/0001_init.sql` against your self-hosted Supabase Postgres.

## Deploy (VPS)
```bash
npm run build
pm2 start ecosystem.config.js
# Runs on port 3004, proxy via Nginx
```

## Stack
- Next.js 14 (App Router, src dir)
- TypeScript
- Tailwind CSS (Poppins, brand gradient)
- Supabase (self-hosted on Hostinger KVM 2)
- Lucide React icons
- PM2 process manager

## TODO: PWA icon rasterization

The brand mark lives at `public/logo-mark.svg` (icon) and `public/logo.svg`
(wordmark lockup). The Next.js App Router favicon is `src/app/icon.svg`.

Before production launch, regenerate these raster PWA icons from
`public/logo-mark.svg` (use `librsvg` / `rsvg-convert` or `imagemagick`):

- `public/icons/icon-192.png` (192x192)
- `public/icons/icon-512.png` (512x512)
- `public/icons/icon-maskable-512.png` (512x512, safe zone padding)
- `public/apple-touch-icon.png` (180x180)

Example:
```
rsvg-convert -w 192 -h 192 public/logo-mark.svg > public/icons/icon-192.png
rsvg-convert -w 512 -h 512 public/logo-mark.svg > public/icons/icon-512.png
```
