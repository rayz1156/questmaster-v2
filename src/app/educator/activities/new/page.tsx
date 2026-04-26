"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Check } from "lucide-react";
export default function NewHunt() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const steps = ["Basic Info", "Schedule", "Team Settings", "Review"];
  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto">
      <div className="bg-brand-gradient text-white p-5 rounded-b-3xl">
        <button onClick={()=>router.back()} className="mb-2 flex items-center gap-1 text-sm opacity-90"><ArrowLeft className="w-4 h-4"/>Back</button>
        <h1 className="text-xl font-bold">Create New Hunt</h1>
        <div className="flex gap-1 mt-3">{steps.map((_,i)=><div key={i} className={`h-1 flex-1 rounded-full ${i<=step?"bg-white":"bg-white/30"}`}/>)}</div>
        <div className="text-sm mt-1 opacity-90">Step {step+1}: {steps[step]}</div>
      </div>
      <div className="p-4">
        {step===0 && <div className="space-y-3"><input className="input" placeholder="Hunt name" /><input className="input" placeholder="Theme" /><textarea className="input min-h-[80px]" placeholder="Description" /><input className="input" placeholder="Location" /></div>}
        {step===1 && <div className="space-y-3"><label className="text-sm font-semibold">Start Date</label><input type="datetime-local" className="input"/><label className="text-sm font-semibold">End Date</label><input type="datetime-local" className="input"/></div>}
        {step===2 && <div className="space-y-3"><label className="text-sm font-semibold">Team Size</label><input type="number" className="input" defaultValue={4}/><label className="text-sm font-semibold">Max Teams</label><input type="number" className="input" defaultValue={10}/></div>}
        {step===3 && <div className="card"><h3 className="font-semibold mb-2">Ready to create!</h3><p className="text-sm text-gray-500">Review your settings and create the hunt.</p></div>}
        <div className="flex gap-3 mt-6">
          {step>0 && <button onClick={()=>setStep(s=>s-1)} className="flex-1 py-3 rounded-xl border border-gray-300 font-semibold">Back</button>}
          <button onClick={()=>step<3?setStep(s=>s+1):router.push("/educator/activities")} className="btn-primary flex-1 flex items-center justify-center gap-1">
            {step<3?<>Next <ArrowRight className="w-4 h-4"/></>:<>Create <Check className="w-4 h-4"/></>}
          </button>
        </div>
      </div>
    </div>
  );
}
