"use client";
import Shell from "@/components/Shell";
import { adminTabs } from "@/lib/adminTabs";
import { useEffect, useState } from "react";
import { adminListAllHunts, adminUpdateHunt, deleteHunt, logAudit, type Hunt, adminListAllTeams, listQuestCompletions, markTeamCompletion, unmarkTeamCompletion, type QuestCompletion } from "@/lib/data";
import { ChevronDown, ChevronRight, CheckCircle, Circle } from "lucide-react";

export default function Page() {
  const [hunts, setHunts] = useState<Hunt[]>([]);
  const [expandedHunt, setExpandedHunt] = useState<string | null>(null);
  const [teams, setTeams] = useState<any[]>([]);
  const [completions, setCompletions] = useState<QuestCompletion[]>([]);
  const [toggling, setToggling] = useState("");
  const reload = async () => setHunts(await adminListAllHunts());
  useEffect(() => { reload(); }, []);

  const setStatus = async (h: Hunt, status: "draft"|"active"|"archived") => {
    await adminUpdateHunt(h.id, { status }); await logAudit("hunt_status", "hunt", h.id, { status }); reload();
  };
  const remove = async (h: Hunt) => {
    if (!confirm(`Delete "${h.title}"? This cannot be undone.`)) return;
    await deleteHunt(h.id); await logAudit("hunt_delete", "hunt", h.id, { title: h.title }); reload();
  };

  const toggleExpand = async (huntId: string) => {
    if (expandedHunt === huntId) { setExpandedHunt(null); return; }
    setExpandedHunt(huntId);
    const [t, c] = await Promise.all([adminListAllTeams(), listQuestCompletions(huntId)]);
    setTeams(t); setCompletions(c);
  };

  const toggleCompletion = async (huntId: string, teamId: string, isDone: boolean) => {
    setToggling(teamId);
    try {
      if (isDone) await unmarkTeamCompletion(huntId, teamId);
      else await markTeamCompletion(huntId, teamId);
      setCompletions(await listQuestCompletions(huntId));
    } catch {} finally { setToggling(""); }
  };

  return (
    <Shell tabs={adminTabs}>
      <h2 className="font-bold text-lg mb-3">All Quests</h2>
      <div className="space-y-2">{hunts.map(h => {
        const isDone = (tid: string) => completions.some(c => c.team_id === tid);
        return (
          <div key={h.id} className="card">
            <div className="flex justify-between items-start">
              <div><div className="font-semibold">{h.title}</div>
                <div className="text-xs text-gray-500">{h.description}</div>
                <div className="text-xs text-gray-400 mt-1">code <code className="font-mono bg-gray-100 px-1 rounded">{h.invite_code}</code> · owner {h.owner_id.slice(0,8)}</div>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full ${h.status==="active"?"bg-green-100 text-green-700":h.status==="draft"?"bg-gray-100":"bg-blue-100 text-blue-700"}`}>{h.status}</span>
            </div>
            <div className="flex gap-2 mt-2">
              {h.status !== "active" && <button onClick={()=>setStatus(h,"active")} className="text-xs px-2 py-1 rounded bg-green-100 text-green-700">Force-publish</button>}
              {h.status !== "archived" && <button onClick={()=>setStatus(h,"archived")} className="text-xs px-2 py-1 rounded bg-blue-100 text-blue-700">Archive</button>}
              <button onClick={()=>toggleExpand(h.id)} className="text-xs px-2 py-1 rounded bg-purple-100 text-purple-700 flex items-center gap-1">
                {expandedHunt===h.id ? <ChevronDown className="w-3 h-3"/> : <ChevronRight className="w-3 h-3"/>} Completions
              </button>
              <button onClick={()=>remove(h)} className="text-xs px-2 py-1 rounded bg-red-100 text-red-700">Delete</button>
            </div>
            {expandedHunt === h.id && (
              <div className="mt-3 pt-3 border-t space-y-1">
                <div className="text-xs font-semibold text-gray-500 mb-2">Team Quest Completions</div>
                {teams.length === 0 ? <div className="text-xs text-gray-400">No teams yet.</div> :
                  teams.map(t => {
                    const done = isDone(t.id);
                    return (
                      <div key={t.id} className={`flex items-center gap-2 p-2 rounded-lg cursor-pointer transition ${done ? "bg-green-50" : "bg-gray-50 hover:bg-gray-100"}`}
                        onClick={() => toggleCompletion(h.id, t.id, done)}>
                        {toggling===t.id ? <div className="w-4 h-4 rounded-full border-2 border-gray-300 border-t-purple-600 animate-spin"/> :
                          done ? <CheckCircle className="w-4 h-4 text-green-600"/> : <Circle className="w-4 h-4 text-gray-300"/>}
                        <span className={`text-sm ${done ? "text-green-700 font-medium" : "text-gray-600"}`}>{t.name}</span>
                        {done && <span className="text-xs text-green-500 ml-auto">✓ Complete</span>}
                      </div>
                    );
                  })
                }
              </div>
            )}
          </div>
        );
      })}</div>
    </Shell>
  );
}
