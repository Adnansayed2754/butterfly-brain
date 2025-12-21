"use client";
import React, { useState, useMemo } from 'react';
import ReactFlow, { 
  Background, Controls, useNodesState, useEdgesState, Handle, Position
} from 'reactflow';
import 'reactflow/dist/style.css';

// 🔴 CONNECT TO VERCEL BACKEND
const CLOUD_BRAIN_URL = "/api"; 

// --- NODE COMPONENTS ---
const ResourceNode = ({ data }: any) => {
  return (
    <div className="relative flex flex-col items-center justify-center w-80 h-40 group cursor-pointer">
       <h1 className={`font-black text-5xl tracking-tighter uppercase transition-all duration-300 select-none drop-shadow-[0_0_15px_rgba(255,255,255,0.2)] ${data.isFocused ? 'scale-125 text-white drop-shadow-[0_0_35px_rgba(255,255,255,0.8)]' : 'text-white/70 hover:scale-110 hover:text-white'}`}>
          {data.label}
       </h1>
       <div className={`transition-all duration-300 absolute -bottom-8 ${data.isFocused ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4 pointer-events-none'}`}>
           <div className="bg-gray-900 border border-white/20 px-4 py-1 rounded-full text-sm font-mono text-white flex gap-2 items-center shadow-xl">
               <span>${data.price}</span>
               <span className={data.isUp ? "text-green-400" : "text-red-400"}>{data.change}%</span>
           </div>
       </div>
       <Handle type="source" position={Position.Bottom} className="!bg-transparent !border-none" />
       <Handle type="target" position={Position.Top} className="!bg-transparent !border-none" />
    </div>
  );
};

const StockNode = ({ data }: any) => {
    const whale = data.whale || { is_whale: false, vol_str: "0", avg_str: "0", ratio: "1x" };
    return (
        <div className={`w-[220px] rounded-xl overflow-hidden border bg-gradient-to-b from-gray-900 to-black ${data.isFocused ? 'ring-2 ring-indigo-500 scale-105 border-indigo-500' : 'border-gray-800 opacity-90'}`}>
            <div className="bg-white/5 p-3 flex justify-between items-center">
                <span className="text-gray-300 font-bold text-xs tracking-widest uppercase">{data.label}</span>
                {whale.is_whale && <span className="bg-purple-900/50 border border-purple-500/30 text-purple-200 text-[9px] font-bold px-1.5 py-0.5 rounded animate-pulse">WHALE DETECTED</span>}
            </div>
            <div className="p-4">
                <div className="flex justify-between items-end mb-2">
                    <div className="text-2xl font-mono text-white tracking-tighter">${data.price}</div>
                    <div className={`text-[10px] font-bold ${data.isUp ? 'text-emerald-400' : 'text-rose-400'}`}>{data.change}%</div>
                </div>
                {/* Hide stats if Whale is detected (Explanation is in sidebar) */}
                {!whale.is_whale && (
                    <div className="border-t border-gray-800 pt-2 mt-2">
                        <div className="flex justify-between items-center text-[10px] text-gray-500 mb-1">
                            <span>Vol: <span className="text-gray-300">{whale.vol_str}</span></span>
                            <span>Avg: <span className="text-gray-300">{whale.avg_str}</span></span>
                        </div>
                        <div className="text-[10px] text-gray-500 font-mono text-right w-full">{whale.ratio} Normal</div>
                    </div>
                )}
            </div>
            <Handle type="target" position={Position.Top} className="!bg-transparent !border-none" />
        </div>
    );
};

