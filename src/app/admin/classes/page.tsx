"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListAllClasses, adminUpdateClass, adminDeleteClass, logAudit } from "@/lib/data";
import { Search, Pencil, Trash2, X, Save } from "lucide-react";
import { useConfirm } from '@/components/ui/ConfirmProvider';
export default function Page() {
  const [rows, setRows] = useState<any[]>([]);
  const confirm = useConfirm();
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState<any | null>(null);
  const reload = async () => setRows(await adminListAllClasses());
  useEffect(() => { reload(); }, []);
  const filtered = rows.filter(r => !q || (r.name||'').toLowerCase().includes(q.toLowerCase()) || (r.code||'').toLowerCase().includes(q.toLowerCase()));
  async function save() { if (!edit) return; await adminUpdateClass(edit.id, { name: edit.name, code: edit.code }); await logAudit('class_edit','class',edit.id,{}); setEdit(null); reload(); }
  async function remove(c: any) { if (!(await confirm({ title: `Delete class "${c.name}"?`, tone: 'danger' }))) return; await adminDeleteClass(c.id); await logAudit('class_delete','class',c.id,{ name: c.name }); reload(); }
  return (
    <Shell tabs={adminTabs}>
      <h2 className="font-bold text-lg mb-3">Classes</h2>
      <div className="relative mb-3"><Search className="absolute left-3 top-3 w-4 h-4 text-gray-400"/><input className="input pl-9" placeholder="Search classes..." value={q} onChange={e=>setQ(e.target.value)}/></div>
      <div className="space-y-2">{filtered.map(c => (
        <div key={c.id} className="card">
          <div className="flex justify-between items-center">
            <div><div className="font-semibold">{c.name}</div><div className="text-xs text-gray-500">code {c.code} · owner {(c.owner_id||'').slice(0,8)}</div></div>
            <div className="flex gap-2"><button onClick={()=>setEdit({...c})} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700 flex items-center gap-1"><Pencil className="w-3 h-3"/>Edit</button><button onClick={()=>remove(c)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700 flex items-center gap-1"><Trash2 className="w-3 h-3"/>Delete</button></div>
          </div>
        </div>))}</div>
      {edit && <div className="fixed inset-0 bg-black/40 flex items-end z-50" onClick={()=>setEdit(null)}>
        <div className="bg-white w-full rounded-t-2xl p-4" onClick={e=>e.stopPropagation()}>
          <div className="flex justify-between items-center mb-3"><h3 className="font-bold">Edit class</h3><button onClick={()=>setEdit(null)}><X className="w-5 h-5"/></button></div>
          <label className="text-xs text-gray-500">Name</label><input className="input mb-2" value={edit.name||''} onChange={e=>setEdit({...edit,name:e.target.value})}/>
          <label className="text-xs text-gray-500">Code</label><input className="input mb-3" value={edit.code||''} onChange={e=>setEdit({...edit,code:e.target.value})}/>
          <button onClick={save} className="w-full py-2 rounded-xl bg-black text-white flex items-center justify-center gap-1"><Save className="w-4 h-4"/>Save</button>
        </div></div>}
    </Shell>
  );
}
