"use client";

// Katalog dalaman kit UI (KZ-021). Hanya untuk semakan visual Boss dan
// pasukan: setiap komponen dipapar dengan data contoh yang JELAS
// berlabel "Sample" supaya tiada siapa sangka ini data sebenar.
//
// Halaman ini TIDAK dalam navigasi utama. Kawalan akses ikut AdminShell
// (profil bukan admin/superadmin dihantar ke "/"), sama seperti halaman
// admin lain; data sebenar kekal dilindungi RLS di pelayan.

import { useState, type ReactNode } from "react";
import {
  Search,
  Settings,
  Plus,
  Download,
  Mail,
  Eye,
  Trash2,
  CheckSquare,
  Inbox,
  ChevronRight,
  User as UserIcon,
  BookOpen,
  Award,
  Info,
  CheckCircle2,
  AlertTriangle,
  XCircle,
} from "lucide-react";
import AdminShell from "@/components/admin/AdminShell";
import {
  Alert,
  Avatar,
  AvatarGroup,
  Badge,
  BarChart,
  Button,
  Card,
  CardHead,
  CardLink,
  CardSection,
  DataTable,
  DataRow,
  DataSection,
  Dropdown,
  EmptyState,
  Field,
  Input,
  InitialTile,
  LineChart,
  Modal,
  PageHead,
  Pagination,
  PersonRow,
  ProgressBar,
  ProfileLayout,
  ProjectCard,
  ProjectGrid,
  Select,
  StatGroup,
  Tabs,
  Textarea,
  CheckRadio,
  TileRow,
  UserCard,
  WARNA_KIT,
  type DataColumn,
} from "@/components/ui";

/** Tajuk seksyen katalog dengan label "Sample" yang jelas. */
function Seksyen({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="mb-10">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div>
          <h2 className="text-[18px] font-bold text-ink">{title}</h2>
          {note && <p className="text-[13px] text-ink-faint">{note}</p>}
        </div>
        <Badge variant="dim" warna="purple">Sample</Badge>
      </div>
      {children}
    </section>
  );
}

type BarisContoh = {
  id: string;
  nama: string;
  sub: string;
  emel: string;
  jumlah: string;
  status: "Active" | "Pending" | "Suspend";
  logMasuk: string;
};

const BARIS_CONTOH: BarisContoh[] = [
  { id: "u1", nama: "Aisyah Rahman", sub: "Class 5 Bestari", emel: "aisyah@example.com", jumlah: "1,240", status: "Active", logMasuk: "2 min ago" },
  { id: "u2", nama: "Danish Hakim", sub: "Class 5 Bestari", emel: "danish@example.com", jumlah: "980", status: "Pending", logMasuk: "1 hour ago" },
  { id: "u3", nama: "Nurul Izzah", sub: "Class 4 Cekap", emel: "izzah@example.com", jumlah: "870", status: "Active", logMasuk: "Yesterday" },
  { id: "u4", nama: "Farid Zulkifli", sub: "Class 6 Amanah", emel: "farid@example.com", jumlah: "655", status: "Suspend", logMasuk: "3 days ago" },
  { id: "u5", nama: "Mei Ling Tan", sub: "Class 4 Cekap", emel: "meiling@example.com", jumlah: "1,020", status: "Active", logMasuk: "Just now" },
  { id: "u6", nama: "Aiman Solehah", sub: "Class 5 Bestari", emel: "aiman@example.com", jumlah: "430", status: "Pending", logMasuk: "Last week" },
  { id: "u7", nama: "Sofia Amina", sub: "Class 6 Amanah", emel: "sofia@example.com", jumlah: "720", status: "Active", logMasuk: "2 hours ago" },
  { id: "u8", nama: "Haikal Yusri", sub: "Class 4 Cekap", emel: "haikal@example.com", jumlah: "310", status: "Active", logMasuk: "4 days ago" },
  { id: "u9", nama: "Liyana Zahra", sub: "Class 5 Bestari", emel: "liyana@example.com", jumlah: "1,120", status: "Active", logMasuk: "10 min ago" },
  { id: "u10", nama: "Adam Firdaus", sub: "Class 6 Amanah", emel: "adam@example.com", jumlah: "540", status: "Suspend", logMasuk: "2 weeks ago" },
  { id: "u11", nama: "Balqis Nabilah", sub: "Class 4 Cekap", emel: "balqis@example.com", jumlah: "890", status: "Active", logMasuk: "1 hour ago" },
  { id: "u12", nama: "Zarif Iskandar", sub: "Class 5 Bestari", emel: "zarif@example.com", jumlah: "610", status: "Pending", logMasuk: "Yesterday" },
];

