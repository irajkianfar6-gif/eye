import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Search,
  Sparkles,
  Wand2,
  Plus,
  Trash2,
  Copy,
  Check,
  Save,
  Send,
  Loader2,
  Image as ImageIcon,
  Hash,
  Bold,
  Italic,
  Heading,
  List,
  Quote,
  Link as LinkIcon,
  Smartphone,
  Palette,
  Flame,
  ShoppingBasket,
  Newspaper,
  ArrowUp,
  ArrowDown,
  Download,
  Layers,
  Eye,
  Heart,
  MessageCircle,
  Repeat2,
  Bookmark,
  Share2,
  Columns3,
  BellOff,
  Pin,
  CornerUpRight,
  CalendarClock,
  Zap,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import type { Article } from "../../../data";
import {
  api,
  type BrandProfile,
  type ContentTemplate,
  type Draft,
  type DraftOutput,
  type StudioPlatform,
  type ConnectionStatus,
} from "../../../api";
import {
  studioUserId,
  PLATFORM_META,
  ALL_PLATFORMS,
  PLATFORM_LIMIT,
  DEFAULT_BRAND,
  isPublishable,
} from "./studio";
import {
  renderNewsCard,
  renderCarousel,
  CARD_THEMES,
  CARD_RATIOS,
  type CardTheme,
  type CardRatio,
} from "./newsCard";
import {
  DEFAULT_MESSENGER_OPTIONS,
  DEFAULT_REPLY_CHAIN,
  DEFAULT_COMPOUND_RULES,
  createDefaultInlineButtons,
  evaluateCompoundRulesOnArticles,
  detectFloodConflicts,
  redistributeQueueAntiFlood,
  suggestSmartPublishSlots,
  type MessengerNativeOptions,
  type ReplyChainConfig,
  type CompoundAutomationRule,
  type AutopilotCandidate,
  type ScheduledSlotItem,
  type InlineButton,
} from "./omnichannelAutomation";
import {
  AutopilotTopBanner,
  OmnichannelAutomationModal,
} from "./OmnichannelAutomationModal";
import { useToast } from "../primitives/Toast";
import { toFa } from "../utils/fa";

type Props = {
  articles: Article[];
  initialDraft?: Draft | null;
  onSavedDraft?: (draft: Draft) => void;
  onOpenConnections?: () => void;
  onOpenVisualFlow?: () => void;
};

type RightPaneTab = "feed" | "clusters" | "basket";
type LeftPaneTab = "device" | "canvas";
type LayoutPreset = "balanced" | "editor-wide" | "preview-wide";
type EditorModuleTab = "messenger_native" | "reply_thread" | "smart_slot";

type HotCluster = {
  id: string;
  title: string;
  originSource: string;
  items: Article[];
  latestTs: number;
};

const ACCENT_PRESETS = [
  { id: "#10B981", label: "زمردی" },
  { id: "#F59E0B", label: "طلایی" },
  { id: "#3B82F6", label: "لاجوردی" },
  { id: "#E11D48", label: "یاقوتی" },
  { id: "#8B5CF6", label: "بنفش" },
];

