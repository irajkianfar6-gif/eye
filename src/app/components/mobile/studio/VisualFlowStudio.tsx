import React, { useEffect, useMemo, useState } from "react";
import {
  Play,
  Plus,
  Trash2,
  CheckCircle2,
  Sparkles,
  Sliders,
  ArrowLeft,
  ChevronRight,
  ChevronLeft,
  Send,
  Save,
  Layers,
  Eye,
  Pin,
  BellOff,
  CornerUpRight,
  ExternalLink,
  Zap,
  RotateCcw,
} from "lucide-react";
import type { Article } from "../../../data";
import type { StudioPlatform } from "../../../api";
import { PLATFORM_META, ALL_PLATFORMS } from "./studio";
import {
  FLOW_BLOCK_CATALOG,
  CATEGORY_META,
  PRESET_FLOW_PIPELINES,
  createNodeFromCatalog,
  getNodeVisualBadges,
  simulateVisualFlow,
  type FlowBlockCategory,
  type FlowBlockType,
  type FlowNode,
  type FlowNodeParams,
  type VisualFlowPipeline,
  type FlowSimulationResult,
} from "./visualFlowEngine";
import { renderNewsCard } from "./newsCard";
import { useToast } from "../primitives/Toast";
import { toFa } from "../utils/fa";

interface Props {
  articles: Article[];
  onApplySimulationToWorkspace?: (sim: FlowSimulationResult) => void;
}

const STORAGE_KEY = "kian.studio.visualFlows.v1";