const STATUS_LENCANA: Record<BarisContoh["status"], { warna: "green" | "yellow" | "red"; variant: "dim" | "dot" }> = {
  Active: { warna: "green", variant: "dot" },
  Pending: { warna: "yellow", variant: "dim" },
  Suspend: { warna: "red", variant: "dim" },
};

export default function UiKitPage() {
  const [halaman, setHalaman] = useState(1);
  const [modal, setModal] = useState(false);
  const [dipilih, setDipilih] = useState<Set<string>>(new Set());
  const [cari, setCari] = useState("");
  const [penapis, setPenapis] = useState("all");

  const barisTapis = BARIS_CONTOH.filter(
    (r) =>
      (penapis === "all" || r.status.toLowerCase() === penapis) &&
      (cari === "" || r.nama.toLowerCase().includes(cari.toLowerCase())),
  );

  const lajur: DataColumn<BarisContoh>[] = [
    {
      key: "lead",
      header: "Student",
      render: (r, i) => (
        <span className="flex items-center gap-3 py-3">
          <Avatar name={r.nama} size="sm" index={i} />
          <span className="min-w-0">
            <span className="block text-[13px] font-bold text-ink truncate">{r.nama}</span>
            <span className="block text-[12px] text-ink-faint truncate">{r.sub}</span>
          </span>
        </span>
      ),
    },
    {
      key: "emel",
      header: "Email",
      hideOnMobile: true,
      render: (r) => <span className="text-[13px] text-ink-faint">{r.emel}</span>,
    },
    {
      key: "jumlah",
      header: "Points",
      render: (r) => <span className="text-[13px] font-medium text-ink">{r.jumlah}</span>,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => {
        const s = STATUS_LENCANA[r.status];
        return (
          <Badge variant={s.variant} warna={s.warna}>
            {r.status}
          </Badge>
        );
      },
    },
    {
      key: "log",
      header: "Last login",
      hideOnMobile: true,
      render: (r) => <span className="text-[13px] text-ink-faint">{r.logMasuk}</span>,
    },
  ];

  return (
    <AdminShell
      title="UI Kit Catalog"
      crumbs={[{ label: "Admin", href: "/admin/overview" }, { label: "UI Kit" }]}
    >
      <PageHead
        title="UI Kit Catalog"
        description="Every component of the Kuizen UI kit with clearly labelled sample data. Not part of the main navigation."
        secondaryActions={[
          { label: "Export", icon: <Download className="w-4 h-4" />, onSelect: () => {} },
        ]}
        primaryAction={{
          label: "New class",
          icon: <Plus className="w-4 h-4" />,
          onSelect: () => {},
        }}
      />

      {/* ===== PageHead varian breadcrumb ===== */}
      <Seksyen title="PageHead (breadcrumb)" note="Students / name with purple name, weight 400">
        <PageHead
          crumb="Students"
          name="Aisyah Rahman"
          description="You have total 20 Courses."
          secondaryActions={[{ label: "Message", icon: <Mail className="w-4 h-4" />, onSelect: () => {} }]}
          primaryAction={{ label: "Add student", icon: <Plus className="w-4 h-4" />, onSelect: () => {} }}
        />
      </Seksyen>

      {/* ===== Butang ===== */}
      <Seksyen title="Button" note="13px 700 ls 0.26px, height 36px, radius 4px; primary #854fff">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            <Button>Primary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="dim" warna="green">Dim green</Button>
            <Button variant="dim" warna="red">Dim red</Button>
            <Button variant="icon" ariaLabel="Settings"><Settings className="w-4 h-4" /></Button>
            <Button size="sm">Small</Button>
            <Button size="lg">Large 44px</Button>
            <Button href="/admin/overview">Link as button</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Card>
      </Seksyen>

      {/* ===== Kad ===== */}
      <Seksyen title="Card, CardHead, CardSection" note="White, radius 4px, no border, card shadow, padding 24px">
        <Card>
          <CardHead
            title="Top Classes"
            subtitle="Sample subtitle 13px"
            right={<CardLink href="/admin/classes">View All</CardLink>}
          />
          <CardSection baris>
            <TileRow title="Class 5 Bestari" subtitle="24 students" value="1,240" valueSub="pts" index={0} />
            <div className="border-t border-kz-line" />
            <TileRow title="Class 4 Cekap" subtitle="21 students" value="980" valueSub="pts" index={1} />
          </CardSection>
        </Card>
      </Seksyen>

      {/* ===== StatGroup ===== */}
      <Seksyen title="StatGroup" note="Label 14px body, number 28px, change with arrow only when data exists">
        <Card>
          <StatGroup
            stats={[
              { label: "Total Students", value: "2,893", change: 12 },
              { label: "Total Classes", value: "243" },
              { label: "Activities", value: "1,024", change: -3 },
              { label: "Points awarded", value: "184k" },
            ]}
          />
        </Card>
      </Seksyen>

      {/* ===== TileRow / PersonRow / Avatar ===== */}
      <Seksyen title="TileRow, InitialTile, PersonRow, Avatar, AvatarGroup" note="Tile 40px radius 4px; avatar round; palette by index">
        <Card>
          <div className="space-y-1">
            <TileRow title="Intro Quest" subtitle="12 challenges" value="1,240" valueSub="completions" index={2} />
            <TileRow title="Science Hunt" subtitle="8 challenges" value="980" valueSub="completions" index={3} />
            <PersonRow name="Puan Rosnah" subtitle="Educator" value="5 classes" index={4} />
            <PersonRow name="Encik Faizal" subtitle="Educator" value="3 classes" index={5} />
          </div>
          <div className="flex flex-wrap items-center gap-6 mt-6 border-t border-kz-line pt-6">
            <Avatar name="Aisyah Rahman" size="sm" />
            <Avatar name="Danish Hakim" size="md" />
            <Avatar name="Nurul Izzah" size="lg" />
            <AvatarGroup names={["Aisyah Rahman", "Danish Hakim", "Nurul Izzah", "Farid Zulkifli", "Mei Ling Tan", "Aiman Solehah", "Sofia Amina", "Haikal Yusri", "Liyana Zahra"]} max={5} />
            <div className="flex gap-2">
              <InitialTile name="Kuizen" />
              <InitialTile name="Sample Two" index={1} />
              <InitialTile name="Sample Three" index={2} />
            </div>
          </div>
        </Card>
      </Seksyen>

      {/* ===== Badge ===== */}
      <Seksyen title="Badge" note="10.8px 500, height 20px, radius 3px; solid / dim / dot">
        <Card>
          <div className="flex flex-wrap items-center gap-3">
            {(Object.keys(WARNA_KIT) as (keyof typeof WARNA_KIT)[]).map((w) => (
              <Badge key={w} variant="solid" warna={w}>
                Solid {w}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            {(Object.keys(WARNA_KIT) as (keyof typeof WARNA_KIT)[]).map((w) => (
              <Badge key={w} variant="dim" warna={w}>
                Dim {w}
              </Badge>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-4 mt-4">
            <Badge variant="dot" warna="green">Active</Badge>
            <Badge variant="dot" warna="yellow">Pending</Badge>
            <Badge variant="dot" warna="red">Suspended</Badge>
            <Badge variant="dot" warna="blue">Blue</Badge>
          </div>
        </Card>
      </Seksyen>

      {/* ===== ProgressBar ===== */}
      <Seksyen title="ProgressBar" note="Height 6px, track #e5e9f2, full radius">
        <Card className="space-y-5">
          <ProgressBar value={72} max={100} label="Sample progress purple" />
          <ProgressBar value={45} max={100} warna="green" label="Sample progress green" />
          <ProgressBar value={20} max={100} warna="yellow" label="Sample progress yellow" />
        </Card>
      </Seksyen>

      {/* ===== Tabs ===== */}
      <Seksyen title="Tabs" note="14px 700, active #854fff with 3px underline, gap 32px, base line #dbdfea; state tabs render buttons; `aktif` overrides path matching on link tabs (KZ-022b)">
        <Card>
          <Tabs
            items={[
              { label: "Overview", href: "/admin/overview" },
              { label: "Users", href: "/admin/users" },
              { label: "Classes", href: "/admin/classes", match: ["/admin/classes", "/admin/ui-kit"] },
              { label: "Settings", href: "/admin/settings" },
            ]}
          />
        </Card>
        <Card className="mt-4">
          <Tabs
            items={[
              { label: "Sample state tab A", onSelect: () => {}, aktif: true },
              { label: "Sample state tab B", onSelect: () => {} },
            ]}
          />
        </Card>
        <Card className="mt-4">
          <Tabs
            items={[
              { label: "Sample link tab A", href: "/admin/overview", aktif: true },
              { label: "Sample link tab B", href: "/admin/overview", aktif: false },
            ]}
          />
          <p className="text-[12px] text-ink-faint mt-3">
            Link tabs can pass `aktif` to force the active state instead of path matching (used by ClassShell).
          </p>
        </Card>
      </Seksyen>

      {/* ===== DataTable ===== */}
      <Seksyen title="DataTable" note="Head 13px soft on #ebeef2, rows with separators, status badges, actions menu, custom pagination; less important columns hidden on phone">
        <DataTable
          label="Sample students table"
          columns={lajur}
          rows={barisTapis}
          rowKey={(r) => r.id}
          selectable
          selectedIds={dipilih}
          onToggleSelect={(id) =>
            setDipilih((s) => {
              const n = new Set(s);
              if (n.has(id)) n.delete(id);
              else n.add(id);
              return n;
            })
          }
          onToggleAll={(semua) =>
            setDipilih(semua ? new Set(BARIS_CONTOH.map((r) => r.id)) : new Set())
          }
          menuItems={() => [
            { label: "View profile", icon: <Eye className="w-4 h-4" />, onSelect: () => {} },
            { label: "Message", icon: <Mail className="w-4 h-4" />, onSelect: () => {} },
            { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onSelect: () => {}, danger: true },
          ]}
          menuLabel="Row actions"
          head={
            <>
              <span className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-faint pointer-events-none" />
                <input
                  value={cari}
                  onChange={(e) => {
                    setCari(e.target.value);
                    setHalaman(1);
                  }}
                  placeholder="Search by name"
                  aria-label="Search sample table"
                  className="h-9 w-56 rounded-[6px] border border-hairline bg-white pl-9 pr-3 text-[13px] outline-none focus:border-brand-purple"
                />
              </span>
              <Select value={penapis} onChange={(e) => { setPenapis(e.target.value); setHalaman(1); }} aria-label="Filter status" className="w-40">
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="pending">Pending</option>
                <option value="suspend">Suspend</option>
              </Select>
              <Button variant="icon" ariaLabel="Table settings"><Settings className="w-4 h-4" /></Button>
            </>
          }
          halaman={halaman}
          saizHalaman={6}
          onHalaman={setHalaman}
          onRowClick={() => {}}
          renderRowExtra={(r) =>
            r.status === "Suspend" ? (
              <p className="text-[12px] text-ink-faint py-2">Sample expanded row for {r.nama}.</p>
            ) : null
          }
          empty={<EmptyState icon={<Inbox className="w-6 h-6" />} title="No students found" text="Try a different search or filter." />}
        />
      </Seksyen>

      {/* ===== Pagination berasingan ===== */}
      <Seksyen title="Pagination" note="36px boxes with #e5e9f2 border, Prev 1 2 ... 6 7 Next">
        <Card>
          <Pagination halaman={halaman} jumlah={7} onHalaman={setHalaman} />
        </Card>
      </Seksyen>

      {/* ===== ProjectCard ===== */}
      <Seksyen title="ProjectCard" note="For activities/quests; grid 3 desktop / 2 tablet / 1 phone, 28px gap">
        <ProjectGrid>
          <ProjectCard
            title="Intro Quest"
            subtitle="Class 5 Bestari"
            description="Sample activity description that is long enough to wrap to exactly two lines so the clamp can be reviewed."
            tasksDone={8}
            tasksTotal={12}
            members={["Aisyah Rahman", "Danish Hakim", "Nurul Izzah", "Farid Zulkifli", "Mei Ling Tan"]}
            daysLeft={5}
            menuItems={[{ label: "Open", icon: <Eye className="w-4 h-4" />, onSelect: () => {} }]}
          />
          <ProjectCard
            title="Science Hunt"
            subtitle="Class 4 Cekap"
            description="Sample activity due very soon."
            tasksDone={3}
            tasksTotal={8}
            members={["Aiman Solehah", "Sofia Amina"]}
            daysLeft={1}
            badges={
              <>
                <Badge variant="dim" warna="purple">100 pts</Badge>
                <Badge variant="dot" warna="green">Active</Badge>
              </>
            }
          />
          <ProjectCard
            title="History Trail"
            subtitle="Class 6 Amanah"
            description="Sample completed activity."
            tasksDone={10}
            tasksTotal={10}
            members={["Haikal Yusri", "Liyana Zahra", "Adam Firdaus"]}
            done
          />
        </ProjectGrid>
      </Seksyen>

      {/* ===== UserCard ===== */}
      <Seksyen title="UserCard" note="Large centered avatar, name, sub, small button, 3-column stats">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-7 max-w-3xl">
          <UserCard
            name="Aisyah Rahman"
            subtitle="Student"
            actionLabel="View profile"
            index={0}
            stats={[
              { label: "Points", value: "1,240" },
              { label: "Quests", value: "12" },
              { label: "Badges", value: "4" },
            ]}
          />
        </div>
      </Seksyen>

      {/* ===== ProfileLayout ===== */}
      <Seksyen title="ProfileLayout, ProfileMenu, DataSection, DataRow" note="One card split: left 290px (avatar, stats, menu, last login), right content; left becomes a drawer on phone">
        <ProfileLayout
          name="Aisyah Rahman"
          subtitle="Student · Class 5 Bestari"
          menuMoreItems={[{ label: "Copy link", onSelect: () => {} }]}
          stats={[
            { label: "Points", value: "1,240" },
            { label: "Rank", value: "#3" },
            { label: "Quests", value: "12" },
            { label: "Certificates", value: "2" },
          ]}
          menu={[
            { label: "Overview", href: "/admin/users", icon: <UserIcon className="w-[18px] h-[18px]" />, match: ["/admin/ui-kit"] },
            { label: "Learning", href: "/admin/classes", icon: <BookOpen className="w-[18px] h-[18px]" /> },
            { label: "Certificates", href: "/admin/certificates", icon: <Award className="w-[18px] h-[18px]" /> },
          ]}
          lastLogin="Today, 09:14 AM"
        >
          <h3 className="text-[24px] font-bold text-ink">Personal Information</h3>
          <p className="text-[14px] text-ink-faint mt-1">
            Sample profile page layout. Basic information section below.
          </p>
          <div className="mt-6 space-y-8">
            <DataSection title="Basics">
              <DataRow label="Full name" value="Aisyah binti Rahman" actionLabel="Change" onAction={() => {}} />
              <DataRow label="Class" value="Class 5 Bestari" />
              <DataRow label="Email" value="aisyah@example.com" actionLabel="Change" onAction={() => {}} />
              <DataRow label="Joined" value="12 Aug 2026" />
            </DataSection>
            <DataSection title="Account">
              <DataRow label="Role" value="Student" />
              <DataRow label="Status" value="Active" actionLabel="Suspend" onAction={() => {}} />
            </DataSection>
          </div>
        </ProfileLayout>
      </Seksyen>

      {/* ===== Borang ===== */}
      <Seksyen title="Field, Input, Select, Textarea, checkbox" note="Label 14px 500 #344357 with right link; input 36px (lg 44px); focus ring rgba(133,79,255,.1)">
        <Card className="max-w-xl space-y-6">
          <Field label="Email" htmlFor="sample-email" linkLabel="Forgot?" linkHref="/forgot-password" note="Sample note 12px soft">
            <Input id="sample-email" placeholder="you@example.com" lg ikonKiri={<Mail className="w-4 h-4" />} />
          </Field>
          <Field label="Class" htmlFor="sample-class">
            <Select id="sample-class" defaultValue="5b">
              <option value="5b">Class 5 Bestari</option>
              <option value="4c">Class 4 Cekap</option>
            </Select>
          </Field>
          <Field label="Bio" htmlFor="sample-bio" error="Sample error message">
            <Textarea id="sample-bio" placeholder="Tell us about yourself" ralat />
          </Field>
          <div className="flex flex-wrap gap-6">
            <CheckRadio label="Sample checkbox" type="checkbox" defaultChecked />
            <CheckRadio label="Sample radio" type="radio" name="sample-radio" defaultChecked />
          </div>
        </Card>
      </Seksyen>

      {/* ===== Alert ===== */}
      <Seksyen title="Alert" note="14px, padding 16px 20px (52px left with icon), radius 4px">
        <div className="space-y-3">
          <Alert tone="info" icon={<Info className="w-4 h-4" />}>Sample info alert with the exact info palette from the design system.</Alert>
          <Alert tone="success" icon={<CheckCircle2 className="w-4 h-4" />}>Sample success alert.</Alert>
          <Alert tone="warning" icon={<AlertTriangle className="w-4 h-4" />}>Sample warning alert.</Alert>
          <Alert tone="danger" icon={<XCircle className="w-4 h-4" />}>Sample danger alert.</Alert>
        </div>
      </Seksyen>

      {/* ===== Dropdown ===== */}
      <Seksyen title="Dropdown" note="White, radius 4px, dropdown shadow, items 13px 500 padding 9px 20px, icon 16px left; keyboard accessible, Escape and outside click close it">
        <Card>
          <div className="flex flex-wrap gap-3">
            <Dropdown
              items={[
                { label: "View", icon: <Eye className="w-4 h-4" />, onSelect: () => {} },
                { label: "Message", icon: <Mail className="w-4 h-4" />, onSelect: () => {} },
                { label: "Delete", icon: <Trash2 className="w-4 h-4" />, onSelect: () => {}, danger: true },
              ]}
              label="Sample dropdown"
              trigger={({ open, toggle }) => (
                <Button variant="outline" onClick={toggle} ariaLabel="Open sample dropdown">
                  {open ? "Close menu" : "Open menu"} <ChevronRight className="w-4 h-4 rotate-90" />
                </Button>
              )}
            />
          </div>
        </Card>
      </Seksyen>

      {/* ===== Modal ===== */}
      <Seksyen title="Modal" note="Radius 5px, head 18px 700 with icon close, body padding 28px (40px desktop), focus trapped, Escape closes">
        <Card>
          <Button onClick={() => setModal(true)}>Open sample modal</Button>
        </Card>
        <Modal
          open={modal}
          onClose={() => setModal(false)}
          title="Sample modal"
          footer={
            <>
              <Button variant="outline" onClick={() => setModal(false)}>Cancel</Button>
              <Button onClick={() => setModal(false)}>Save</Button>
            </>
          }
        >
          <p className="text-[14px] text-ink-muted">
            Sample modal body. Press Escape or click outside to close; Tab stays trapped inside.
          </p>
        </Modal>
      </Seksyen>

      {/* ===== EmptyState ===== */}
      <Seksyen title="EmptyState" note="Round 64px icon on dim background, title 16px 700, text 14px soft, primary button">
        <Card>
          <EmptyState
            icon={<CheckSquare className="w-6 h-6" />}
            title="No activities yet"
            text="Sample empty state. Create your first activity to get started."
            actionLabel="Create activity"
            href="/admin/hunts"
          />
        </Card>
      </Seksyen>

      {/* ===== Carta ===== */}
      <Seksyen title="BarChart and LineChart" note="SVG only, no library; bars #e5e9ff with highlight #6576ff, line #798bff, soft purple area, axis 11px soft">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-7">
          <Card>
            <CardHead title="Enrollment by month" subtitle="Sample bar chart" />
            <BarChart
              labelAks="Sample enrollment by month bar chart"
              aktif={2}
              data={[
                { label: "Jan", nilai: 320 },
                { label: "Feb", nilai: 410 },
                { label: "Mar", nilai: 280 },
                { label: "Apr", nilai: 520 },
                { label: "May", nilai: 460 },
                { label: "Jun", nilai: 380 },
              ]}
            />
          </Card>
          <Card>
            <CardHead title="Weekly activity" subtitle="Sample line chart" />
            <LineChart
              labelAks="Sample weekly activity line chart"
              data={[
                { label: "Mon", nilai: 120 },
                { label: "Tue", nilai: 180 },
                { label: "Wed", nilai: 140 },
                { label: "Thu", nilai: 220 },
                { label: "Fri", nilai: 300 },
                { label: "Sat", nilai: 260 },
                { label: "Sun", nilai: 190 },
              ]}
            />
          </Card>
        </div>
      </Seksyen>

      <p className="text-[13px] text-ink-faint">
        End of catalog. Every section above uses clearly labelled sample data only.
      </p>
    </AdminShell>
  );
}