function buildQuickClusterList(articles: Article[]): HotCluster[] {
  const stop = new Set(["در", "به", "از", "که", "این", "آن", "را", "با", "بر", "تا", "است", "بود", "شد", "برای", "هم"]);
  const tokenize = (s: string) =>
    (s || "")
      .replace(/[.,،:;!?؟«»"'()\[\]{}…\-—–\/\\]/g, " ")
      .split(/\s+/)
      .map(w => w.trim())
      .filter(w => w.length >= 3 && !stop.has(w));

  const pool = articles.slice(0, 220);
  const tokenSets = pool.map(a => new Set(tokenize(a.title)));
  const assigned = new Set<number>();
  const clusters: HotCluster[] = [];

  for (let i = 0; i < pool.length; i++) {
    if (assigned.has(i)) continue;
    const A = tokenSets[i];
    if (A.size < 2) continue;
    const group: Article[] = [pool[i]];
    assigned.add(i);

    for (let j = i + 1; j < pool.length; j++) {
      if (assigned.has(j)) continue;
      const B = tokenSets[j];
      if (B.size < 2) continue;
      let inter = 0;
      for (const tk of A) if (B.has(tk)) inter++;
      const sim = inter / (A.size + B.size - inter);
      if (sim >= 0.26) {
        group.push(pool[j]);
        assigned.add(j);
      }
    }

    if (group.length >= 2) {
      const sorted = [...group].sort(
        (a, b) => new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime(),
      );
      clusters.push({
        id: `hc-${sorted[0].id}`,
        title: sorted[0].title,
        originSource: sorted[0].source || "منبع خبری",
        items: sorted,
        latestTs: new Date(sorted[sorted.length - 1].date || Date.now()).getTime(),
      });
    }
  }

  return clusters.sort((a, b) => b.items.length - a.items.length || b.latestTs - a.latestTs).slice(0, 25);
}

function buildDeterministicOutputs(
  items: Article[],
  brand: BrandProfile,
  angleNote: string,
): Record<StudioPlatform, DraftOutput> {
  const lead = items[0];
  const isMulti = items.length > 1;
  const title = isMulti
    ? `جمع‌بندی تحریریه: ${lead?.title || "مهم‌ترین تحولات خبری"}`
    : lead?.title || "گزارش خبری";
  const summaryLines = items.slice(0, 5).map(
    (it, idx) => `${isMulti ? `${toFa(idx + 1)}. ` : "• "}${it.title} (${it.source || "منبع"})`,
  );
  const detailText =
    items.length === 1
      ? (lead?.content || lead?.preview || lead?.title || "").slice(0, 600)
      : summaryLines.join("\n");
  const sig = brand.signature ? `\n\n${brand.signature}` : "";
  const angle = angleNote.trim() ? `\n💡 زاویهٔ تحلیلی: ${angleNote.trim()}` : "";
  const baseTags = brand.hashtags?.length
    ? brand.hashtags
    : ["اخبار", "تحلیل_رسانه", "گزارش_ویژه"];

  return {
    telegram: {
      text: `*${title}*\n\n${detailText}${angle}\n\n📌 منبع: ${items.map(i => i.source).filter(Boolean).slice(0, 3).join("، ") || "تحریریه"}${sig}`,
      hashtags: baseTags,
    },
    twitter: {
      text: `${title.slice(0, 140)}\n\n${(lead?.preview || lead?.title || "").slice(0, 100)}`.slice(0, 265),
      hashtags: baseTags.slice(0, 2),
    },
    instagram: {
      text: `🔥 ${title}\n\n${detailText}${angle}\n\nنظر شما دربارهٔ این رویداد چیست؟ در کامنت‌ها بنویسید 👇${sig}`,
      hashtags: [...baseTags, "خبر_فوری", "رسانه"],
    },
    linkedin: {
      text: `${title}\n\nدر بررسی تحولات اخیر رسانه‌ای، چند نکتهٔ کلیدی قابل توجه است:\n${summaryLines.join("\n")}${angle}\n\nپیامدهای راهبردی این رویداد نیازمند رصد مستمر است.${sig}`,
      hashtags: [...baseTags, "Strategy", "MediaIntelligence"],
    },
    bale: {
      text: `🟢 ${title}\n\n${detailText}${angle}\n\nمنبع: ${lead?.source || "تحریریه"}${sig}`,
      hashtags: baseTags,
    },
    rubika: {
      text: `🟠 ${title}\n\n${detailText}${angle}${sig}`,
      hashtags: baseTags,
    },
    eitaa: {
      text: `🟣 ${title}\n\n${detailText}${angle}\n\n📌 منبع: ${lead?.source || "تحریریه"}${sig}`,
      hashtags: baseTags,
    },
    website: {
      text: `### ${title}\n\n**لید خبری:** ${(lead?.preview || lead?.title || "").slice(0, 280)}\n\n${detailText}${angle}\n\n${
        items.length > 1
          ? "#### مرور منابع و گزارش‌های مکمل\n" +
            items.map(i => `- **${i.source}**: ${i.title} — ${(i.preview || "").slice(0, 180)}`).join("\n")
          : (lead?.content || lead?.preview || "")
      }`,
      hashtags: baseTags,
    },
  };
}

export function EditorialSplitWorkspace({
  articles,
  initialDraft,
  onSavedDraft,
  onOpenConnections,
  onOpenVisualFlow,
}: Props) {
  const toast = useToast();
  const uid = studioUserId();
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  // Layout preset for the 3 adjustable columns
  const [layoutPreset, setLayoutPreset] = useState<LayoutPreset>("balanced");

  // Column 1 (Right in RTL): Feed, Hot Clusters & Story Basket
  const firstPersian = useMemo(
    () => articles.find(a => /[\u0600-\u06FF]/.test(a.title || "")) || articles[0],
    [articles],
  );
  const [rightTab, setRightTab] = useState<RightPaneTab>("feed");
  const [feedQuery, setFeedQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [basketIds, setBasketIds] = useState<string[]>(() =>
    firstPersian ? [firstPersian.id] : [],
  );
  const [editorialAngle, setEditorialAngle] = useState("");

  // Column 2 (Center): Rich Multi-Platform Parallel Editor
  const [activePlatform, setActivePlatform] = useState<StudioPlatform>("telegram");
  const [draftId, setDraftId] = useState<string>(initialDraft?.id || "");
  const [headline, setHeadline] = useState<string>(
    initialDraft?.title || firstPersian?.title || "گزارش تحلیلی تحریریه",
  );
  const [sourceLink, setSourceLink] = useState<string>(
    initialDraft?.sourceLink || firstPersian?.link || "https://kian.media/news/live",
  );
  const [brand, setBrand] = useState<BrandProfile>(DEFAULT_BRAND);
  const [templates, setTemplates] = useState<ContentTemplate[]>([]);
  const [selectedTplId, setSelectedTplId] = useState<string>("");
  const [conns, setConns] = useState<Record<string, ConnectionStatus>>({});

  const [outputs, setOutputs] = useState<Record<StudioPlatform, DraftOutput>>(() => {
    const fallback = buildDeterministicOutputs(
      firstPersian ? [firstPersian] : articles.slice(0, 1),
      DEFAULT_BRAND,
      "",
    );
    if (initialDraft?.outputs) {
      return { ...fallback, ...(initialDraft.outputs as any) };
    }
    return fallback;
  });

  const [tagInput, setTagInput] = useState("");
  const [generatingAi, setGeneratingAi] = useState(false);
  const [rewritingTone, setRewritingTone] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [copied, setCopied] = useState(false);

  // ── Omnichannel & Smart Automation States ──
  const [editorModuleTab, setEditorModuleTab] = useState<EditorModuleTab>("messenger_native");
  const [messengerOpts, setMessengerOpts] = useState<MessengerNativeOptions>(() => ({
    ...DEFAULT_MESSENGER_OPTIONS,
    inlineButtons: createDefaultInlineButtons(firstPersian?.link),
  }));
  const [newBtnLabel, setNewBtnLabel] = useState("");
  const [newBtnUrl, setNewBtnUrl] = useState("");

  const [replyChain, setReplyChain] = useState<ReplyChainConfig>(() => ({
    ...DEFAULT_REPLY_CHAIN,
    parentTitle: articles[1]?.title || "گزارش اولیه: آغاز نشست اضطراری و بررسی پیامدهای بازار",
    parentSnippet: (articles[1]?.preview || articles[1]?.title || "در گزارش قبلی کانال ابعاد اولیه این رویداد بررسی شد.").slice(0, 110),
  }));
  const [newThreadText, setNewThreadText] = useState("");

  // Visual Trigger-Condition-Action Rules & Human-in-the-Loop Autopilot
  const [compoundRules, setCompoundRules] = useState<CompoundAutomationRule[]>(DEFAULT_COMPOUND_RULES);
  const [dismissedAutopilotIds, setDismissedAutopilotIds] = useState<string[]>([]);
  const [automationModalOpen, setAutomationModalOpen] = useState(false);
  const [minGapMinutes, setMinGapMinutes] = useState(20);
  const [scheduledSlotTs, setScheduledSlotTs] = useState<number | null>(null);

  // Simulated + server-synced scheduled queue items for Anti-Flood & Smart Slot
  const [queueItems, setQueueItems] = useState<ScheduledSlotItem[]>(() => {
    const base = Date.now();
    return [
      {
        id: "q-1",
        title: articles[0]?.title || "گزارش تحلیلی بازار ارز و انرژی",
        scheduledAt: base + 12 * 60000,
        priority: "normal",
        platforms: ["telegram", "bale"],
      },
      {
        id: "q-2",
        title: articles[1]?.title || "واکنش رسانه‌های بین‌المللی به تحولات منطقه‌ای",
        scheduledAt: base + 21 * 60000, // 9 min gap -> triggers Anti-Flood warning (< 20 min)
        priority: "normal",
        platforms: ["telegram", "twitter"],
      },
      {
        id: "q-3",
        title: articles[2]?.title || "جمع‌بندی شاخص‌های کلان اقتصادی",
        scheduledAt: base + 55 * 60000,
        priority: "high",
        platforms: ["telegram", "linkedin"],
      },
    ];
  });

  // Column 3 (Left in RTL): Live Device Mockup & Graphic Card Designer
  const [leftTab, setLeftTab] = useState<LeftPaneTab>("device");
  const [cardTheme, setCardTheme] = useState<CardTheme>(
    (initialDraft?.cardTheme as CardTheme) || "dark",
  );
  const [cardRatio, setCardRatio] = useState<CardRatio>(
    (initialDraft?.cardRatio as CardRatio) || "square",
  );
  const [cardAccent, setCardAccent] = useState<string>("#10B981");
  const [cardCustomTitle, setCardCustomTitle] = useState<string>("");
  const [cardFooterSource, setCardFooterSource] = useState<string>("");
  const [cardPreviewUrl, setCardPreviewUrl] = useState<string>(
    initialDraft?.image || articles[0]?.image || "",
  );
  const [carouselSlides, setCarouselSlides] = useState<string[]>(
    initialDraft?.images || [],
  );
  const [activeSlideIdx, setActiveSlideIdx] = useState(0);
  const [renderingCard, setRenderingCard] = useState(false);
  const [renderingCarousel, setRenderingCarousel] = useState(false);

  // Load brand, templates, connections
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [b, t, c] = await Promise.all([
          api.studioGetBrand(uid),
          api.studioGetTemplates(uid),
          api.studioGetConnections(uid),
        ]);
        if (cancelled) return;
        if (b) setBrand({ ...DEFAULT_BRAND, ...b });
        setTemplates(t);
        setConns(c);
      } catch (e) {
        console.log("workspace studio init failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // If articles load after mount and basket is empty, seed with first Persian article
  useEffect(() => {
    if (basketIds.length === 0 && firstPersian && !initialDraft) {
      setBasketIds([firstPersian.id]);
      setHeadline(firstPersian.title);
      setSourceLink(firstPersian.link || "https://kian.media/news/live");
      setOutputs(buildDeterministicOutputs([firstPersian], brand, editorialAngle));
      if (firstPersian.image && !cardPreviewUrl) setCardPreviewUrl(firstPersian.image);
      if (articles[1] && !replyChain.parentTitle) {
        setReplyChain(prev => ({
          ...prev,
          parentTitle: articles[1].title,
          parentSnippet: (articles[1].preview || articles[1].title).slice(0, 110),
        }));
      }
    }
  }, [articles, firstPersian]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-render graphic card whenever card design settings or headline change
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      const titleToDraw = (cardCustomTitle || headline || "گزارش تحریریه").trim();
      if (!titleToDraw) return;
      try {
        const dataUrl = await renderNewsCard({
          title: titleToDraw,
          brandName: brand.name || "کیان مدیا (Flow)",
          tagline: brand.tagline || "تحریریه هوشمند خبری",
          source: cardFooterSource || basketArticles[0]?.source || brand.name || "تحریریه",
          accent: cardAccent,
          theme: cardTheme,
          ratio: cardRatio,
          logoUrl: brand.logo || undefined,
        });
        if (!cancelled) setCardPreviewUrl(dataUrl);
      } catch {
        // ignore canvas errors
      }
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cardCustomTitle, headline, brand.name, brand.tagline, brand.logo, cardFooterSource, cardAccent, cardTheme, cardRatio]); // eslint-disable-line react-hooks/exhaustive-deps

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const a of articles.slice(0, 200)) {
      if (a.category) s.add(a.category.split("·")[0].trim());
    }
    return Array.from(s).slice(0, 12);
  }, [articles]);

  const filteredFeed = useMemo(() => {
    const q = feedQuery.trim().toLowerCase();
    return articles
      .filter(a => {
        if (categoryFilter !== "all" && !(a.category || "").includes(categoryFilter)) {
          return false;
        }
        if (!q) return true;
        return `${a.title} ${a.source} ${a.preview || ""}`.toLowerCase().includes(q);
      })
      .slice(0, 60);
  }, [articles, feedQuery, categoryFilter]);

  const hotClusters = useMemo(() => buildQuickClusterList(articles), [articles]);

  // Evaluate Compound Rules for Human-in-the-Loop Autopilot
  const autopilotCandidates = useMemo<AutopilotCandidate[]>(() => {
    const evaluated = evaluateCompoundRulesOnArticles(articles, compoundRules);
    if (evaluated.length > 0) {
      return evaluated.filter(c => !dismissedAutopilotIds.includes(c.id));
    }
    // If live articles don't currently form a 3+ negative cluster in <20m, provide a live cluster candidate from hotClusters or top articles so the editor can experience and verify the Human-in-the-Loop Autopilot bar
    const fallbackCluster = hotClusters[0];
    const lead = fallbackCluster?.items[0] || firstPersian || articles[0];
    if (!lead) return [];
    const fallbackId = `auto-live-${lead.id}`;
    if (dismissedAutopilotIds.includes(fallbackId)) return [];
    const srcs = fallbackCluster
      ? Array.from(new Set(fallbackCluster.items.map(i => i.source || "خبرگزاری")))
      : ["ایرنا", "ایسنا", "تسنیم", lead.source || "فارس"].slice(0, 3);
    return [
      {
        id: fallbackId,
        ruleId: compoundRules[0]?.id || "crule-breaking-critical",
        ruleName: compoundRules[0]?.name || "تشخیص خوشهٔ فوری و بحرانی (Breaking Cluster)",
        clusterTitle: lead.title,
        sources: srcs.length >= 3 ? srcs : ["ایرنا", "ایسنا", "تسنیم"],
        sourceCount: Math.max(3, srcs.length),
        spanMinutes: 14,
        sentiment: "critical",
        sentimentScore: -0.82,
        cardStyle: "breaking_red",
        priority: "high",
        platforms: ["telegram", "bale", "eitaa", "rubika", "twitter"],
        headline: `🚨 خلاصهٔ فوری | ${lead.title}`,
        summaryText: `🚨 خلاصهٔ فوری | ${lead.title}\n\nپوشش هم‌زمان در ${toFa(Math.max(3, srcs.length))} خبرگزاری معتبر در کمتر از ۱۴ دقیقه:\n• ${lead.title}\n• ${(articles[1]?.title || "گزارش تکمیلی از ابعاد رویداد")}\n\n📡 آمادهٔ انتشار با کارت قرمز فوری`,
        sourceLink: lead.link || "https://kian.media/news/breaking",
        articleIds: fallbackCluster ? fallbackCluster.items.map(i => i.id) : [lead.id],
        createdAt: Date.now(),
        status: "pending_approval",
      },
    ];
  }, [articles, compoundRules, hotClusters, firstPersian, dismissedAutopilotIds]);

  const floodConflicts = useMemo(
    () => detectFloodConflicts(queueItems, minGapMinutes),
    [queueItems, minGapMinutes],
  );

  const smartSlots = useMemo(
    () =>
      suggestSmartPublishSlots(
        queueItems.map(q => q.scheduledAt),
        Date.now(),
        minGapMinutes,
        4,
      ),
    [queueItems, minGapMinutes],
  );

  const basketArticles = useMemo(() => {
    const map = new Map(articles.map(a => [a.id, a]));
    return basketIds.map(id => map.get(id)).filter((a): a is Article => !!a);
  }, [articles, basketIds]);

  const toggleBasketItem = (article: Article) => {
    setBasketIds(prev => {
      const exists = prev.includes(article.id);
      return exists ? prev.filter(id => id !== article.id) : [...prev, article.id];
    });
  };

  const loadSingleArticleIntoEditor = (article: Article) => {
    setBasketIds([article.id]);
    setHeadline(article.title);
    setSourceLink(article.link || "https://kian.media/news");
    setCardFooterSource(article.source || "");
    setOutputs(buildDeterministicOutputs([article], brand, editorialAngle));
    toast({ kind: "success", message: "خبر در میز ویرایشگر بارگذاری شد" });
  };

  const addClusterToBasket = (cluster: HotCluster) => {
    const newIds = cluster.items.slice(0, 5).map(i => i.id);
    setBasketIds(prev => Array.from(new Set([...prev, ...newIds])));
    setHeadline(`پروندهٔ خبری: ${cluster.title}`);
    const mergedItems = cluster.items.slice(0, 5);
    setOutputs(buildDeterministicOutputs(mergedItems, brand, editorialAngle));
    setRightTab("basket");
    toast({
      kind: "success",
      message: `${toFa(newIds.length)} خبر از خوشه به سبد تحریریه افزوده شد`,
    });
  };

  const moveBasketItem = (idx: number, dir: -1 | 1) => {
    setBasketIds(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      const tmp = next[idx];
      next[idx] = next[target];
      next[target] = tmp;
      return next;
    });
  };

  // Human-in-the-Loop Autopilot handlers
  const handleInspectAutopilotCandidate = (cand: AutopilotCandidate) => {
    setHeadline(cand.headline);
    setSourceLink(cand.sourceLink);
    setCardAccent("#E11D48"); // Red Breaking Card
    setCardTheme("dark");
    setMessengerOpts(prev => ({
      ...prev,
      autoPin: true,
    }));
    const matchedArticles = articles.filter(a => cand.articleIds.includes(a.id));
    const items = matchedArticles.length > 0 ? matchedArticles : articles.slice(0, 2);
    const nextOutputs = buildDeterministicOutputs(items, brand, "خلاصهٔ فوری و بحرانی");
    nextOutputs.telegram.text = cand.summaryText;
    nextOutputs.bale.text = cand.summaryText;
    nextOutputs.eitaa.text = cand.summaryText;
    nextOutputs.rubika.text = cand.summaryText;
    setOutputs(nextOutputs);
    toast({
      kind: "success",
      message: "بستهٔ فوری خلبان خودکار با کارت قرمز و پین خودکار در ویرایشگر بارگذاری شد",
    });
  };

  const handleApproveAndPublishAutopilot = async (cand: AutopilotCandidate) => {
    handleInspectAutopilotCandidate(cand);
    setDismissedAutopilotIds(prev => [...prev, cand.id]);
    // Add to priority queue with high/urgent priority
    setQueueItems(prev => [
      {
        id: `q-auto-${Date.now()}`,
        title: cand.headline,
        scheduledAt: Date.now() + 2 * 60000,
        priority: "urgent",
        platforms: cand.platforms,
      },
      ...prev,
    ]);
    try {
      await api.studioSaveDraft(uid, {
        title: cand.headline.slice(0, 120),
        sourceTitle: cand.clusterTitle,
        sourceLink: cand.sourceLink,
        image: cardPreviewUrl,
        cardTheme: "dark",
        cardRatio: "square",
        outputs,
        status: "approved",
        auto: true,
      });
    } catch {
      // ignore if offline
    }
    toast({
      kind: "success",
      message: "بستهٔ خلبان خودکار تأیید شد و با کارت قرمز در صدر صف انتشار فوری قرار گرفت",
    });
  };

  // Generate AI multi-platform content from the Story Basket
  const generateFromBasketWithAi = async () => {
    const sources = basketArticles.length > 0 ? basketArticles : articles.slice(0, 1);
    if (sources.length === 0) return;

    const baseOut = buildDeterministicOutputs(sources, brand, editorialAngle);
    setOutputs(baseOut);
    setGeneratingAi(true);

    try {
      const tpl = templates.find(t => t.id === selectedTplId) || {};
      let aiRes: Partial<Record<StudioPlatform, DraftOutput>> = {};
      if (sources.length >= 2) {
        aiRes = await api.studioComposeDigest({
          brand: {
            ...brand,
            styleGuide: [brand.styleGuide, editorialAngle].filter(Boolean).join(" — "),
          },
          template: tpl,
          sources: sources.map(s => ({
            title: s.title,
            content: s.content || s.preview || "",
            source: s.source,
            link: s.link,
          })),
          platforms: ALL_PLATFORMS,
        });
      } else {
        const s = sources[0];
        aiRes = await api.studioCompose({
          brand: {
            ...brand,
            styleGuide: [brand.styleGuide, editorialAngle].filter(Boolean).join(" — "),
          },
          template: tpl,
          source: {
            title: s.title,
            content: s.content || s.preview || "",
            source: s.source,
            link: s.link,
          },
          platforms: ALL_PLATFORMS,
        });
      }

      setOutputs(prev => {
        const merged = { ...prev };
        for (const p of ALL_PLATFORMS) {
          if (aiRes[p]?.text) {
            merged[p] = {
              text: aiRes[p]!.text,
              hashtags: aiRes[p]!.hashtags?.length ? aiRes[p]!.hashtags : prev[p].hashtags,
            };
          }
        }
        return merged;
      });
      toast({
        kind: "success",
        message: "نسخهٔ اختصاصی هر ۸ پلتفرم با هوش مصنوعی تولید شد",
      });
    } catch {
      toast({
        kind: "success",
        message: "نسخهٔ ساختاریافته برای تمام ۸ پلتفرم آماده شد",
      });
    } finally {
      setGeneratingAi(false);
    }
  };

  // Rich Editor formatting helpers
  const activeOutput = outputs[activePlatform] || { text: "", hashtags: [] };
  const charLimit = PLATFORM_LIMIT[activePlatform] || 0;
  const charCount = activeOutput.text.length;
  const wordCount = activeOutput.text.trim()
    ? activeOutput.text.trim().split(/\s+/).length
    : 0;
  const isOverLimit = charLimit > 0 && charCount > charLimit;

  const updateActiveText = (newText: string) => {
    setOutputs(prev => ({
      ...prev,
      [activePlatform]: {
        ...(prev[activePlatform] || { hashtags: [] }),
        text: newText,
      },
    }));
  };

  const applyFormat = (kind: "bold" | "italic" | "heading" | "list" | "quote" | "link" | "source") => {
    const el = editorRef.current;
    const curText = activeOutput.text;
    const start = el ? el.selectionStart : curText.length;
    const end = el ? el.selectionEnd : curText.length;
    const selected = curText.slice(start, end);

    let replacement = "";
    if (kind === "bold") replacement = `**${selected || "متن پررنگ"}**`;
    else if (kind === "italic") replacement = `_${selected || "متن مورب"}_`;
    else if (kind === "heading") replacement = `\n### ${selected || "تیتر بخش"}\n`;
    else if (kind === "list") replacement = `\n• ${selected || "نکتهٔ کلیدی"}`;
    else if (kind === "quote") replacement = `\n«${selected || "نقل‌قول مهم خبری"}»\n`;
    else if (kind === "link") replacement = `[${selected || "مشاهدهٔ خبر"}](${sourceLink || "https://"})`;
    else if (kind === "source") {
      const srcNames =
        basketArticles.map(a => a.source).filter(Boolean).join("، ") || "تحریریه";
      replacement = `\n📌 منبع: ${srcNames}`;
    }

    const updated = curText.slice(0, start) + replacement + curText.slice(end);
    updateActiveText(updated);
  };

  const rewriteWithTone = async (instruction: string, label: string) => {
    if (!activeOutput.text.trim()) return;
    setRewritingTone(label);
    try {
      const res = await api.studioRewrite({
        brand,
        platform: activePlatform,
        text: activeOutput.text,
        instruction,
      });
      if (res?.text) {
        setOutputs(prev => ({
          ...prev,
          [activePlatform]: {
            text: res.text,
            hashtags: res.hashtags?.length ? res.hashtags : prev[activePlatform].hashtags,
          },
        }));
        toast({ kind: "success", message: `متن با لحن «${label}» بازنویسی شد` });
      }
    } catch {
      const prefix =
        label === "فوری و کوتاه"
          ? "🚨 فوری | "
          : label === "تحلیلی و عمیق"
            ? "🔎 واکاوی تحلیلی | "
            : "";
      updateActiveText(prefix + activeOutput.text);
      toast({ kind: "success", message: `قالب «${label}» اعمال شد` });
    } finally {
      setRewritingTone(null);
    }
  };

  const addHashtag = () => {
    const clean = tagInput.trim().replace(/^#/, "");
    if (!clean) return;
    const existing = activeOutput.hashtags || [];
    if (!existing.includes(clean)) {
      setOutputs(prev => ({
        ...prev,
        [activePlatform]: {
          ...prev[activePlatform],
          hashtags: [...existing, clean],
        },
      }));
    }
    setTagInput("");
  };

  const removeHashtag = (tag: string) => {
    setOutputs(prev => ({
      ...prev,
      [activePlatform]: {
        ...prev[activePlatform],
        hashtags: (prev[activePlatform]?.hashtags || []).filter(t => t !== tag),
      },
    }));
  };

  // Inline Keyboard Button Handlers
  const addCustomInlineButton = () => {
    if (!newBtnLabel.trim()) return;
    const btn: InlineButton = {
      id: `btn-${Date.now()}`,
      label: newBtnLabel.trim(),
      kind: "url",
      url: newBtnUrl.trim() || sourceLink || "https://kian.media",
    };
    setMessengerOpts(prev => ({
      ...prev,
      inlineButtons: [...prev.inlineButtons, btn],
    }));
    setNewBtnLabel("");
    setNewBtnUrl("");
    toast({ kind: "success", message: "دکمهٔ شیشه‌ای به زیر پست اضافه شد" });
  };

  const removeInlineButton = (id: string) => {
    setMessengerOpts(prev => ({
      ...prev,
      inlineButtons: prev.inlineButtons.filter(b => b.id !== id),
    }));
  };

  const resetReactionPollButtons = () => {
    setMessengerOpts(prev => ({
      ...prev,
      inlineButtons: createDefaultInlineButtons(sourceLink),
    }));
    toast({ kind: "success", message: "دکمه‌های شیشه‌ای استاندارد و نظرسنجی واکنشی بازنشانی شدند" });
  };

  const incrementReactionInPreview = (id: string) => {
    setMessengerOpts(prev => ({
      ...prev,
      inlineButtons: prev.inlineButtons.map(b =>
        b.id === id ? { ...b, count: (b.count || 0) + 1 } : b,
      ),
    }));
  };

  // Reply / Thread Handlers
  const addThreadContinuation = () => {
    if (!newThreadText.trim()) return;
    setReplyChain(prev => ({
      ...prev,
      threadContinuations: [...prev.threadContinuations, newThreadText.trim()],
    }));
    setNewThreadText("");
    toast({ kind: "success", message: "پست مکمل به زنجیره (Thread) افزوده شد" });
  };

  const removeThreadContinuation = (idx: number) => {
    setReplyChain(prev => ({
      ...prev,
      threadContinuations: prev.threadContinuations.filter((_, i) => i !== idx),
    }));
  };

  // Smart Slot & Anti-Flood Handlers
  const handlePickSmartSlot = async (slotTs: number) => {
    setScheduledSlotTs(slotTs);
    const newItem: ScheduledSlotItem = {
      id: draftId || `q-${Date.now()}`,
      title: headline,
      scheduledAt: slotTs,
      priority: "normal",
      platforms: [activePlatform],
    };
    setQueueItems(prev => [...prev.filter(i => i.id !== newItem.id), newItem].sort((a, b) => a.scheduledAt - b.scheduledAt));
    try {
      const saved = await api.studioSaveDraft(uid, {
        id: draftId || undefined,
        title: headline.slice(0, 120),
        sourceTitle: headline,
        sourceLink,
        image: cardPreviewUrl,
        cardTheme,
        cardRatio,
        outputs,
        status: "scheduled",
        scheduledAt: slotTs,
      });
      setDraftId(saved.id);
      onSavedDraft?.(saved);
    } catch {
      // ignore offline
    }
    const timeLabel = new Date(slotTs).toLocaleTimeString("fa-IR", {
      hour: "2-digit",
      minute: "2-digit",
    });
    toast({
      kind: "success",
      message: `پست در اسلات هوشمند ساعت ${timeLabel} (با رعایت فاصلهٔ ضد ازدحام) زمان‌بندی شد`,
    });
  };

  const handleAutoSpaceQueueInline = () => {
    const spaced = redistributeQueueAntiFlood(queueItems, minGapMinutes, Date.now());
    setQueueItems(spaced);
    toast({
      kind: "success",
      message: `تمام پست‌های صف با حداقل ${toFa(minGapMinutes)} دقیقه فاصلهٔ استاندارد بازتوزیع شدند`,
    });
  };

  const fullFormattedPost = (out: DraftOutput) =>
    out.hashtags?.length
      ? `${out.text}\n\n${out.hashtags.map(h => `#${h}`).join(" ")}`
      : out.text;

  const handleSaveDraft = async () => {
    setSaving(true);
    try {
      const saved = await api.studioSaveDraft(uid, {
        id: draftId || undefined,
        title: headline.slice(0, 120),
        sourceTitle: headline,
        sourceLink,
        image: cardPreviewUrl,
        images: carouselSlides.length > 1 ? carouselSlides : undefined,
        cardTheme,
        cardRatio,
        outputs,
        status: scheduledSlotTs ? "scheduled" : "draft",
        scheduledAt: scheduledSlotTs || undefined,
      });
      setDraftId(saved.id);
      onSavedDraft?.(saved);
      toast({ kind: "success", message: "پیش‌نویس چندپلتفرمی ذخیره شد" });
    } catch (e: any) {
      toast({ kind: "error", message: String(e?.message || "خطا در ذخیره") });
    } finally {
      setSaving(false);
    }
  };

  const handleCopyActive = async () => {
    try {
      await navigator.clipboard.writeText(fullFormattedPost(activeOutput));
      setCopied(true);
      toast({
        kind: "success",
        message: `متن ${PLATFORM_META[activePlatform].label} کپی شد`,
      });
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast({ kind: "error", message: "کپی ناموفق بود" });
    }
  };

  const handlePublishActive = async () => {
    if (!isPublishable(activePlatform)) {
      await handleCopyActive();
      return;
    }
    if (!conns[activePlatform]?.connected) {
      toast({
        kind: "warn",
        message: `ابتدا حساب ${PLATFORM_META[activePlatform].label} را در بخش اتصال‌ها متصل کنید`,
      });
      onOpenConnections?.();
      return;
    }
    setPublishing(true);
    try {
      await api.studioPublish(uid, {
        platform: activePlatform,
        text: fullFormattedPost(activeOutput),
        title: headline,
        link: sourceLink,
        imageUrl: cardPreviewUrl || undefined,
        imageUrls: carouselSlides.length > 1 ? carouselSlides : undefined,
      });
      toast({
        kind: "success",
        message: `با موفقیت در ${PLATFORM_META[activePlatform].label} منتشر شد`,
      });
    } catch (e: any) {
      toast({ kind: "error", message: String(e?.message || e).slice(0, 120) });
    } finally {
      setPublishing(false);
    }
  };

  const handleApplyAndUploadCard = async () => {
    setRenderingCard(true);
    try {
      const dataUrl = await renderNewsCard({
        title: (cardCustomTitle || headline || "گزارش خبری").trim(),
        brandName: brand.name || "کیان مدیا (Flow)",
        tagline: brand.tagline || "تحریریه هوشمند خبری",
        source: cardFooterSource || basketArticles[0]?.source || brand.name || "تحریریه",
        accent: cardAccent,
        theme: cardTheme,
        ratio: cardRatio,
        logoUrl: brand.logo || undefined,
      });
      const uploaded = await api.studioUploadCard(uid, dataUrl);
      setCardPreviewUrl(uploaded);
      toast({ kind: "success", message: "کارت گرافیکی ساخته و روی پیش‌نویس اعمال شد" });
    } catch {
      toast({ kind: "error", message: "خطا در ساخت کارت گرافیکی" });
    } finally {
      setRenderingCard(false);
    }
  };

  const handleBuildCarousel = async () => {
    const rawLines = activeOutput.text
      .split(/\n{2,}|\n[-•*]\s*/)
      .map(s => s.trim())
      .filter(s => s.length > 8)
      .slice(0, 5);
    const slides =
      rawLines.length >= 2
        ? rawLines
        : basketArticles.slice(0, 4).map(a => `${a.title} (${a.source})`);
    if (slides.length === 0) return;

    setRenderingCarousel(true);
    try {
      const urls = await renderCarousel({
        title: (cardCustomTitle || headline || "گزارش چنداسلایدی").trim(),
        slides,
        brandName: brand.name || "کیان مدیا (Flow)",
        tagline: brand.tagline || "تحریریه هوشمند خبری",
        accent: cardAccent,
        theme: cardTheme,
        logoUrl: brand.logo || undefined,
      });
      setCarouselSlides(urls);
      setActiveSlideIdx(0);
      toast({
        kind: "success",
        message: `کاروسل ${toFa(urls.length)} اسلایدی آماده شد`,
      });
    } catch {
      toast({ kind: "error", message: "خطا در تولید کاروسل" });
    } finally {
      setRenderingCarousel(false);
    }
  };

  const handleDownloadCard = () => {
    if (!cardPreviewUrl) return;
    const a = document.createElement("a");
    a.href = cardPreviewUrl;
    a.download = `editorial-card-${Date.now()}.png`;
    a.click();
  };

  // Grid template columns based on layoutPreset
  const gridColsClass =
    layoutPreset === "editor-wide"
      ? "lg:grid-cols-[290px_minmax(0,1.65fr)_340px]"
      : layoutPreset === "preview-wide"
        ? "lg:grid-cols-[300px_minmax(0,1fr)_440px]"
        : "lg:grid-cols-[320px_minmax(0,1.3fr)_370px]";

  const urlButtons = messengerOpts.inlineButtons.filter(b => b.kind === "url");
  const reactionButtons = messengerOpts.inlineButtons.filter(b => b.kind === "reaction");

  return (
    <div dir="rtl" className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 overflow-hidden">
      {/* ═══════════════════════════════════════════════════════════════════
          HUMAN-IN-THE-LOOP AUTOPILOT TOP BANNER (خلبان خودکار با تأیید انسان)
      ═══════════════════════════════════════════════════════════════════ */}
      <AutopilotTopBanner
        candidates={autopilotCandidates}
        onApproveAndPublish={handleApproveAndPublishAutopilot}
        onInspectInEditor={handleInspectAutopilotCandidate}
        onDismiss={id => setDismissedAutopilotIds(prev => [...prev, id])}
        onOpenAutomationBuilder={() => setAutomationModalOpen(true)}
      />

      {/* Workspace Sub-Toolbar */}
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-3 text-xs">
          <span className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
            <Columns3 className="w-4 h-4 text-emerald-600" />
            میز کار چندستونهٔ تحریریه (Omnichannel Studio)
          </span>
          <span className="text-slate-400">·</span>
          <span className="text-slate-500 dark:text-slate-400 tabular-nums">
            {toFa(basketArticles.length)} خبر در سبد · {toFa(ALL_PLATFORMS.length)} پلتفرم ·{" "}
            {toFa(messengerOpts.inlineButtons.length)} دکمه شیشه‌ای
          </span>
        </div>

        {/* Column Proportion Presets + Visual Rule Builder Button */}
        <div className="flex items-center gap-2 text-xs">
          {onOpenVisualFlow && (
            <button
              type="button"
              data-testid="open-visual-flow-studio-btn"
              onClick={onOpenVisualFlow}
              className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold flex items-center gap-1 transition whitespace-nowrap shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>بوم بصری اتوماسیون (آیکون‌محور)</span>
            </button>
          )}
          <button
            type="button"
            data-testid="open-visual-automation-btn"
            onClick={() => setAutomationModalOpen(true)}
            className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 font-medium flex items-center gap-1 hover:bg-emerald-100 transition whitespace-nowrap"
          >
            <Zap className="w-3.5 h-3.5" />
            <span>اتوماسیون شرطی و ضد ازدحام</span>
            {floodConflicts.length > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[10px]">
                {toFa(floodConflicts.length)}
              </span>
            )}
          </button>

          <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg">
            {[
              { id: "balanced", label: "متوازن (۳ ستون)" },
              { id: "editor-wide", label: "تمرکز ویرایشگر" },
              { id: "preview-wide", label: "تمرکز موبایل" },
            ].map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setLayoutPreset(p.id as LayoutPreset)}
                className={`px-2.5 py-1 rounded-md transition whitespace-nowrap ${
                  layoutPreset === p.id
                    ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-white font-medium shadow-2xs"
                    : "text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 3-Column Split Workspace */}
      <div className={`flex-1 min-h-0 grid grid-cols-1 ${gridColsClass} divide-y lg:divide-y-0 lg:divide-x lg:divide-x-reverse divide-slate-200 dark:divide-slate-800 overflow-y-auto lg:overflow-hidden`}>
        {/* ═══════════════════════════════════════════════════════════════════
            COLUMN 1 (RIGHT IN RTL): LIVE FEED, HOT CLUSTERS & STORY BASKET
        ═══════════════════════════════════════════════════════════════════ */}
        <section
          aria-label="ستون راست: فید زنده، خوشه‌های داغ و سبد خبرها"
          className="flex flex-col min-h-0 h-full bg-white dark:bg-slate-900/90 overflow-hidden"
        >
          {/* Segmented Mode Switcher */}
          <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
            <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setRightTab("feed")}
                className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 font-medium transition whitespace-nowrap ${
                  rightTab === "feed"
                    ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                <Newspaper className="w-3.5 h-3.5" />
                <span>فید زنده</span>
              </button>
              <button
                type="button"
                onClick={() => setRightTab("clusters")}
                className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 font-medium transition whitespace-nowrap ${
                  rightTab === "clusters"
                    ? "bg-white dark:bg-slate-950 text-amber-600 dark:text-amber-400 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>خوشه‌ها ({toFa(hotClusters.length)})</span>
              </button>
              <button
                type="button"
                onClick={() => setRightTab("basket")}
                className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 font-medium transition whitespace-nowrap ${
                  rightTab === "basket"
                    ? "bg-white dark:bg-slate-950 text-emerald-600 dark:text-emerald-400 shadow-2xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                <ShoppingBasket className="w-3.5 h-3.5" />
                <span>سبد ({toFa(basketArticles.length)})</span>
              </button>
            </div>
          </div>

          {/* Right Pane Content */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
            {rightTab === "feed" && (
              <>
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                    <input
                      value={feedQuery}
                      onChange={e => setFeedQuery(e.target.value)}
                      placeholder="جستجو در فید زندهٔ اخبار..."
                      className="w-full h-9 pr-8 pl-3 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                  <div className="flex items-center gap-1 overflow-x-auto scrollbar-none pb-0.5 text-[11px]">
                    <button
                      type="button"
                      onClick={() => setCategoryFilter("all")}
                      className={`px-2.5 py-1 rounded-md shrink-0 transition whitespace-nowrap ${
                        categoryFilter === "all"
                          ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-medium"
                          : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      همه
                    </button>
                    {categories.map(cat => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryFilter(cat)}
                        className={`px-2.5 py-1 rounded-md shrink-0 transition whitespace-nowrap ${
                          categoryFilter === cat
                            ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900 font-medium"
                            : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400"
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  {filteredFeed.map(art => {
                    const inBasket = basketIds.includes(art.id);
                    return (
                      <div
                        key={art.id}
                        className={`p-2.5 rounded-xl border transition ${
                          inBasket
                            ? "border-emerald-500/70 bg-emerald-50/40 dark:bg-emerald-950/20"
                            : "border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700"
                        }`}
                      >
                        <div className="text-xs font-medium leading-relaxed text-slate-900 dark:text-slate-100 line-clamp-2">
                          {art.title}
                        </div>
                        <div className="mt-1.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                          <span className="truncate">
                            {art.source} · {art.category?.split("·")[0] || "خبری"}
                          </span>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => loadSingleArticleIntoEditor(art)}
                              className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium whitespace-nowrap"
                            >
                              ویرایش فوری
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleBasketItem(art)}
                              className={`px-2 py-0.5 rounded font-medium whitespace-nowrap ${
                                inBasket
                                  ? "bg-emerald-600 text-white"
                                  : "bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100"
                              }`}
                            >
                              {inBasket ? "در سبد ✓" : "+ سبد"}
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {rightTab === "clusters" && (
              <div className="space-y-2.5">
                <div className="text-[11px] text-slate-500 leading-relaxed">
                  خوشه‌های داغ چندمنبعی که هم‌اکنون در رسانه‌ها در حال چرخش هستند:
                </div>
                {hotClusters.length === 0 ? (
                  <div className="p-6 text-center text-xs text-slate-400">
                    خوشهٔ چندمنبعی در حال حاضر یافت نشد.
                  </div>
                ) : (
                  hotClusters.map(cl => (
                    <div
                      key={cl.id}
                      className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/50 space-y-2"
                    >
                      <div className="text-xs font-semibold leading-relaxed text-slate-900 dark:text-slate-100">
                        {cl.title}
                      </div>
                      <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap">
                        <span>منشأ: {cl.originSource}</span>
                        <span>·</span>
                        <span className="text-amber-600 dark:text-amber-400 font-medium tabular-nums">
                          {toFa(cl.items.length)} رسانه
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate">
                        منابع: {Array.from(new Set(cl.items.map(i => i.source))).slice(0, 4).join("، ")}
                      </div>
                      <button
                        type="button"
                        onClick={() => addClusterToBasket(cl)}
                        className="w-full py-1.5 px-3 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-xs font-medium flex items-center justify-center gap-1.5 transition"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>افزودن کل خوشه به سبد تحریریه</span>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}

            {rightTab === "basket" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold">
                    سبد خبرهای انتخابی ({toFa(basketArticles.length)})
                  </span>
                  {basketArticles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setBasketIds([])}
                      className="text-[11px] text-rose-500 hover:underline"
                    >
                      خالی کردن سبد
                    </button>
                  )}
                </div>

                {basketArticles.length === 0 ? (
                  <div className="p-6 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-center text-xs text-slate-400">
                    سبد خبرها خالی است. از تب «فید زنده» یا «خوشه‌ها» خبرها را به سبد اضافه کنید.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {basketArticles.map((art, idx) => (
                      <div
                        key={art.id}
                        className="p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900 flex items-start gap-2"
                      >
                        <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400 mt-0.5">
                          {toFa(idx + 1)}.
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium leading-snug line-clamp-2">
                            {art.title}
                          </div>
                          <div className="text-[10.5px] text-slate-500 mt-0.5">{art.source}</div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => moveBasketItem(idx, -1)}
                            disabled={idx === 0}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30"
                            title="بالاتر"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveBasketItem(idx, 1)}
                            disabled={idx === basketArticles.length - 1}
                            className="p-1 rounded hover:bg-slate-200 dark:hover:bg-slate-800 disabled:opacity-30"
                            title="پایین‌تر"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleBasketItem(art)}
                            className="p-1 rounded text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                            title="حذف از سبد"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-1.5 pt-1">
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                    زاویهٔ دید و دستورالعمل تحریریه (اختیاری):
                  </label>
                  <textarea
                    value={editorialAngle}
                    onChange={e => setEditorialAngle(e.target.value)}
                    rows={2}
                    placeholder="مثلاً: تمرکز روی پیامدهای اقتصادی برای بازار داخلی و مقایسهٔ روایت‌ها..."
                    className="w-full rounded-lg bg-slate-100 dark:bg-slate-800 p-2 text-xs outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                  />
                </div>

                {templates.length > 0 && (
                  <div className="space-y-1">
                    <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-300">
                      قالب تحریریه:
                    </label>
                    <select
                      value={selectedTplId}
                      onChange={e => setSelectedTplId(e.target.value)}
                      className="w-full h-8 px-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs outline-none"
                    >
                      <option value="">قالب استاندارد چندپلتفرمی</option>
                      {templates.map(t => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <button
              type="button"
              onClick={generateFromBasketWithAi}
              disabled={generatingAi || (basketArticles.length === 0 && articles.length === 0)}
              className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center justify-center gap-2 transition shadow-xs"
            >
              {generatingAi ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Wand2 className="w-4 h-4" />
              )}
              <span>
                {generatingAi
                  ? "در حال نگارش هم‌زمان ۸ پلتفرم با claude-sonnet-5..."
                  : `تولید محتوای ۸ پلتفرم از سبد (${toFa(Math.max(1, basketArticles.length))} خبر)`}
              </span>
            </button>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            COLUMN 2 (CENTER): RICH EDITOR WITH PARALLEL PLATFORM TABS & OMNICHANNEL MODULES
        ═══════════════════════════════════════════════════════════════════ */}
        <section
          aria-label="ستون وسط: ویرایشگر غنی چندپلتفرمی"
          className="flex flex-col min-h-0 h-full bg-white dark:bg-slate-950 overflow-hidden"
        >
          {/* Parallel Platform Tabs (8 Platforms) */}
          <div className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 p-2 flex items-center gap-1 flex-wrap shrink-0">
            {ALL_PLATFORMS.map(p => {
              const meta = PLATFORM_META[p];
              const isActive = activePlatform === p;
              const pLen = (outputs[p]?.text || "").length;
              return (
                <button
                  key={p}
                  type="button"
                  onClick={() => setActivePlatform(p)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11.5px] flex items-center gap-1 border transition whitespace-nowrap shrink-0 ${
                    isActive
                      ? "bg-emerald-600 border-emerald-600 text-white font-semibold shadow-2xs"
                      : "bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  }`}
                >
                  <span>{meta.emoji}</span>
                  <span>{meta.label}</span>
                  {pLen > 0 && (
                    <span className={`text-[10px] tabular-nums ${isActive ? "text-emerald-100" : "text-slate-400"}`}>
                      ({toFa(pLen)})
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Rich Editor Formatting & AI Tone Bar */}
          <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap bg-white dark:bg-slate-950 shrink-0">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => applyFormat("bold")}
                title="پررنگ (Bold)"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <Bold className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormat("italic")}
                title="مورب (Italic)"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <Italic className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormat("heading")}
                title="افزودن زیرتیتر"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <Heading className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormat("list")}
                title="افزودن بولت‌لیست"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormat("quote")}
                title="افزودن نقل‌قول"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <Quote className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormat("link")}
                title="درج لینک منبع"
                className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                <LinkIcon className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => applyFormat("source")}
                title="درج امضای منبع"
                className="px-2 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-[11px] text-slate-700 dark:text-slate-300 whitespace-nowrap"
              >
                + منبع
              </button>
            </div>

            <div className="flex items-center gap-1 flex-wrap">
              {[
                { label: "فوری و کوتاه", prompt: "متن را به یک خبر فوری، بسیار فشرده و قلاب‌دار تبدیل کن" },
                { label: "تحلیلی و عمیق", prompt: "متن را با لحن تحلیلی، کارشناسی و بررسی پیامدها بازنویسی کن" },
                { label: "رسمی و خبری", prompt: "متن را با لحن کاملاً رسمی، بی‌طرف و استاندارد خبرگزاری بازنویسی کن" },
              ].map(tn => (
                <button
                  key={tn.label}
                  type="button"
                  onClick={() => rewriteWithTone(tn.prompt, tn.label)}
                  disabled={!!rewritingTone}
                  className="px-2 py-1 rounded-lg border border-indigo-200 dark:border-indigo-900/60 bg-indigo-50/60 dark:bg-indigo-950/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-[11px] flex items-center gap-1 transition whitespace-nowrap"
                >
                  {rewritingTone === tn.label ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Sparkles className="w-3 h-3" />
                  )}
                  <span>{tn.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Main Editor Body */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-3 flex flex-col">
            {/* Master Headline Input */}
            <div>
              <label className="block text-[11px] text-slate-500 mb-1">
                تیتر محوری پرونده / کارت گرافیکی:
              </label>
              <input
                value={headline}
                onChange={e => setHeadline(e.target.value)}
                placeholder="تیتر اصلی خبر..."
                className="w-full h-9 px-3 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold outline-none focus:border-emerald-500"
              />
            </div>

            {/* Platform Guidance & Budget Bar */}
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>
                پلتفرم فعال: <strong className="text-slate-800 dark:text-slate-200">{PLATFORM_META[activePlatform].label}</strong> — {PLATFORM_META[activePlatform].hint}
              </span>
              <span className={`tabular-nums font-mono ${isOverLimit ? "text-rose-600 font-bold" : ""}`}>
                {toFa(wordCount)} واژه · {toFa(charCount)}
                {charLimit > 0 ? ` / ${toFa(charLimit)} کاراکتر` : " کاراکتر"}
              </span>
            </div>

            {charLimit > 0 && (
              <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden shrink-0">
                <div
                  style={{ width: `${Math.min(100, Math.round((charCount / charLimit) * 100))}%` }}
                  className={`h-full transition-all ${
                    isOverLimit
                      ? "bg-rose-500"
                      : charCount / charLimit > 0.85
                        ? "bg-amber-500"
                        : "bg-emerald-500"
                  }`}
                />
              </div>
            )}

            {/* Rich Textarea */}
            <textarea
              ref={editorRef}
              value={activeOutput.text}
              onChange={e => updateActiveText(e.target.value)}
              dir="auto"
              rows={7}
              placeholder={`متن اختصاصی برای ${PLATFORM_META[activePlatform].label} را اینجا بنویسید یا از ستون راست با هوش مصنوعی تولید کنید...`}
              className="min-h-[145px] w-full rounded-xl bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-800 p-3 text-xs leading-7 outline-none focus:border-emerald-500 resize-y"
            />

            {/* Hashtag Editor */}
            <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span className="flex items-center gap-1 font-medium">
                  <Hash className="w-3.5 h-3.5 text-emerald-600" />
                  هشتگ‌های {PLATFORM_META[activePlatform].label}
                </span>
                <span className="tabular-nums">{toFa((activeOutput.hashtags || []).length)} هشتگ</span>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {(activeOutput.hashtags || []).map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] text-emerald-700 dark:text-emerald-300"
                  >
                    #{tag}
                    <button
                      type="button"
                      onClick={() => removeHashtag(tag)}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <div className="inline-flex items-center gap-1">
                  <input
                    value={tagInput}
                    onChange={e => setTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addHashtag();
                      }
                    }}
                    placeholder="افزودن هشتگ + Enter"
                    className="h-6 px-2 rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] outline-none w-32"
                  />
                  <button
                    type="button"
                    onClick={addHashtag}
                    className="h-6 px-2 rounded-md bg-emerald-600 text-white text-xs"
                  >
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* ═══════════════════════════════════════════════════════════════════
                OMNICHANNEL & SMART AUTOMATION MODULES IN CENTRAL RICH EDITOR
            ═══════════════════════════════════════════════════════════════════ */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 overflow-hidden">
              {/* Module Switcher Tabs */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 dark:bg-slate-800/90 text-[11px] font-medium">
                <button
                  type="button"
                  data-testid="tab-messenger-native"
                  onClick={() => setEditorModuleTab("messenger_native")}
                  className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition whitespace-nowrap ${
                    editorModuleTab === "messenger_native"
                      ? "bg-white dark:bg-slate-950 text-emerald-600 dark:text-emerald-400 shadow-2xs font-semibold"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <span>دکمه شیشه‌ای و پیام‌رسان</span>
                </button>
                <button
                  type="button"
                  data-testid="tab-reply-thread"
                  onClick={() => setEditorModuleTab("reply_thread")}
                  className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition whitespace-nowrap ${
                    editorModuleTab === "reply_thread"
                      ? "bg-white dark:bg-slate-950 text-sky-600 dark:text-sky-400 shadow-2xs font-semibold"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <CornerUpRight className="w-3.5 h-3.5" />
                  <span>پاسخ به پست قبلی / زنجیره</span>
                </button>
                <button
                  type="button"
                  data-testid="tab-smart-slot"
                  onClick={() => setEditorModuleTab("smart_slot")}
                  className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1 transition whitespace-nowrap ${
                    editorModuleTab === "smart_slot"
                      ? "bg-white dark:bg-slate-950 text-amber-600 dark:text-amber-400 shadow-2xs font-semibold"
                      : "text-slate-600 dark:text-slate-400"
                  }`}
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span>صف هوشمند و ضد ازدحام</span>
                </button>
              </div>

              {/* Module 1: Messenger Native Features (Telegram / Bale / Eitaa / Rubika) */}
              {editorModuleTab === "messenger_native" && (
                <div className="p-3 space-y-2.5 text-xs">
                  {/* Native Toggles Row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() =>
                        setMessengerOpts(prev => ({ ...prev, silent: !prev.silent }))
                      }
                      className={`px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-1 transition ${
                        messengerOpts.silent
                          ? "bg-amber-500/15 border-amber-500/50 text-amber-700 dark:text-amber-300 font-semibold"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <BellOff className="w-3.5 h-3.5" />
                      <span>ارسال بی‌صدا (Silent)</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setMessengerOpts(prev => ({ ...prev, autoPin: !prev.autoPin }))
                      }
                      className={`px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-1 transition ${
                        messengerOpts.autoPin
                          ? "bg-rose-500/15 border-rose-500/50 text-rose-700 dark:text-rose-300 font-semibold"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <Pin className="w-3.5 h-3.5" />
                      <span>پین خودکار خبر فوری</span>
                    </button>

                    <button
                      type="button"
                      onClick={() =>
                        setMessengerOpts(prev => ({
                          ...prev,
                          showLinkPreview: !prev.showLinkPreview,
                        }))
                      }
                      className={`px-2.5 py-1 rounded-lg border text-[11px] flex items-center gap-1 transition ${
                        messengerOpts.showLinkPreview
                          ? "bg-sky-500/15 border-sky-500/50 text-sky-700 dark:text-sky-300 font-semibold"
                          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400"
                      }`}
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>پیش‌نمایش لینک سفارشی</span>
                    </button>
                  </div>

                  {/* Inline Keyboard Glass Buttons Builder */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span className="font-medium text-slate-700 dark:text-slate-300">
                        دکمه‌های شیشه‌ای تعاملی زیر پست (Inline Keyboard):
                      </span>
                      <button
                        type="button"
                        onClick={resetReactionPollButtons}
                        className="text-emerald-600 hover:underline text-[10.5px]"
                      >
                        + بازنشانی دکمه‌های واکنشی (👍 / 👎 / 🔥)
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {messengerOpts.inlineButtons.map(btn => (
                        <span
                          key={btn.id}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px]"
                        >
                          <span>{btn.label}</span>
                          {btn.count !== undefined && (
                            <span className="text-emerald-600 font-mono tabular-nums">
                              {toFa(btn.count)}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => removeInlineButton(btn.id)}
                            className="text-slate-400 hover:text-rose-500"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>

                    {/* Add New Glass Button */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        value={newBtnLabel}
                        onChange={e => setNewBtnLabel(e.target.value)}
                        placeholder="متن دکمه شیشه‌ای (مثلاً: مشاهده ویدیو)"
                        className="flex-1 h-7 px-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] outline-none"
                      />
                      <input
                        value={newBtnUrl}
                        onChange={e => setNewBtnUrl(e.target.value)}
                        dir="ltr"
                        placeholder="https://..."
                        className="w-36 h-7 px-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] outline-none"
                      />
                      <button
                        type="button"
                        onClick={addCustomInlineButton}
                        className="h-7 px-2.5 rounded-lg bg-emerald-600 text-white text-[11px] font-medium whitespace-nowrap"
                      >
                        + دکمه شیشه‌ای
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Module 2: Reply-to-Previous & Threading (انتشار زنجیره‌ای و پاسخ به پست قبلی) */}
              {editorModuleTab === "reply_thread" && (
                <div className="p-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={replyChain.enabled}
                        onChange={e =>
                          setReplyChain(prev => ({ ...prev, enabled: e.target.checked }))
                        }
                        className="rounded accent-emerald-600"
                      />
                      <span className="font-semibold">
                        اتصال به پست قبلی منتشرشده در کانال (Reply / Quote)
                      </span>
                    </label>
                    <span className="text-[10.5px] text-slate-400 font-mono" dir="ltr">
                      Msg #{replyChain.channelMessageId}
                    </span>
                  </div>

                  {replyChain.enabled && (
                    <div className="space-y-2 pt-1">
                      <select
                        value={replyChain.parentTitle}
                        onChange={e => {
                          const picked = articles.find(a => a.title === e.target.value);
                          setReplyChain(prev => ({
                            ...prev,
                            parentTitle: e.target.value,
                            parentSnippet: (picked?.preview || e.target.value).slice(0, 110),
                          }));
                        }}
                        className="w-full h-8 px-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] outline-none"
                      >
                        <option value={replyChain.parentTitle}>{replyChain.parentTitle}</option>
                        {articles.slice(0, 12).map(a => (
                          <option key={a.id} value={a.title}>
                            پست قبلی: {a.title.slice(0, 75)} ({a.source})
                          </option>
                        ))}
                      </select>

                      {/* Multi-post Thread Continuations */}
                      <div className="space-y-1.5">
                        <div className="text-[11px] text-slate-500">
                          ادامهٔ رشته / پست‌های زنجیره‌ای مکمل ({toFa(replyChain.threadContinuations.length)}):
                        </div>
                        {replyChain.threadContinuations.map((tc, idx) => (
                          <div
                            key={idx}
                            className="p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2 text-[11px]"
                          >
                            <span className="truncate">
                              {toFa(idx + 2)}. {tc}
                            </span>
                            <button
                              type="button"
                              onClick={() => removeThreadContinuation(idx)}
                              className="text-rose-500"
                            >
                              ×
                            </button>
                          </div>
                        ))}
                        <div className="flex items-center gap-1.5">
                          <input
                            value={newThreadText}
                            onChange={e => setNewThreadText(e.target.value)}
                            placeholder="متن پست تکمیلی بعدی در زنجیرهٔ خبر..."
                            className="flex-1 h-7 px-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-[11px] outline-none"
                          />
                          <button
                            type="button"
                            onClick={addThreadContinuation}
                            className="h-7 px-2.5 rounded-lg bg-sky-600 text-white text-[11px] font-medium whitespace-nowrap"
                          >
                            + افزودن به رشته
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Module 3: Smart Slot & Anti-Flood Limiter */}
              {editorModuleTab === "smart_slot" && (
                <div className="p-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="font-semibold text-slate-700 dark:text-slate-200">
                      پیشنهاد بهترین زمان انتشار (حداقل {toFa(minGapMinutes)} دقیقه فاصله ضد ازدحام):
                    </span>
                    {floodConflicts.length > 0 && (
                      <button
                        type="button"
                        onClick={handleAutoSpaceQueueInline}
                        className="px-2 py-0.5 rounded-md bg-amber-500 text-white text-[10.5px] font-semibold flex items-center gap-1"
                      >
                        <AlertTriangle className="w-3 h-3" />
                        <span>رفع {toFa(floodConflicts.length)} تداخل صف (فاصله ۲۰ دقیقه)</span>
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    {smartSlots.slice(0, 4).map(slot => (
                      <button
                        key={slot.ts}
                        type="button"
                        onClick={() => handlePickSmartSlot(slot.ts)}
                        className={`p-2 rounded-lg border text-right transition ${
                          scheduledSlotTs === slot.ts
                            ? "border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/40"
                            : "border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 hover:border-emerald-500"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-bold">
                          <span className="text-emerald-600 dark:text-emerald-400">{slot.label}</span>
                          <span className="text-[10px] text-slate-400">
                            تعامل {toFa(slot.engagementScore)}٪
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 truncate mt-0.5">
                          {slot.reason}
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Center Editor Footer Actions */}
          <div className="p-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-2 flex-wrap shrink-0">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={saving}
                className="h-9 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 transition"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>ذخیره پیش‌نویس</span>
              </button>
              <button
                type="button"
                onClick={handleCopyActive}
                className="h-9 px-3.5 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center gap-1.5 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? "کپی شد" : "کپی متن"}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={handlePublishActive}
              disabled={publishing || isOverLimit}
              className="h-9 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition shadow-xs"
            >
              {publishing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5 -scale-x-100" />
              )}
              <span>
                {isPublishable(activePlatform)
                  ? `انتشار در ${PLATFORM_META[activePlatform].label}`
                  : `کپی برای انتشار در ${PLATFORM_META[activePlatform].label}`}
              </span>
            </button>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════════
            COLUMN 3 (LEFT IN RTL): LIVE DEVICE MOCKUP & GRAPHIC CARD CANVAS
        ═══════════════════════════════════════════════════════════════════ */}
        <section
          aria-label="ستون چپ: پیش‌نمایش زنده موبایل و بوم طراحی کارت گرافیکی"
          className="flex flex-col min-h-0 h-full bg-slate-50/70 dark:bg-slate-900/90 overflow-hidden"
        >
          {/* Mode Switcher: Live Device Mockup vs. Graphic Card Designer */}
          <div className="p-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => setLeftTab("device")}
                className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 font-medium transition whitespace-nowrap ${
                  leftTab === "device"
                    ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                <span>پیش‌نمایش زنده موبایل</span>
              </button>
              <button
                type="button"
                onClick={() => setLeftTab("canvas")}
                className={`py-1.5 px-2 rounded-lg flex items-center justify-center gap-1.5 font-medium transition whitespace-nowrap ${
                  leftTab === "canvas"
                    ? "bg-white dark:bg-slate-950 text-slate-900 dark:text-white shadow-2xs"
                    : "text-slate-600 dark:text-slate-400"
                }`}
              >
                <Palette className="w-3.5 h-3.5 text-amber-500" />
                <span>بوم کارت گرافیکی</span>
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3.5 flex flex-col items-center">
            {leftTab === "device" ? (
              /* PIXEL-ACCURATE LIVE MOBILE DEVICE MOCKUP */
              <div className="w-full flex flex-col items-center space-y-2.5">
                <div className="text-[11px] text-slate-500 flex items-center gap-1.5 flex-wrap justify-center">
                  <span>شبیه‌ساز پیکسل‌به‌پیکسل:</span>
                  <strong className="text-slate-800 dark:text-slate-200">
                    {PLATFORM_META[activePlatform].emoji} {PLATFORM_META[activePlatform].label}
                  </strong>
                  {messengerOpts.silent && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600 text-[10px]">
                      🔕 بی‌صدا
                    </span>
                  )}
                  {messengerOpts.autoPin && (
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 text-[10px]">
                      📌 پین خودکار
                    </span>
                  )}
                </div>

                {/* Phone Bezel Frame */}
                <div
                  data-testid="live-device-mockup"
                  className="w-[318px] rounded-[36px] border-[7px] border-slate-900 dark:border-slate-800 bg-white dark:bg-slate-950 shadow-xl overflow-hidden flex flex-col"
                >
                  {/* Status Bar + Dynamic Island */}
                  <div className="h-7 px-5 bg-slate-950 text-white flex items-center justify-between text-[10px] font-mono shrink-0" dir="ltr">
                    <span>9:41</span>
                    <div className="w-16 h-3.5 rounded-full bg-black border border-slate-800" />
                    <span>5G 100%</span>
                  </div>

                  {/* Platform-Native Mockup Body */}
                  {(activePlatform === "telegram" ||
                    activePlatform === "bale" ||
                    activePlatform === "rubika" ||
                    activePlatform === "eitaa") && (
                    <div className="flex flex-col bg-[#0E1621] text-white min-h-[490px]">
                      {/* Channel Top Header */}
                      <div className="px-3 py-2 bg-[#17212B] flex items-center gap-2.5 border-b border-white/10">
                        <div className="w-8 h-8 rounded-full bg-emerald-600 grid place-items-center text-xs font-bold">
                          {(brand.name || "ک")[0]}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold truncate">
                            {brand.name || "کانال رسمی تحریریه کیان"}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {PLATFORM_META[activePlatform].label} · ۴۸.۲K عضو
                          </div>
                        </div>
                      </div>

                      {/* Auto-Pinned Breaking Message Bar */}
                      {messengerOpts.autoPin && (
                        <div
                          data-testid="mockup-pinned-bar"
                          className="px-3 py-1.5 bg-[#17212B]/95 border-b border-white/10 flex items-center justify-between gap-2 text-[10.5px]"
                        >
                          <div className="border-r-2 border-rose-500 pr-2 min-w-0 flex-1">
                            <div className="text-rose-400 font-semibold flex items-center gap-1">
                              <Pin className="w-3 h-3" />
                              <span>پیام سنجاق‌شده (خبر فوری)</span>
                            </div>
                            <div className="text-slate-300 truncate">{headline}</div>
                          </div>
                        </div>
                      )}

                      {/* Message Bubble + Glass Inline Keyboard */}
                      <div className="p-2.5 flex-1 overflow-y-auto space-y-1.5">
                        <div className="rounded-2xl rounded-tr-sm bg-[#182533] overflow-hidden shadow-sm border border-white/5">
                          {/* Reply-to-Previous Quote Block inside Bubble */}
                          {replyChain.enabled && (
                            <div
                              data-testid="mockup-reply-quote"
                              className="mx-2.5 mt-2.5 px-2.5 py-1.5 rounded-lg bg-[#131E2A] border-r-2 border-sky-400 text-[10.5px]"
                            >
                              <div className="text-sky-400 font-semibold flex items-center gap-1">
                                <CornerUpRight className="w-3 h-3" />
                                <span>پاسخ به پست #{replyChain.channelMessageId}</span>
                              </div>
                              <div className="text-slate-200 font-medium truncate">
                                {replyChain.parentTitle}
                              </div>
                              <div className="text-slate-400 truncate text-[10px]">
                                {replyChain.parentSnippet}
                              </div>
                            </div>
                          )}

                          {cardPreviewUrl && (
                            <img
                              src={carouselSlides[activeSlideIdx] || cardPreviewUrl}
                              alt={headline}
                              referrerPolicy="no-referrer"
                              className="w-full max-h-44 object-cover mt-1.5"
                            />
                          )}

                          <div className="p-3 space-y-2">
                            <div className="text-[12px] leading-relaxed whitespace-pre-wrap break-words text-slate-100">
                              {activeOutput.text}
                            </div>

                            {(activeOutput.hashtags || []).length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5 text-[11px] text-sky-400">
                                {activeOutput.hashtags.map(h => (
                                  <span key={h}>#{h}</span>
                                ))}
                              </div>
                            )}

                            {/* Custom Link Preview Card inside Bubble */}
                            {messengerOpts.showLinkPreview && (
                              <div
                                data-testid="mockup-link-preview"
                                className="p-2 rounded-lg bg-[#131E2A] border-r-2 border-emerald-400 text-[10.5px] space-y-0.5"
                              >
                                <div className="text-emerald-400 font-semibold">
                                  {messengerOpts.customLinkDomain}
                                </div>
                                <div className="text-slate-100 font-medium line-clamp-1">
                                  {messengerOpts.customLinkTitle || headline}
                                </div>
                                <div className="text-slate-400 truncate text-[9.5px]" dir="ltr">
                                  {sourceLink}
                                </div>
                              </div>
                            )}

                            <div className="pt-1 flex items-center justify-end gap-2 text-[10px] text-slate-400 tabular-nums" dir="ltr">
                              {messengerOpts.silent && (
                                <span title="ارسال بی‌صدا" className="text-amber-400 flex items-center gap-0.5">
                                  <BellOff className="w-3 h-3" />
                                </span>
                              )}
                              <span className="flex items-center gap-0.5">
                                <Eye className="w-3 h-3" /> 1.8K
                              </span>
                              <span>14:32</span>
                            </div>
                          </div>
                        </div>

                        {/* Interactive Glass Inline Keyboard Buttons (دکمه‌های شیشه‌ای زیر پست) */}
                        {messengerOpts.inlineButtons.length > 0 && (
                          <div
                            data-testid="mockup-inline-keyboard"
                            className="space-y-1"
                          >
                            {/* Row 1: URL Buttons (full width glass buttons) */}
                            {urlButtons.map(btn => (
                              <div
                                key={btn.id}
                                className="w-full py-1.5 px-3 rounded-xl bg-white/10 hover:bg-white/15 backdrop-blur-md border border-white/10 text-center text-[11px] font-medium text-white flex items-center justify-center gap-1.5 cursor-pointer transition"
                              >
                                <span>{btn.label}</span>
                                <ExternalLink className="w-3 h-3 text-sky-300" />
                              </div>
                            ))}

                            {/* Row 2: Reaction Poll Buttons */}
                            {reactionButtons.length > 0 && (
                              <div className="grid grid-cols-3 gap-1">
                                {reactionButtons.map(btn => (
                                  <button
                                    key={btn.id}
                                    type="button"
                                    onClick={() => incrementReactionInPreview(btn.id)}
                                    className="py-1.5 px-2 rounded-xl bg-white/10 hover:bg-white/20 backdrop-blur-md border border-white/10 text-center text-[11px] font-medium text-white flex items-center justify-center gap-1 transition"
                                  >
                                    <span>{btn.label}</span>
                                    {btn.count !== undefined && (
                                      <span className="text-[10px] text-slate-300 tabular-nums">
                                        {toFa(btn.count)}
                                      </span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Thread Continuations inside Channel */}
                        {replyChain.threadContinuations.map((tc, idx) => (
                          <div
                            key={idx}
                            className="rounded-2xl rounded-tr-sm bg-[#182533]/90 p-2.5 border border-sky-500/20 text-[11.5px] space-y-1"
                          >
                            <div className="text-[10px] text-sky-400 font-semibold">
                              ↳ ادامهٔ زنجیرهٔ خبر ({toFa(idx + 2)})
                            </div>
                            <div className="text-slate-100 leading-relaxed">{tc}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {activePlatform === "twitter" && (
                    <div className="flex flex-col bg-black text-white min-h-[490px] p-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-full bg-emerald-600 grid place-items-center text-xs font-bold shrink-0">
                          {(brand.name || "F")[0]}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-bold flex items-center gap-1 truncate">
                            <span>{brand.name || "تحریریه کیان"}</span>
                            <span className="text-sky-400">✔</span>
                          </div>
                          <div className="text-[11px] text-slate-500" dir="ltr">
                            @kian_newsroom · 2m
                          </div>
                        </div>
                      </div>
                      <div className="mt-3 text-[13px] leading-relaxed whitespace-pre-wrap break-words">
                        {activeOutput.text}
                      </div>
                      {(activeOutput.hashtags || []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1 text-xs text-sky-400">
                          {activeOutput.hashtags.map(h => (
                            <span key={h}>#{h}</span>
                          ))}
                        </div>
                      )}
                      {replyChain.enabled && (
                        <div className="mt-2.5 p-2.5 rounded-xl border border-slate-800 bg-slate-900/70 text-[11px]">
                          <div className="text-sky-400 font-semibold">پاسخ / بازنشر زنجیره‌ای:</div>
                          <div className="text-slate-200 truncate mt-0.5">{replyChain.parentTitle}</div>
                        </div>
                      )}
                      {cardPreviewUrl && (
                        <div className="mt-3 rounded-2xl overflow-hidden border border-slate-800">
                          <img
                            src={cardPreviewUrl}
                            alt={headline}
                            referrerPolicy="no-referrer"
                            className="w-full max-h-40 object-cover"
                          />
                        </div>
                      )}
                      <div className="mt-auto pt-3 border-t border-slate-800 flex items-center justify-between text-slate-500 text-xs">
                        <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" /> ۲۴</span>
                        <span className="flex items-center gap-1"><Repeat2 className="w-3.5 h-3.5" /> ۸۶</span>
                        <span className="flex items-center gap-1"><Heart className="w-3.5 h-3.5" /> ۴۱۲</span>
                        <span className="flex items-center gap-1"><Bookmark className="w-3.5 h-3.5" /></span>
                      </div>
                    </div>
                  )}

                  {activePlatform === "instagram" && (
                    <div className="flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-[490px]">
                      <div className="px-3 py-2 flex items-center gap-2 border-b border-slate-100 dark:border-slate-800">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 p-0.5">
                          <div className="w-full h-full rounded-full bg-white dark:bg-slate-950 grid place-items-center text-[10px] font-bold">
                            {(brand.name || "K")[0]}
                          </div>
                        </div>
                        <span className="text-xs font-semibold truncate">
                          {brand.name || "kian.media"}
                        </span>
                      </div>
                      <div className="relative bg-slate-900 aspect-square w-full overflow-hidden">
                        {cardPreviewUrl && (
                          <img
                            src={carouselSlides[activeSlideIdx] || cardPreviewUrl}
                            alt={headline}
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover"
                          />
                        )}
                        {carouselSlides.length > 1 && (
                          <div className="absolute bottom-2 inset-x-0 flex justify-center gap-1">
                            {carouselSlides.map((_, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => setActiveSlideIdx(idx)}
                                className={`w-2 h-2 rounded-full ${
                                  idx === activeSlideIdx ? "bg-emerald-400" : "bg-white/50"
                                }`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <div className="p-3 space-y-1.5">
                        <div className="flex items-center justify-between text-slate-700 dark:text-slate-200">
                          <div className="flex items-center gap-3">
                            <Heart className="w-4 h-4 text-rose-500 fill-rose-500" />
                            <MessageCircle className="w-4 h-4" />
                            <Share2 className="w-4 h-4" />
                          </div>
                          <Bookmark className="w-4 h-4" />
                        </div>
                        <div className="text-[11.5px] leading-relaxed line-clamp-4 whitespace-pre-wrap">
                          <strong className="ml-1">{brand.name || "kian.media"}</strong>
                          {activeOutput.text}
                        </div>
                        {(activeOutput.hashtags || []).length > 0 && (
                          <div className="text-[10.5px] text-sky-600 dark:text-sky-400 truncate">
                            {activeOutput.hashtags.map(h => `#${h}`).join(" ")}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {activePlatform === "linkedin" && (
                    <div className="flex flex-col bg-[#F3F2EF] dark:bg-slate-900 text-slate-900 dark:text-slate-100 min-h-[490px] p-2.5">
                      <div className="bg-white dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden flex-1 flex flex-col">
                        <div className="p-3 flex items-center gap-2">
                          <div className="w-9 h-9 rounded-lg bg-sky-700 text-white grid place-items-center font-bold text-xs">
                            in
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-bold truncate">
                              {brand.name || "مرکز مطالعات و رصد رسانه کیان"}
                            </div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {brand.tagline || "تحلیل راهبردی داده و رسانه"} · ۱ ساعت پیش
                            </div>
                          </div>
                        </div>
                        <div className="px-3 pb-2 text-[12px] leading-relaxed whitespace-pre-wrap line-clamp-6">
                          {activeOutput.text}
                        </div>
                        {cardPreviewUrl && (
                          <img
                            src={cardPreviewUrl}
                            alt={headline}
                            referrerPolicy="no-referrer"
                            className="w-full max-h-40 object-cover border-t border-slate-100 dark:border-slate-800"
                          />
                        )}
                        <div className="mt-auto px-3 py-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-around text-[11px] text-slate-500">
                          <span>👍 پسندیدن</span>
                          <span>💬 دیدگاه</span>
                          <span>🔁 بازنشر</span>
                        </div>
                      </div>
                    </div>
                  )}

                  {activePlatform === "website" && (
                    <div className="flex flex-col bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 min-h-[490px] p-3.5 overflow-y-auto">
                      <div className="text-[10px] font-semibold text-emerald-600 mb-1">
                        گزارش تحلیلی · تحریریه وبلاگ
                      </div>
                      <h4 className="text-sm font-bold leading-snug">{headline}</h4>
                      <div className="text-[10px] text-slate-400 my-1.5">
                        زمان مطالعه: ۳ دقیقه · {brand.name || "پایگاه خبری کیان"}
                      </div>
                      {cardPreviewUrl && (
                        <img
                          src={cardPreviewUrl}
                          alt={headline}
                          referrerPolicy="no-referrer"
                          className="w-full h-36 object-cover rounded-xl my-2"
                        />
                      )}
                      <div className="text-xs leading-relaxed whitespace-pre-wrap text-slate-700 dark:text-slate-300">
                        {activeOutput.text}
                      </div>
                    </div>
                  )}

                  {/* Phone Bottom Home Indicator */}
                  <div className="h-5 bg-slate-950 grid place-items-center shrink-0">
                    <div className="w-24 h-1 rounded-full bg-slate-600" />
                  </div>
                </div>
              </div>
            ) : (
              /* GRAPHIC CARD DESIGNER CANVAS */
              <div className="w-full space-y-3">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-900/95 p-3 flex flex-col items-center">
                  {cardPreviewUrl ? (
                    <img
                      src={cardPreviewUrl}
                      alt={headline}
                      referrerPolicy="no-referrer"
                      className="max-h-60 w-auto rounded-xl object-contain shadow-md"
                    />
                  ) : (
                    <div className="h-48 w-full grid place-items-center text-xs text-slate-400">
                      در حال آماده‌سازی بوم گرافیکی...
                    </div>
                  )}
                </div>

                {/* Card Theme & Aspect Ratio */}
                <div className="p-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">تم کارت:</span>
                    <div className="flex items-center gap-1">
                      {CARD_THEMES.map(th => (
                        <button
                          key={th.id}
                          type="button"
                          onClick={() => setCardTheme(th.id)}
                          className={`px-2.5 py-1 rounded-lg transition ${
                            cardTheme === th.id
                              ? "bg-emerald-600 text-white font-medium"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {th.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">ابعاد بوم:</span>
                    <div className="flex items-center gap-1">
                      {CARD_RATIOS.map(rt => (
                        <button
                          key={rt.id}
                          type="button"
                          onClick={() => setCardRatio(rt.id)}
                          className={`px-2.5 py-1 rounded-lg transition ${
                            cardRatio === rt.id
                              ? "bg-emerald-600 text-white font-medium"
                              : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                          }`}
                        >
                          {rt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-slate-500">رنگ کانونی:</span>
                    <div className="flex items-center gap-1.5">
                      {ACCENT_PRESETS.map(ac => (
                        <button
                          key={ac.id}
                          type="button"
                          onClick={() => setCardAccent(ac.id)}
                          title={ac.label}
                          style={{ backgroundColor: ac.id }}
                          className={`w-6 h-6 rounded-full transition ${
                            cardAccent === ac.id ? "ring-2 ring-offset-2 ring-slate-900 dark:ring-white scale-110" : "opacity-80"
                          }`}
                        />
                      ))}
                    </div>
                  </div>

                  <div className="space-y-1 pt-1">
                    <label className="block text-[11px] text-slate-500">
                      تیتر سفارشی روی کارت گرافیکی:
                    </label>
                    <input
                      value={cardCustomTitle}
                      onChange={e => setCardCustomTitle(e.target.value)}
                      placeholder={headline}
                      className="w-full h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs outline-none"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-[11px] text-slate-500">
                      امضا / منبع پایین کارت:
                    </label>
                    <input
                      value={cardFooterSource}
                      onChange={e => setCardFooterSource(e.target.value)}
                      placeholder={basketArticles[0]?.source || brand.name || "تحریریه کیان"}
                      className="w-full h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-xs outline-none"
                    />
                  </div>

                  <div className="pt-2 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={handleApplyAndUploadCard}
                      disabled={renderingCard}
                      className="h-9 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                    >
                      {renderingCard ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ImageIcon className="w-3.5 h-3.5" />}
                      <span>ثبت کارت برند</span>
                    </button>
                    <button
                      type="button"
                      onClick={handleDownloadCard}
                      className="h-9 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center justify-center gap-1.5"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>دانلود PNG</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleBuildCarousel}
                    disabled={renderingCarousel}
                    className="w-full h-9 rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium flex items-center justify-center gap-1.5"
                  >
                    {renderingCarousel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Layers className="w-3.5 h-3.5" />}
                    <span>ساخت کاروسل چنداسلایدی از متن</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Visual Trigger-Condition-Action & Smart Anti-Flood Modal */}
      <OmnichannelAutomationModal
        open={automationModalOpen}
        onClose={() => setAutomationModalOpen(false)}
        rules={compoundRules}
        onSaveRules={nextRules => {
          setCompoundRules(nextRules);
          toast({ kind: "success", message: "قوانین اتوماسیون شرطی ذخیره شدند" });
        }}
        onSimulateRuleNow={() => {
          setDismissedAutopilotIds([]);
          setAutomationModalOpen(false);
          if (autopilotCandidates[0]) {
            handleInspectAutopilotCandidate(autopilotCandidates[0]);
          } else {
            toast({
              kind: "success",
              message: "شبیه‌سازی قانون ترکیبی انجام شد و بستهٔ فوری آمادهٔ تأیید است",
            });
          }
        }}
        queueItems={queueItems}
        onUpdateQueueItems={items => {
          setQueueItems(items);
          toast({
            kind: "success",
            message: `صف زمان‌بندی با فاصلهٔ استاندارد ${toFa(minGapMinutes)} دقیقه توزیع شد`,
          });
        }}
        minGapMinutes={minGapMinutes}
        onChangeMinGapMinutes={gap => setMinGapMinutes(gap)}
        smartSlots={smartSlots}
        onPickSmartSlot={handlePickSmartSlot}
      />
    </div>
  );
}
