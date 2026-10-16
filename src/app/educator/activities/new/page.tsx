'use client';
/**
 * Borang cipta aktiviti baharu.
 *
 * KZ-022: rupa v3 (PageHead, Card, Field, Alert, Button); keadaan, fungsi
 * submit dan laluan selepas cipta tidak berubah.
 */
import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, Check, Info } from 'lucide-react';
import { listMyClasses, createHuntInClass, updateQuestDetails, type Klass } from '@/lib/data';
import Shell from '@/components/Shell';
import { EDU_TABS } from '@/lib/eduTabs';
import {
  Alert,
  Button,
  Card,
  Field,
  Input,
  PageHead,
  Select,
  Textarea,
} from '@/components/ui';

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [classes, setClasses] = useState<Klass[]>([]);
  const [classId, setClassId] = useState<string>(sp.get('classId') || "");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [status, setStatus] = useState<'draft'|'active'|'archived'>('draft');
  const [instructions, setInstructions] = useState("");
  const [link1, setLink1] = useState("");
  const [link2, setLink2] = useState("");
  const [submissionLink, setSubmissionLink] = useState("");
  const [points, setPoints] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    listMyClasses().then(cs => { setClasses(cs); if (!classId && cs[0]) setClassId(cs[0].id); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const submit = async () => {
    if (!title.trim()) { setErr("Title required"); return; }
    if (!classId) { setErr("Please select a class"); return; }
    setBusy(true); setErr(null);
    try {
      const hunt = await createHuntInClass(classId, title.trim(), desc.trim());
      await updateQuestDetails(hunt.id, {
        description: desc.trim() || null,
        status,
        instructions: instructions.trim() || null,
        link1: link1.trim() || null,
        link2: link2.trim() || null,
        submission_link: submissionLink.trim() || null,
        points: Number(points) || 0,
      });
      router.push(`/educator/activities/${hunt.id}`);
    } catch (e: unknown) { setErr(e instanceof Error ? e.message : "Failed to create activity"); setBusy(false); }
  };
  return (
    <div className="max-w-2xl">
      <PageHead
        title="Create New Activity"
        description="Set the class, the basics, and where students hand in their work."
        secondaryActions={[{ label: "Back", icon: <ArrowLeft className="w-4 h-4" />, onSelect: () => router.back() }]}
      />

      {classes.length === 0 ? (
        <Card>
          <p className="text-[14px] text-ink-muted mb-4">You need to create a class first. Each activity belongs to a class.</p>
          <Button href="/educator/classes">Create a class</Button>
        </Card>
      ) : (
        <Card className="space-y-5">
          <Field label="Class" htmlFor="new-activity-class">
            <Select id="new-activity-class" value={classId} onChange={e => setClassId(e.target.value)}>
              {classes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
          <Field label="Title" htmlFor="new-activity-title">
            <Input id="new-activity-title" placeholder="Activity title" value={title} onChange={e => setTitle(e.target.value)} />
          </Field>
          <Field label="Status" htmlFor="new-activity-status">
            <Select id="new-activity-status" value={status} onChange={e => setStatus(e.target.value as 'draft'|'active'|'archived')}>
              <option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option>
            </Select>
          </Field>
          <Field label="Short description" htmlFor="new-activity-desc">
            <Input id="new-activity-desc" value={desc} onChange={e => setDesc(e.target.value)} />
          </Field>
          <Field label="Instructions" htmlFor="new-activity-instructions">
            <Textarea id="new-activity-instructions" placeholder="What teams need to do to complete this quest..." value={instructions} onChange={e => setInstructions(e.target.value)} />
          </Field>
          <Field label="Instruction Link 1 (any URL)" htmlFor="new-activity-link1">
            <Input id="new-activity-link1" value={link1} onChange={e => setLink1(e.target.value)} placeholder="https://drive.google.com/..." />
          </Field>
          <Field label="Instruction Link 2 (any URL)" htmlFor="new-activity-link2">
            <Input id="new-activity-link2" value={link2} onChange={e => setLink2(e.target.value)} placeholder="https://youtu.be/..." />
          </Field>
          <Alert tone="info" icon={<Info className="w-4 h-4" />}>
            Submission link (optional). When set, the activity board replaces team-column
            submissions with this link (Google Drive, Dropbox, Padlet, etc). Prefer students
            to post their work directly inside Kuizen? Leave this blank and create a Kuizen
            submission board from the manage page after you save this activity.
          </Alert>
          <Field label="Submission URL" htmlFor="new-activity-submission" note="Optional">
            <Input
              id="new-activity-submission"
              type="url"
              value={submissionLink}
              onChange={e => setSubmissionLink(e.target.value)}
              placeholder="https://drive.google.com/drive/folders/..."
            />
          </Field>
          <Field label="Completion points" htmlFor="new-activity-points" note="0 to 1000">
            <Input
              id="new-activity-points"
              type="number"
              min={0}
              max={1000}
              value={points}
              onChange={e => setPoints(e.target.value === "" ? "" : String(parseInt(e.target.value, 10)))}
            />
          </Field>
          {err && <p className="text-[14px] text-kz-down">{err}</p>}
          <Button disabled={busy} onClick={submit} className="w-full">
            <Check className="w-4 h-4" />{busy ? "Creating..." : "Create Activity"}
          </Button>
        </Card>
      )}
    </div>
  );
}

export default function NewHunt() {
  return <Shell tabs={EDU_TABS}><Suspense fallback={<div className="p-4 text-sm text-ink-faint">Loading...</div>}><Inner/></Suspense></Shell>;
}