export default function ButterflyScanner() {
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [simulatedUrl, setSimulatedUrl] = useState("https://www.tradingview.com/symbols/NVDA/");
  const [detectedContext, setDetectedContext] = useState<any>(null);
  const [activeInsight, setActiveInsight] = useState<any>(null);
  const [activeWhale, setActiveWhale] = useState<any>(null);
  const [riskParams, setRiskParams] = useState({ capital: 10000, entry: 150, risk_pct: 1 });
  const [riskResult, setRiskResult] = useState<any>(null);
  
  // POPUP STATE
  const [isGraphOpen, setIsGraphOpen] = useState(false);

  const nodeTypes = useMemo(() => ({ resource: ResourceNode, stock: StockNode }), []);

  const callBrain = async (mode: string, payload: any = {}) => {
      try {
          const res = await fetch(CLOUD_BRAIN_URL, { 
              method: 'POST', 
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ mode, ...payload }) 
          });
          return await res.json();
      } catch (e) { console.error(e); return null; }
  };

  const updateGraph = (intel: any) => {
       if (!intel.nodes) return;
       // Standard Layout logic
       const simNodes = intel.nodes.map((n: any) => {
           if (n.type === 'stock') {
               return { ...n, hidden: false, position: { x: 0, y: 300 } };
           } else {
               const idx = intel.nodes.indexOf(n);
               const count = intel.nodes.length - 1; 
               const spacing = 350;
               const startX = -((count - 1) * spacing) / 2;
               return { ...n, hidden: false, position: { x: startX + ((idx-1) * spacing), y: 0 }, data: { ...n.data, isFocused: true } };
           }
       });
       setNodes(simNodes);
       setEdges(intel.edges);
       setActiveInsight(intel.insight);
       
       const target = intel.nodes.find((n:any) => n.type === 'stock');
       if (target) {
           setRiskParams(prev => ({ ...prev, entry: parseFloat(target.data.price) }));
           setActiveWhale(target.data.whale);
       }
  };

  const handleSearch = async (e: any) => {
      e.preventDefault();
      const data = await callBrain('SEARCH', { query: searchQuery });
      if (data && data.nodes) {
          updateGraph(data);
          setDetectedContext(searchQuery.toUpperCase());
      }
  };

  const handleUrlSimulation = async () => {
      const data = await callBrain('CONTEXT', { url: simulatedUrl });
      if (data && data.status === "ACTIVE") {
          setDetectedContext(data.ticker);
          if (data.intel) updateGraph(data.intel);
      }
  };

  const calculateRisk = async () => {
      const res = await callBrain('RISK', riskParams);
      setRiskResult(res);
  };

  return (
    <div className="bg-black text-white h-screen w-full font-sans overflow-hidden relative selection:bg-indigo-500/30">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#1a1a2e] via-black to-black pointer-events-none"></div>

      {/* TOP NAV SIMULATOR */}
      <div className="absolute top-0 left-0 w-full z-[100] bg-gray-900/90 border-b border-gray-700 p-2 flex gap-4 items-center justify-center backdrop-blur-md">
          <span className="text-[10px] font-mono text-yellow-500 uppercase tracking-widest">Extension Simulator</span>
          <div className="flex bg-black rounded-md border border-gray-700 overflow-hidden w-1/2"><span className="px-3 py-2 text-gray-500 text-xs bg-gray-800 border-r border-gray-700">URL</span><input type="text" value={simulatedUrl} onChange={(e) => setSimulatedUrl(e.target.value)} className="flex-1 bg-transparent text-xs px-3 py-2 outline-none text-green-400 font-mono" /></div>
          <button onClick={handleUrlSimulation} className="bg-indigo-600 hover:bg-indigo-500 text-white text-xs px-4 py-2 rounded font-bold">NAVIGATE ➔</button>
      </div>

      <div className="absolute top-12 left-0 z-50 p-6 w-full flex justify-between items-center pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-8"><h1 className="text-4xl font-black tracking-tighter">BUTTERFLY<span className="text-indigo-500">.AI</span></h1></div>
        <div className="pointer-events-auto flex items-center gap-4">
            <form onSubmit={handleSearch} className="relative"><input type="text" placeholder="Search Ticker" className="bg-gray-900 border border-gray-700 text-xs rounded-full px-4 py-2 w-48 focus:w-64 focus:border-indigo-500 transition-all outline-none" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} /></form>
        </div>
      </div>

      {/* SIDEBAR (Always Visible) */}
      {detectedContext && (
          <div className="absolute top-28 right-8 z-50 w-[350px] bg-[#0a0a0a] border border-gray-800 rounded-xl shadow-2xl overflow-hidden animate-fade-in-left pointer-events-auto max-h-[75vh] flex flex-col">
              <div className="bg-gray-900/50 p-4 border-b border-gray-800 flex justify-between items-center">
                  <div><div className="text-[10px] text-gray-500 uppercase tracking-widest">Active Context</div><div className="text-xl font-black text-white">{detectedContext}</div></div>
                  <div className="px-2 py-1 bg-green-900/30 text-green-400 text-[10px] rounded border border-green-500/20 animate-pulse">● LIVE</div>
              </div>
              
              <div className="p-4 space-y-4 overflow-y-auto custom-scrollbar">
                  
                  {/* 1. INSIGHT CARD */}
                  {activeInsight && (
                      <div className={`p-4 rounded-lg border ${activeInsight.score >= 75 ? 'bg-green-900/10 border-green-500/30' : activeInsight.score <= 30 ? 'bg-red-900/10 border-red-500/30' : 'bg-gray-800/30 border-gray-700'}`}>
                          <div className="flex justify-between items-center mb-3">
                             <div className="flex flex-col">
                                 <span className="text-[10px] uppercase text-gray-500 tracking-widest font-bold">Confluence Score</span>
                                 <h3 className={`text-sm font-bold uppercase ${activeInsight.score >= 75 ? 'text-green-400' : activeInsight.score <= 30 ? 'text-red-400' : 'text-gray-300'}`}>
                                    {activeInsight.status}
                                 </h3>
                             </div>
                             <div className="text-2xl font-black text-white font-mono">{activeInsight.score}<span className="text-xs text-gray-500 font-sans">/100</span></div>
                          </div>
                          <div className="text-xs text-gray-300 leading-relaxed font-medium border-t border-white/5 pt-3">
                             <span className="text-gray-500 uppercase text-[9px] font-bold block mb-1">Factor Analysis</span>
                             {activeInsight.message}
                          </div>
                      </div>
                  )}

                  {/* 2. WHALE RADAR */}
                  {activeWhale && activeWhale.is_whale && (
                      <div className="bg-purple-900/10 border border-purple-500/30 p-4 rounded-lg animate-fade-in-up">
                          <h3 className="text-xs font-bold text-purple-400 uppercase mb-2 flex items-center gap-2">🐋 Whale Radar</h3>
                          <div className="text-xs text-purple-200 leading-relaxed font-medium">
                              "{activeWhale.narrative}"
                          </div>
                      </div>
                  )}
                  
                  {/* 3. BUTTON: VIEW NETWORK */}
                  <button 
                    onClick={() => setIsGraphOpen(true)}
                    className="w-full py-3 bg-gradient-to-r from-indigo-900 to-gray-900 border border-indigo-500/30 hover:border-indigo-400 text-indigo-300 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 group"
                  >
                    <span>VIEW NETWORK GRAPH</span>
                    <span className="group-hover:translate-x-1 transition-transform">➔</span>
                  </button>

                  {/* 4. RISK CALC */}
                  <div className="bg-gray-900/30 rounded-lg p-3 border border-gray-800">
                      <h3 className="text-xs font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">🧮 Reality Check</h3>
                      <div className="grid grid-cols-2 gap-2 mb-2">
                          <div><label className="text-[9px] text-gray-500 block">Entry</label><input type="number" value={riskParams.entry} onChange={(e) => setRiskParams({...riskParams, entry: parseFloat(e.target.value)})} className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-xs text-white"/></div>
                          <div><label className="text-[9px] text-gray-500 block">Risk %</label><input type="number" value={riskParams.risk_pct} onChange={(e) => setRiskParams({...riskParams, risk_pct: parseFloat(e.target.value)})} className="w-full bg-black border border-gray-700 rounded px-2 py-1 text-xs text-white"/></div>
                      </div>
                      <button onClick={calculateRisk} className="w-full bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white text-xs py-2 rounded font-bold mb-3">CALCULATE</button>
                      {riskResult && (
                          <div className="border-t border-gray-700 pt-3 space-y-2 animate-fade-in-up">
                              <div className="flex justify-between items-center"><span className="text-xs text-red-400">Stop Loss</span><span className="font-mono font-bold text-white">${riskResult.stop_loss}</span></div>
                              <div className="flex justify-between items-center"><span className="text-xs text-green-400">Take Profit</span><span className="font-mono font-bold text-white">${riskResult.take_profit}</span></div>
                              <div className="flex justify-between items-center bg-indigo-900/20 p-2 rounded"><span className="text-xs text-indigo-300">Pos Size</span><span className="font-mono font-bold text-white">{riskResult.shares} shares</span></div>
                          </div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* GRAPH POPUP MODAL */}
      {isGraphOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm animate-fade-in">
            <div className="w-[90vw] h-[85vh] bg-[#111] border border-gray-700 rounded-2xl shadow-2xl relative overflow-hidden flex flex-col">
                
                {/* Modal Header */}
                <div className="bg-gray-900/80 p-4 border-b border-gray-800 flex justify-between items-center z-10">
                    <h2 className="text-white font-bold text-lg tracking-tight flex items-center gap-2">
                        <span className="text-indigo-500">❖</span> CORRELATION MATRIX: {detectedContext}
                    </h2>
                    <button 
                        onClick={() => setIsGraphOpen(false)} 
                        className="text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center transition-colors font-bold"
                    >
                        ✕
                    </button>
                </div>

                {/* ReactFlow Canvas */}
                <div className="flex-1 w-full h-full">
                    <ReactFlow nodes={nodes} edges={edges} onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} nodeTypes={nodeTypes} fitView minZoom={0.1} maxZoom={3}>
                        <Background color="#222" gap={50} size={1} style={{ opacity: 0.1 }} />
                        <Controls className="!bg-[#111] !border-[#333] !fill-white !rounded-lg" />
                    </ReactFlow>
                </div>
            </div>
        </div>
      )}
    </div>
  );
}