export function VisualFlowStudio({ articles, onApplySimulationToWorkspace }: Props) {
  const toast = useToast();

  // Load saved visual pipelines or fall back to preset recipes
  const [pipelines, setPipelines] = useState<VisualFlowPipeline[]>(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return PRESET_FLOW_PIPELINES;
  });

  const [activePipelineId, setActivePipelineId] = useState<string>(
    () => pipelines[0]?.id || PRESET_FLOW_PIPELINES[0].id,
  );

  const activePipeline = useMemo(
    () => pipelines.find(p => p.id === activePipelineId) || pipelines[0],
    [pipelines, activePipelineId],
  );

  const [selectedNodeId, setSelectedNodeId] = useState<string>(
    () => activePipeline?.nodes[0]?.id || "",
  );
  const [paletteCategory, setPaletteCategory] = useState<FlowBlockCategory | "all">("all");
  const [insertAtIdx, setInsertAtIdx] = useState<number | null>(null);
  const [kwInput, setKwInput] = useState("");
  const [previewCardUrl, setPreviewCardUrl] = useState<string>("");
  const [simRunning, setSimRunning] = useState(false);

  // Sync selectedNodeId when switching pipelines
  useEffect(() => {
    if (activePipeline && !activePipeline.nodes.some(n => n.id === selectedNodeId)) {
      setSelectedNodeId(activePipeline.nodes[0]?.id || "");
    }
  }, [activePipeline, selectedNodeId]);

  // Persist pipelines to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pipelines));
    } catch {
      // ignore
    }
  }, [pipelines]);

  // Live simulation result computed dynamically whenever nodes or articles change
  const simResult = useMemo<FlowSimulationResult>(
    () => simulateVisualFlow(activePipeline, articles),
    [activePipeline, articles],
  );

  // Render live graphic card preview from simulation cardConfig
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const url = await renderNewsCard({
          title: simResult.generatedHeadline,
          brandName: "کیان مدیا (Flow)",
          tagline: simResult.cardConfig.isBreakingRed
            ? "🚨 رادار اتوماسیون خبر فوری"
            : "تحریریه هوشمند خبری",
          source: simResult.matchedArticles[0]?.source || "اتوماسیون تحریریه",
          accent: simResult.cardConfig.accent,
          theme: simResult.cardConfig.theme,
          ratio: simResult.cardConfig.ratio,
        });
        if (!cancelled) setPreviewCardUrl(url);
      } catch {
        // ignore canvas errors in headless environments
      }
    }, 140);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [simResult]);

  const selectedNode = useMemo(
    () => activePipeline.nodes.find(n => n.id === selectedNodeId) || activePipeline.nodes[0],
    [activePipeline, selectedNodeId],
  );

  const updateActivePipeline = (updater: (p: VisualFlowPipeline) => VisualFlowPipeline) => {
    setPipelines(prev =>
      prev.map(p => (p.id === activePipeline.id ? updater(p) : p)),
    );
  };

  const updateNodeParams = (nodeId: string, patch: Partial<FlowNodeParams>) => {
    updateActivePipeline(p => ({
      ...p,
      nodes: p.nodes.map(n =>
        n.id === nodeId ? { ...n, params: { ...n.params, ...patch } } : n,
      ),
    }));
  };

  const handleAddBlockToCanvas = (type: FlowBlockType) => {
    const newNode = createNodeFromCatalog(type);
    updateActivePipeline(p => {
      const nextNodes = [...p.nodes];
      if (insertAtIdx !== null && insertAtIdx >= 0 && insertAtIdx <= nextNodes.length) {
        nextNodes.splice(insertAtIdx, 0, newNode);
      } else {
        // Smart ordering: if adding a source put at start, if destination put at end, otherwise before destination
        if (newNode.category === "source") {
          nextNodes.unshift(newNode);
        } else if (newNode.category === "destination") {
          nextNodes.push(newNode);
        } else {
          const firstDestIdx = nextNodes.findIndex(n => n.category === "destination");
          if (firstDestIdx >= 0) nextNodes.splice(firstDestIdx, 0, newNode);
          else nextNodes.push(newNode);
        }
      }
      return { ...p, nodes: nextNodes };
    });
    setSelectedNodeId(newNode.id);
    setInsertAtIdx(null);
    toast({
      kind: "success",
      message: `نماد «${newNode.title}» به زنجیرهٔ بوم متصل شد`,
    });
  };

  const handleRemoveNode = (nodeId: string) => {
    if (activePipeline.nodes.length <= 1) {
      toast({ kind: "warn", message: "حداقل یک نماد باید در بوم باقی بماند" });
      return;
    }
    updateActivePipeline(p => ({
      ...p,
      nodes: p.nodes.filter(n => n.id !== nodeId),
    }));
    toast({ kind: "success", message: "نماد از زنجیره حذف شد" });
  };

  const handleMoveNode = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= activePipeline.nodes.length) return;
    updateActivePipeline(p => {
      const next = [...p.nodes];
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return { ...p, nodes: next };
    });
  };

  const handleCreateBlankFlow = () => {
    const newPipe: VisualFlowPipeline = {
      id: `flow-custom-${Date.now()}`,
      name: `چرخهٔ سفارشی تحریریه (${toFa(pipelines.length + 1)})`,
      description: "چرخهٔ اختصاصی ساخته‌شده با کنار هم چیدن نمادها روی بوم بصری",
      enabled: true,
      nodes: [
        createNodeFromCatalog("rss_feed"),
        createNodeFromCatalog("ai_composer"),
        createNodeFromCatalog("telegram_dest"),
      ],
    };
    setPipelines(prev => [newPipe, ...prev]);
    setActivePipelineId(newPipe.id);
    setSelectedNodeId(newPipe.nodes[0].id);
    toast({ kind: "success", message: "بوم جدید ایجاد شد — نمادها را از ستون راست اضافه کنید" });
  };

  const handleRunLiveSimulation = () => {
    setSimRunning(true);
    setTimeout(() => {
      setSimRunning(false);
      updateActivePipeline(p => ({
        ...p,
        lastRunAt: Date.now(),
        runCount: (p.runCount || 0) + 1,
      }));
      toast({
        kind: "success",
        message: `شبیه‌سازی زنجیره روی ${toFa(articles.length || 24)} خبر زنده با موفقیت اجرا شد`,
      });
    }, 350);
  };

  const filteredCatalog = useMemo(
    () =>
      FLOW_BLOCK_CATALOG.filter(
        b => paletteCategory === "all" || b.category === paletteCategory,
      ),
    [paletteCategory],
  );

  return (
    <div
      dir="rtl"
      data-testid="visual-flow-studio"
      className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden"
    >
      {/* ═══════════════════════════════════════════════════════════════════
          TOP BAR: ONE-CLICK RECIPES & LIVE FLOW CONTROLS
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 flex-wrap shrink-0">
        {/* Preset Recipes Selector */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1 ml-1">
            <Zap className="w-4 h-4 text-emerald-600" />
            الگوهای آماده (یک‌کلیکی):
          </span>
          {pipelines.map(pipe => {
            const active = pipe.id === activePipeline.id;
            return (
              <button
                key={pipe.id}
                type="button"
                onClick={() => setActivePipelineId(pipe.id)}
                className={`px-3 py-1.5 rounded-xl text-xs flex items-center gap-1.5 border transition whitespace-nowrap ${
                  active
                    ? "bg-emerald-600 border-emerald-600 text-white font-semibold shadow-2xs"
                    : "bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
                }`}
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    pipe.enabled ? (active ? "bg-white" : "bg-emerald-500") : "bg-slate-400"
                  }`}
                />
                <span>{pipe.name.slice(0, 36)}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={handleCreateBlankFlow}
            className="px-2.5 py-1.5 rounded-xl border border-dashed border-emerald-500/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-semibold flex items-center gap-1 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>چرخهٔ جدید</span>
          </button>
        </div>

        {/* Right Controls: Run Live Simulator & Transfer to Rich Editor */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            data-testid="run-visual-flow-sim-btn"
            onClick={handleRunLiveSimulation}
            className="h-9 px-3.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition whitespace-nowrap"
          >
            <Play className="w-3.5 h-3.5" />
            <span>{simRunning ? "در حال اجرای زنجیره..." : "تست و شبیه‌سازی زنده روی اخبار"}</span>
          </button>

          {onApplySimulationToWorkspace && (
            <button
              type="button"
              data-testid="apply-flow-to-editor-btn"
              onClick={() => onApplySimulationToWorkspace(simResult)}
              className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition whitespace-nowrap"
            >
              <Send className="w-3.5 h-3.5 -scale-x-100" />
              <span>ارسال خروجی بوم به میز تحریریه</span>
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          MAIN WORKSPACE: RIGHT ICON PALETTE + CENTER FLOW CANVAS & INSPECTOR
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[310px_minmax(0,1fr)] divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-200 dark:divide-slate-800 overflow-hidden">
        {/* ─────────────────────────────────────────────────────────────────
            RIGHT COLUMN: VISUAL ICON PALETTE (جعبه ابزار آیکون‌ها و نمادها)
        ───────────────────────────────────────────────────────────────── */}
        <aside
          aria-label="جعبه ابزار آیکون‌ها و نمادهای اتوماسیون"
          className="flex flex-col min-h-0 h-full bg-white dark:bg-slate-900 overflow-hidden"
        >
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-2 shrink-0">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900 dark:text-white">
                جعبه ابزار نمادها (کلیک = اتصال به بوم)
              </span>
              {insertAtIdx !== null && (
                <button
                  type="button"
                  onClick={() => setInsertAtIdx(null)}
                  className="text-[10.5px] text-rose-500 hover:underline"
                >
                  لغو درج در نقطهٔ {toFa(insertAtIdx + 1)}
                </button>
              )}
            </div>

            {/* 4 Color Family Filter Pills */}
            <div className="grid grid-cols-2 gap-1 text-[11px]">
              <button
                type="button"
                onClick={() => setPaletteCategory("all")}
                className={`col-span-2 py-1 px-2 rounded-lg font-medium border transition ${
                  paletteCategory === "all"
                    ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-transparent"
                    : "bg-slate-100 dark:bg-slate-800 border-transparent text-slate-600 dark:text-slate-400"
                }`}
              >
                همهٔ نمادها ({toFa(FLOW_BLOCK_CATALOG.length)} بلوک آماده)
              </button>
              {(["source", "filter", "transform", "destination"] as FlowBlockCategory[]).map(cat => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setPaletteCategory(cat)}
                  className={`py-1 px-2 rounded-lg font-medium border text-right truncate transition ${
                    paletteCategory === cat
                      ? CATEGORY_META[cat].badgeBg + " font-bold"
                      : "bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {CATEGORY_META[cat].label}
                </button>
              ))}
            </div>
          </div>

          {/* Scrollable Icon Block Cards */}
          <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
            {filteredCatalog.map(item => {
              const catMeta = CATEGORY_META[item.category];
              return (
                <button
                  key={item.type}
                  type="button"
                  data-testid={`palette-block-${item.type}`}
                  onClick={() => handleAddBlockToCanvas(item.type)}
                  className={`w-full p-2.5 rounded-xl border-2 text-right bg-white dark:bg-slate-950/90 transition flex items-start gap-2.5 group ${catMeta.borderCls}`}
                >
                  <span className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-900 grid place-items-center text-xl shrink-0 group-hover:scale-105 transition">
                    {item.iconEmoji}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                        {item.title}
                      </span>
                      <span className={`px-1.5 py-0.5 rounded text-[9.5px] font-semibold border shrink-0 ${catMeta.badgeBg}`}>
                        + افزودن
                      </span>
                    </div>
                    <p className="text-[10.5px] text-slate-500 dark:text-slate-400 mt-0.5 line-clamp-1">
                      {item.subtitle}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        {/* ─────────────────────────────────────────────────────────────────
            CENTER & BOTTOM: INTERACTIVE DOTTED FLOW CANVAS + INSPECTOR
        ───────────────────────────────────────────────────────────────── */}
        <div className="flex flex-col min-h-0 h-full overflow-y-auto">
          {/* Pipeline Header inside Canvas */}
          <div className="px-5 py-3 bg-white/90 dark:bg-slate-900/90 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-[240px]">
              <input
                value={activePipeline.name}
                onChange={e =>
                  updateActivePipeline(p => ({ ...p, name: e.target.value }))
                }
                className="w-full text-sm font-bold bg-transparent outline-none focus:underline"
              />
              <p className="text-[11px] text-slate-500 mt-0.5">
                {activePipeline.description}
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs">
              <span className="text-slate-500 tabular-nums">
                {toFa(activePipeline.nodes.length)} مرحله در زنجیره
              </span>
              <button
                type="button"
                onClick={() =>
                  updateActivePipeline(p => ({ ...p, enabled: !p.enabled }))
                }
                className={`px-3 py-1.5 rounded-xl font-semibold flex items-center gap-1.5 transition ${
                  activePipeline.enabled
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-200 dark:bg-slate-800 text-slate-600"
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{activePipeline.enabled ? "چرخه فعال است" : "چرخه متوقف است"}</span>
              </button>
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              VISUAL MAGNETIC NODE CANVAS (بوم بصری اتصال نمادها)
          ═══════════════════════════════════════════════════════════════ */}
          <div
            data-testid="visual-flow-canvas"
            className="p-5 bg-[radial-gradient(#cbd5e1_1px,transparent_1px)] dark:bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:18px_18px] border-b border-slate-200 dark:border-slate-800 overflow-x-auto"
          >
            <div className="flex items-center gap-2 min-w-max py-2">
              {activePipeline.nodes.map((node, idx) => {
                const isSelected = node.id === selectedNode?.id;
                const catMeta = CATEGORY_META[node.category];
                const badges = getNodeVisualBadges(node);
                const trace = simResult.stepTraces.find(t => t.nodeId === node.id);

                return (
                  <React.Fragment key={node.id}>
                    {/* VISUAL ICON NODE CARD */}
                    <div
                      data-testid={`canvas-node-${node.type}`}
                      onClick={() => setSelectedNodeId(node.id)}
                      className={`w-[228px] rounded-2xl bg-white dark:bg-slate-900 border-2 p-3 cursor-pointer transition shadow-sm flex flex-col justify-between select-none ${
                        isSelected
                          ? "ring-2 ring-offset-2 ring-emerald-500 border-emerald-500 scale-[1.01]"
                          : catMeta.borderCls
                      }`}
                    >
                      {/* Top Category Ribbon + Order & Delete Controls */}
                      <div className="flex items-center justify-between gap-1 mb-2">
                        <span
                          className={`px-2 py-0.5 rounded-md text-[10px] font-bold border whitespace-nowrap ${catMeta.badgeBg}`}
                        >
                          گام {toFa(idx + 1)} · {catMeta.label.split(".")[1] || catMeta.label}
                        </span>

                        <div
                          className="flex items-center gap-0.5"
                          onClick={e => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleMoveNode(idx, -1)}
                            disabled={idx === 0}
                            title="جابه‌جایی به راست"
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25"
                          >
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveNode(idx, 1)}
                            disabled={idx === activePipeline.nodes.length - 1}
                            title="جابه‌جایی به چپ"
                            className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-25"
                          >
                            <ChevronLeft className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRemoveNode(node.id)}
                            title="حذف این نماد"
                            className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Main Icon & Title */}
                      <div className="flex items-center gap-2.5 my-1">
                        <div className="w-11 h-11 rounded-2xl bg-slate-100 dark:bg-slate-800 grid place-items-center text-2xl shrink-0 shadow-2xs">
                          {node.iconEmoji}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug truncate">
                            {node.title}
                          </div>
                          <div className="text-[10.5px] text-slate-500 truncate mt-0.5">
                            {node.subtitle}
                          </div>
                        </div>
                      </div>

                      {/* Visual Parameter Micro-Badges */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 dark:border-slate-800 flex flex-wrap gap-1">
                        {badges.map((b, bIdx) => (
                          <span
                            key={bIdx}
                            className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-700 dark:text-slate-300"
                          >
                            {b}
                          </span>
                        ))}
                      </div>

                      {/* Live Simulation Output Count Footer */}
                      {trace && (
                        <div className="mt-2 px-2 py-1 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium flex items-center justify-between">
                          <span className="truncate">{trace.summaryText}</span>
                          <span className="font-mono tabular-nums shrink-0 mr-1">
                            ✓ {toFa(trace.outputCount)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* ANIMATED FLOW CONNECTOR WITH INLINE '+' INSERT BUTTON */}
                    {idx < activePipeline.nodes.length - 1 && (
                      <div className="flex flex-col items-center justify-center px-1 shrink-0">
                        <div className="flex items-center">
                          <div className="w-5 h-0.5 bg-emerald-500/60" />
                          <button
                            type="button"
                            onClick={() => {
                              setInsertAtIdx(idx + 1);
                              toast({
                                kind: "info",
                                message: `حالا از ستون راست یک نماد انتخاب کنید تا بین گام ${toFa(idx + 1)} و ${toFa(idx + 2)} قرار گیرد`,
                              });
                            }}
                            title="افزودن نماد جدید در این نقطه از زنجیره"
                            className={`w-6 h-6 rounded-full border grid place-items-center text-xs transition ${
                              insertAtIdx === idx + 1
                                ? "bg-emerald-600 border-emerald-600 text-white scale-110"
                                : "bg-white dark:bg-slate-900 border-emerald-500/60 text-emerald-600 hover:bg-emerald-50"
                            }`}
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                          <div className="w-4 h-0.5 bg-emerald-500/60" />
                          <ArrowLeft className="w-4 h-4 text-emerald-500 -mr-1" />
                        </div>
                      </div>
                    )}
                  </React.Fragment>
                );
              })}
            </div>
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              BOTTOM SPLIT: VISUAL PARAMETER INSPECTOR + LIVE SIMULATION PREVIEW
          ═══════════════════════════════════════════════════════════════ */}
          <div className="flex-1 grid grid-cols-1 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] divide-y xl:divide-y-0 xl:divide-x xl:divide-x-reverse divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
            {/* ─────────────────────────────────────────────────────────────
                RIGHT PANE: ZERO-CODE VISUAL NODE PARAMETER CONFIGURATOR
            ───────────────────────────────────────────────────────────── */}
            {selectedNode && (
              <div className="p-4 space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 grid place-items-center text-2xl">
                      {selectedNode.iconEmoji}
                    </span>
                    <div>
                      <div className="text-xs font-bold flex items-center gap-2">
                        <span>تنظیمات بصری نماد: {selectedNode.title}</span>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] border ${
                            CATEGORY_META[selectedNode.category].badgeBg
                          }`}
                        >
                          {CATEGORY_META[selectedNode.category].question}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {selectedNode.subtitle} — پارامترها را صرفاً با کلیک تغییر دهید
                      </p>
                    </div>
                  </div>
                </div>

                {/* Dynamic Simple Controls based on selectedNode.type */}
                <div className="space-y-3 text-xs">
                  {selectedNode.type === "breaking_cluster" && (
                    <>
                      <div className="space-y-1.5">
                        <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                          حداقل چند خبرگزاری هم‌زمان خبر را کار کرده باشند؟
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {[2, 3, 4, 5, 6].map(n => (
                            <button
                              key={n}
                              type="button"
                              onClick={() =>
                                updateNodeParams(selectedNode.id, { minSources: n })
                              }
                              className={`px-3 py-1.5 rounded-xl border font-semibold transition ${
                                (selectedNode.params.minSources || 3) === n
                                  ? "bg-sky-600 border-sky-600 text-white"
                                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              حداقل {toFa(n)} خبرگزاری
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                          حداکثر بازهٔ زمانی انتشار هم‌زمان (تشخیص موج فوری):
                        </label>
                        <div className="flex items-center gap-2 flex-wrap">
                          {[10, 15, 20, 30, 45, 60].map(m => (
                            <button
                              key={m}
                              type="button"
                              onClick={() =>
                                updateNodeParams(selectedNode.id, { withinMinutes: m })
                              }
                              className={`px-3 py-1.5 rounded-xl border font-semibold transition ${
                                (selectedNode.params.withinMinutes || 20) === m
                                  ? "bg-sky-600 border-sky-600 text-white"
                                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              کمتر از {toFa(m)} دقیقه
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {(selectedNode.type === "rss_feed" || selectedNode.type === "intl_feeds") && (
                    <div className="space-y-1.5">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                        حوزه و دستهٔ خوراک‌های ورودی:
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[
                          { id: "all", label: "🌐 همهٔ دسته‌های خبری" },
                          { id: "political", label: "🏛️ سیاسی و دیپلماسی" },
                          { id: "economic", label: "📈 اقتصادی و بازار" },
                          { id: "international", label: "🌍 بین‌الملل و جهان" },
                          { id: "tech", label: "💻 فناوری و هوش مصنوعی" },
                        ].map(sc => (
                          <button
                            key={sc.id}
                            type="button"
                            onClick={() =>
                              updateNodeParams(selectedNode.id, {
                                feedScope: sc.id as any,
                              })
                            }
                            className={`px-3 py-1.5 rounded-xl border font-semibold transition ${
                              (selectedNode.params.feedScope || "all") === sc.id
                                ? "bg-sky-600 border-sky-600 text-white"
                                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {sc.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedNode.type === "schedule_timer" && (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        {[
                          { id: "daily", label: "☀️ بولتن روزانه در ساعت مشخص" },
                          { id: "interval", label: "🔄 اجرای دوره‌ای (هر چند دقیقه)" },
                        ].map(md => (
                          <button
                            key={md.id}
                            type="button"
                            onClick={() =>
                              updateNodeParams(selectedNode.id, {
                                scheduleMode: md.id as any,
                              })
                            }
                            className={`px-3 py-1.5 rounded-xl border font-semibold transition ${
                              (selectedNode.params.scheduleMode || "daily") === md.id
                                ? "bg-sky-600 border-sky-600 text-white"
                                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {md.label}
                          </button>
                        ))}
                      </div>
                      {selectedNode.params.scheduleMode === "interval" ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          {[15, 30, 60, 120].map(em => (
                            <button
                              key={em}
                              type="button"
                              onClick={() =>
                                updateNodeParams(selectedNode.id, { everyMinutes: em })
                              }
                              className={`px-3 py-1.5 rounded-xl border font-semibold ${
                                (selectedNode.params.everyMinutes || 60) === em
                                  ? "bg-emerald-600 border-emerald-600 text-white"
                                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              هر {toFa(em)} دقیقه
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 flex-wrap">
                          {["08:00", "08:30", "13:00", "18:00", "21:00"].map(tm => (
                            <button
                              key={tm}
                              type="button"
                              onClick={() =>
                                updateNodeParams(selectedNode.id, { dailyTime: tm })
                              }
                              className={`px-3 py-1.5 rounded-xl border font-semibold ${
                                (selectedNode.params.dailyTime || "08:30") === tm
                                  ? "bg-emerald-600 border-emerald-600 text-white"
                                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              ساعت {toFa(tm)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedNode.type === "sentiment_gate" && (
                    <div className="space-y-1.5">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                        کدام طیف احساسی از این صافی عبور کند؟
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          {
                            id: "negative_or_critical",
                            label: "🚨 فقط منفی یا بحرانی (تنش / هشدار)",
                          },
                          { id: "positive", label: "🟢 فقط مثبت و دستاوردی" },
                          { id: "neutral", label: "⚪ خنثی و گزارشی" },
                          { id: "any", label: "🌐 همهٔ احساسات بدون محدودیت" },
                        ].map(sf => (
                          <button
                            key={sf.id}
                            type="button"
                            onClick={() =>
                              updateNodeParams(selectedNode.id, {
                                sentimentFilter: sf.id as any,
                              })
                            }
                            className={`p-2.5 rounded-xl border text-right font-semibold transition ${
                              (selectedNode.params.sentimentFilter ||
                                "negative_or_critical") === sf.id
                                ? "bg-amber-500 border-amber-500 text-white"
                                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            {sf.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedNode.type === "keyword_gate" && (
                    <div className="space-y-2">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                        کلیدواژه‌های هدف برای عبور از صافی:
                      </label>
                      <div className="flex items-center gap-1.5">
                        <input
                          value={kwInput}
                          onChange={e => setKwInput(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === "Enter" && kwInput.trim()) {
                              e.preventDefault();
                              const cur = selectedNode.params.includeKeywords || [];
                              updateNodeParams(selectedNode.id, {
                                includeKeywords: [...cur, kwInput.trim()],
                              });
                              setKwInput("");
                            }
                          }}
                          placeholder="مثلاً: انرژی، بانک مرکزی، مذاکرات..."
                          className="flex-1 h-8 px-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (!kwInput.trim()) return;
                            const cur = selectedNode.params.includeKeywords || [];
                            updateNodeParams(selectedNode.id, {
                              includeKeywords: [...cur, kwInput.trim()],
                            });
                            setKwInput("");
                          }}
                          className="h-8 px-3 rounded-xl bg-amber-500 text-white font-semibold"
                        >
                          + افزودن شرط
                        </button>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {(selectedNode.params.includeKeywords || []).map(kw => (
                          <span
                            key={kw}
                            className="px-2.5 py-1 rounded-lg bg-amber-500/15 text-amber-700 dark:text-amber-300 font-medium inline-flex items-center gap-1"
                          >
                            {kw}
                            <button
                              type="button"
                              onClick={() =>
                                updateNodeParams(selectedNode.id, {
                                  includeKeywords: (
                                    selectedNode.params.includeKeywords || []
                                  ).filter(k => k !== kw),
                                })
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {(selectedNode.type === "ai_composer" ||
                    selectedNode.type === "tone_shifter") && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                          لحن نگارش هوش مصنوعی (claude-sonnet-5):
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: "breaking", label: "🚨 فوری، فشرده و قلاب‌دار" },
                            { id: "analytical", label: "🔎 تحلیلی و بررسی پیامدها" },
                            { id: "official", label: "📌 رسمی و استاندارد خبرگزاری" },
                            { id: "narrative", label: "📖 روایی و داستانی" },
                          ].map(tn => (
                            <button
                              key={tn.id}
                              type="button"
                              onClick={() =>
                                updateNodeParams(selectedNode.id, {
                                  toneStyle: tn.id as any,
                                })
                              }
                              className={`p-2 rounded-xl border text-right font-semibold transition ${
                                (selectedNode.params.toneStyle || "breaking") === tn.id
                                  ? "bg-purple-600 border-purple-600 text-white"
                                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              {tn.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedNode.type === "graphic_card" && (
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                          قالب بصری کارت گرافیکی خودکار:
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { id: "breaking_red", label: "🔴 کارت قرمز خبر فوری (Breaking)" },
                            { id: "dark_editorial", label: "⚫ کارت تیره تحریریه" },
                            { id: "light_paper", label: "⚪ کارت روشن روزنامه‌ای" },
                            { id: "brand_emerald", label: "🟢 کارت زمردی برند کیان" },
                          ].map(cs => (
                            <button
                              key={cs.id}
                              type="button"
                              onClick={() =>
                                updateNodeParams(selectedNode.id, {
                                  cardStyle: cs.id as any,
                                })
                              }
                              className={`p-2.5 rounded-xl border text-right font-semibold transition ${
                                (selectedNode.params.cardStyle || "breaking_red") === cs.id
                                  ? "bg-purple-600 border-purple-600 text-white"
                                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              {cs.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                          نسبت ابعاد تصویر خروجی:
                        </label>
                        <div className="flex items-center gap-2">
                          {[
                            { id: "square", label: "۱:۱ مربعی (پست)" },
                            { id: "story", label: "۹:۱۶ عمودی (استوری)" },
                            { id: "wide", label: "۱۶:۹ افقی (تلگرام/وب)" },
                          ].map(rt => (
                            <button
                              key={rt.id}
                              type="button"
                              onClick={() =>
                                updateNodeParams(selectedNode.id, {
                                  cardRatio: rt.id as any,
                                })
                              }
                              className={`px-3 py-1.5 rounded-xl border font-semibold transition ${
                                (selectedNode.params.cardRatio || "square") === rt.id
                                  ? "bg-purple-600 border-purple-600 text-white"
                                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                              }`}
                            >
                              {rt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {(selectedNode.type === "telegram_dest" ||
                    selectedNode.type === "iranian_messengers") && (
                    <div className="space-y-2.5">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                        قابلیت‌های اختصاصی پیام‌رسان هنگام انتشار خودکار:
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateNodeParams(selectedNode.id, {
                              inlineFullStoryBtn: !selectedNode.params.inlineFullStoryBtn,
                            })
                          }
                          className={`p-2.5 rounded-xl border text-right font-semibold flex items-center justify-between ${
                            selectedNode.params.inlineFullStoryBtn !== false
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <span>🔘 دکمه شیشه‌ای «متن کامل خبر»</span>
                          <span>{selectedNode.params.inlineFullStoryBtn !== false ? "✓" : ""}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateNodeParams(selectedNode.id, {
                              inlineReactionPoll: !selectedNode.params.inlineReactionPoll,
                            })
                          }
                          className={`p-2.5 rounded-xl border text-right font-semibold flex items-center justify-between ${
                            selectedNode.params.inlineReactionPoll !== false
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <span>👍 نظرسنجی واکنشی (👍/👎/🔥)</span>
                          <span>{selectedNode.params.inlineReactionPoll !== false ? "✓" : ""}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateNodeParams(selectedNode.id, {
                              autoPinBreaking: !selectedNode.params.autoPinBreaking,
                            })
                          }
                          className={`p-2.5 rounded-xl border text-right font-semibold flex items-center justify-between ${
                            selectedNode.params.autoPinBreaking
                              ? "bg-rose-600 border-rose-600 text-white"
                              : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <span>📌 پین خودکار خبر در بالای کانال</span>
                          <span>{selectedNode.params.autoPinBreaking ? "✓" : ""}</span>
                        </button>

                        <button
                          type="button"
                          onClick={() =>
                            updateNodeParams(selectedNode.id, {
                              replyToPreviousChain:
                                !selectedNode.params.replyToPreviousChain,
                            })
                          }
                          className={`p-2.5 rounded-xl border text-right font-semibold flex items-center justify-between ${
                            selectedNode.params.replyToPreviousChain
                              ? "bg-sky-600 border-sky-600 text-white"
                              : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                          }`}
                        >
                          <span>↩️ اتصال و ریپلای به پست قبلی</span>
                          <span>{selectedNode.params.replyToPreviousChain ? "✓" : ""}</span>
                        </button>
                      </div>
                    </div>
                  )}

                  {selectedNode.type === "smart_antiflood_queue" && (
                    <div className="space-y-2">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                        حداقل فاصلهٔ استاندارد بین دو پست عادی (جلوگیری از ازدحام):
                      </label>
                      <div className="flex items-center gap-2 flex-wrap">
                        {[15, 20, 30, 45, 60].map(gap => (
                          <button
                            key={gap}
                            type="button"
                            onClick={() =>
                              updateNodeParams(selectedNode.id, {
                                antiFloodMinGap: gap,
                              })
                            }
                            className={`px-3.5 py-2 rounded-xl border font-semibold transition ${
                              (selectedNode.params.antiFloodMinGap || 20) === gap
                                ? "bg-emerald-600 border-emerald-600 text-white"
                                : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700"
                            }`}
                          >
                            حداقل {toFa(gap)} دقیقه فاصله
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Platform Multi-Select for any Destination node */}
                  {selectedNode.category === "destination" && (
                    <div className="space-y-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                      <label className="font-semibold text-slate-700 dark:text-slate-300 block">
                        کانال‌ها و شبکه‌های متصل به این نماد مقصد:
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {ALL_PLATFORMS.map(pl => {
                          const cur = selectedNode.params.platforms || ["telegram"];
                          const isOn = cur.includes(pl);
                          return (
                            <button
                              key={pl}
                              type="button"
                              onClick={() => {
                                const next = isOn
                                  ? cur.filter(x => x !== pl)
                                  : [...cur, pl];
                                updateNodeParams(selectedNode.id, {
                                  platforms: next.length ? next : ["telegram"],
                                });
                              }}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-1 transition ${
                                isOn
                                  ? "bg-emerald-600 border-emerald-600 text-white font-semibold"
                                  : "bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500"
                              }`}
                            >
                              <span>{PLATFORM_META[pl].emoji}</span>
                              <span>{PLATFORM_META[pl].label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                LEFT PANE: LIVE CHAIN SIMULATION & CARD/MESSAGE PREVIEW
            ───────────────────────────────────────────────────────────── */}
            <div className="p-4 bg-slate-50/70 dark:bg-slate-950/60 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold flex items-center gap-1.5 text-slate-800 dark:text-slate-100">
                  <Sparkles className="w-4 h-4 text-emerald-600" />
                  پیش‌نمایش زندهٔ خروجی زنجیره روی اخبار واقعی
                </span>
                <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-[10.5px] font-semibold">
                  {simResult.deliveryMode === "human_autopilot"
                    ? "🧑‍✈️ خلبان خودکار با تأیید سردبیر"
                    : simResult.deliveryMode === "smart_queue"
                      ? `🛡️ صف هوشمند (فاصله ${toFa(simResult.antiFloodGapMinutes)} دقیقه)`
                      : "⚡ انتشار مستقیم"}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[150px_minmax(0,1fr)] gap-3 items-start">
                {/* Live Rendered Graphic Card Thumbnail */}
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-900 flex flex-col items-center">
                  {previewCardUrl ? (
                    <img
                      src={previewCardUrl}
                      alt={simResult.generatedHeadline}
                      className="w-full h-36 object-cover"
                    />
                  ) : (
                    <div className="h-36 w-full grid place-items-center text-[11px] text-slate-400">
                      کارت گرافیکی خودکار
                    </div>
                  )}
                  <div className="w-full px-2 py-1 text-center text-[10px] font-semibold text-white bg-slate-950">
                    {simResult.cardConfig.isBreakingRed
                      ? "🔴 کارت قرمز فوری"
                      : "🎨 کارت گرافیکی تحریریه"}
                  </div>
                </div>

                {/* Simulated Message Bubble Preview */}
                <div className="rounded-2xl bg-[#182533] text-white p-3 space-y-2 border border-white/10 shadow-sm text-xs">
                  {simResult.messengerConfig.autoPin && (
                    <div className="px-2 py-1 rounded bg-rose-500/20 text-rose-300 text-[10px] font-semibold flex items-center gap-1">
                      <Pin className="w-3 h-3" />
                      <span>پین خودکار در بالای کانال فعال است</span>
                    </div>
                  )}

                  {simResult.messengerConfig.replyToPrev && (
                    <div className="px-2 py-1 rounded bg-[#131E2A] border-r-2 border-sky-400 text-[10px] text-sky-300 flex items-center gap-1">
                      <CornerUpRight className="w-3 h-3" />
                      <span>متصل به پست قبلی زنجیرهٔ رویداد در کانال</span>
                    </div>
                  )}

                  <div className="text-[11.5px] leading-relaxed whitespace-pre-wrap line-clamp-4">
                    {simResult.generatedOutputs.telegram.text}
                  </div>

                  {/* Simulated Glass Inline Keyboard */}
                  <div className="space-y-1 pt-1">
                    {simResult.messengerConfig.inlineFullStory && (
                      <div className="w-full py-1 px-2 rounded-lg bg-white/10 text-center text-[10.5px] font-medium flex items-center justify-center gap-1">
                        <span>📖 متن کامل خبر</span>
                        <ExternalLink className="w-3 h-3 text-sky-300" />
                      </div>
                    )}
                    {simResult.messengerConfig.inlineReactions && (
                      <div className="grid grid-cols-3 gap-1 text-[10.5px]">
                        <span className="py-1 rounded-lg bg-white/10 text-center">👍 ۴۲</span>
                        <span className="py-1 rounded-lg bg-white/10 text-center">👎 ۵</span>
                        <span className="py-1 rounded-lg bg-white/10 text-center">🔥 ۸۹</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
