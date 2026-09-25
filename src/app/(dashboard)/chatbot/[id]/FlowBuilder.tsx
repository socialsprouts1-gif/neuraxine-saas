"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type DragEvent,
} from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Bot,
  Check,
  ClipboardList,
  Clock,
  Copy,
  Database,
  FileText,
  GitBranch,
  Globe,
  Headset,
  HelpCircle,
  Image as ImageIcon,
  Link2,
  List,
  MapPin,
  MessageSquare,
  MousePointerClick,
  Save,
  Search,
  ShoppingCart,
  StopCircle,
  Tag,
  Trash2,
  UserCog,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import {
  NODE_DEFS,
  NODE_GROUPS,
  RUNTIME_LABEL,
  nodeDef,
  type FlowEdge,
  type FlowNode,
  type FlowNodeKind,
  type NodeDef,
  type NodeField,
} from "@/types/flow";
import { saveFlowGraph } from "../../portal-actions";
import { useTheme } from "@/components/ThemeToggle";
import { assistantsOnNumbers, formsOnNumbers } from "@/lib/flow-routing";

// The visual builder. Nodes carry their own configuration form rather than
// opening a side panel: a flow is read by scanning left to right, and having
// to click each node to see what it says defeats that.

// Every component in the palette gets a glyph. Kept out of flow.ts on
// purpose — that module is plain data imported by server components, and
// icons are a rendering concern.
// Every component in the palette gets a glyph. Kept out of flow.ts on
// purpose — that module is plain data imported by server components, and
// icons are a rendering concern. Total rather than Partial so adding a node
// kind without an icon fails to compile instead of silently falling back.
const NODE_ICONS: Record<FlowNodeKind, LucideIcon> = {
  on_message: Zap,
  send_text: MessageSquare,
  send_buttons: MousePointerClick,
  send_list: List,
  send_media: ImageIcon,
  send_template: FileText,
  send_cta: Link2,
  send_form: ClipboardList,
  send_product: ShoppingCart,
  ask_question: HelpCircle,
  ask_location: MapPin,
  condition: GitBranch,
  delay: Clock,
  update_tag: Tag,
  update_field: UserCog,
  fetch_contact: Database,
  http: Globe,
  ai_agent: Bot,
  handoff: Headset,
  stop_bot: StopCircle,
};

type NodeData = { kind: FlowNodeKind; values: Record<string, unknown> };
type BuilderNode = Node<NodeData, "flowNode">;

let idCounter = 0;
function newId(kind: string): string {
  idCounter += 1;
  return `${kind}_${Date.now().toString(36)}${idCounter}`;
}

// --- field editors ---------------------------------------------------------

const inputClass =
  "w-full bg-white/4 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-white/25 focus:outline-none focus:border-accent/40 nodrag";

export interface BuilderNumber {
  id: string;
  label: string;
  status: string;
  /** The WhatsApp Business Account this number is on. */
  wabaId: string;
}

/** A form the Send Form node can pick. */
export interface BuilderForm {
  id: string;
  name: string;
  status: string;
  /** Null on a form uploaded before the account was recorded. */
  wabaId: string | null;
}

/** An assistant the AI Agent node can hand the turn to. */
export interface BuilderAssistant {
  id: string;
  name: string;
  /** Null means it answers on every number in the workspace. */
  connectionId: string | null;
}

/**
 * The workspace's numbers, for the trigger's Phone Numbers field.
 *
 * Through context rather than props: the field editor is rendered inside a
 * React Flow node, several layers below anything that could pass it down.
 */
const NumbersContext = createContext<BuilderNumber[]>([]);

/** The workspace's sendable forms, for the Send Form node. Same reason. */
const FormsContext = createContext<BuilderForm[]>([]);

/** The workspace's AI assistants, for the AI Agent node. Same reason. */
const AssistantsContext = createContext<BuilderAssistant[]>([]);

/**
 * The numbers this bot's trigger listens on, as ids.
 *
 * Lives inside the builder rather than beside the two above, because it is
 * read off the canvas: it changes the moment somebody ticks a number in the
 * trigger, and the Send Form picker has to follow that without a reload.
 * Empty means every number, the same as the trigger's own field.
 */
const ListeningContext = createContext<string[]>([]);

function FieldEditor({
  field,
  value,
  onChange,
}: {
  field: NodeField;
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  switch (field.kind) {
    case "textarea":
      return (
        <textarea
          className={`${inputClass} resize-none`}
          rows={3}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );

    case "number":
      return (
        <input
          type="number"
          className={inputClass}
          value={String(value ?? "")}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      );

    case "select":
      return (
        <select
          className={inputClass}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        >
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value} className="bg-[var(--surface-1)]">
              {o.label}
            </option>
          ))}
        </select>
      );

    case "form":
      return <FormPicker value={value} onChange={onChange} />;

    case "assistant":
      return <AssistantPicker value={value} onChange={onChange} />;

    case "toggle":
      return (
        <button
          type="button"
          onClick={() => onChange(!value)}
          className={`nodrag relative w-9 h-5 rounded-full transition-colors ${
            value ? "bg-accent" : "bg-white/15"
          }`}
          aria-pressed={Boolean(value)}
        >
          <span
            className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--app-bg)] transition-all ${
              value ? "left-4.5" : "left-0.5"
            }`}
          />
        </button>
      );

    case "keywords":
      return <KeywordsEditor value={value} onChange={onChange} placeholder={field.placeholder} />;

    case "numbers":
      return <NumbersEditor value={value} onChange={onChange} />;

    case "variable":
      return (
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-white/30 font-mono">{"{{"}</span>
          <input
            className={inputClass}
            placeholder={field.placeholder}
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value.replace(/[^\w.]/g, ""))}
          />
          <span className="text-[10px] text-white/30 font-mono">{"}}"}</span>
        </div>
      );

    case "buttons":
      return <ButtonsEditor value={value} onChange={onChange} max={field.max ?? 3} />;

    case "sections":
      return <SectionsEditor value={value} onChange={onChange} />;

    default:
      return (
        <input
          className={inputClass}
          maxLength={field.maxLength}
          placeholder={field.placeholder}
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
}

/**
 * Keywords as removable chips.
 *
 * The previous version round-tripped the whole list through one text input
 * joined on ", ". That reads fine but edits badly: deleting one keyword from
 * the middle means retyping the separators, and it is never obvious whether
 * a trailing comma has created an empty entry. Chips make each keyword a
 * thing you can remove, while still accepting a comma-separated paste.
 */
function KeywordsEditor({
  value,
  onChange,
  placeholder,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  placeholder?: string;
}) {
  const keywords: string[] = Array.isArray(value) ? (value as string[]) : [];
  const [draft, setDraft] = useState("");

  // One place decides what a keyword is, so a paste of "hi, hey,, HEY" and a
  // typed entry behave identically: trimmed, non-empty, no case-insensitive
  // duplicates (the matcher lowercases anyway, so "Hi" and "hi" are one rule).
  const commit = useCallback(
    (raw: string) => {
      const additions = raw
        .split(",")
        .map((part) => part.trim())
        .filter(Boolean);
      if (additions.length === 0) return;

      const seen = new Set(keywords.map((k) => k.toLowerCase()));
      const next = [...keywords];
      for (const addition of additions) {
        if (seen.has(addition.toLowerCase())) continue;
        seen.add(addition.toLowerCase());
        next.push(addition);
      }
      if (next.length !== keywords.length) onChange(next);
    },
    [keywords, onChange]
  );

  return (
    <div className="nodrag">
      {keywords.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-1.5">
          {keywords.map((keyword, index) => (
            <span
              key={`${keyword}-${index}`}
              className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 rounded-md bg-accent/10 border border-accent/25 text-[10px] text-accent-ink"
            >
              <span className="max-w-[9rem] truncate">{keyword}</span>
              <button
                type="button"
                className="text-accent-ink/50 hover:text-white transition-colors"
                onClick={() => onChange(keywords.filter((_, i) => i !== index))}
                aria-label={`Remove ${keyword}`}
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        className={inputClass}
        placeholder={keywords.length ? "Add keyword…" : (placeholder ?? "hi, hey, hello")}
        value={draft}
        onChange={(e) => {
          // Typing or pasting a comma commits everything before it, so a
          // pasted list lands as chips without needing Enter.
          if (e.target.value.includes(",")) {
            const parts = e.target.value.split(",");
            commit(parts.slice(0, -1).join(","));
            setDraft(parts[parts.length - 1]);
            return;
          }
          setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commit(draft);
            setDraft("");
          } else if (e.key === "Backspace" && !draft && keywords.length) {
            // Matches how every other chip input behaves.
            onChange(keywords.slice(0, -1));
          }
        }}
        // Leaving the field should not silently discard what was typed.
        onBlur={() => {
          commit(draft);
          setDraft("");
        }}
      />
      <p className="text-[9px] text-white/25 mt-1">
        Separate keywords with commas. Leave empty to match any message.
      </p>
    </div>
  );
}

type ButtonEntry = { id: string; title: string };

function ButtonsEditor({
  value,
  onChange,
  max,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
  max: number;
}) {
  const buttons: ButtonEntry[] = Array.isArray(value) ? (value as ButtonEntry[]) : [];

  const update = (index: number, title: string) => {
    const next = buttons.map((b, i) => (i === index ? { ...b, title } : b));
    onChange(next);
  };

  return (
    <div className="space-y-1.5">
      {buttons.map((button, index) => (
        <div key={button.id} className="flex items-center gap-1.5">
          <input
            className={inputClass}
            maxLength={20}
            placeholder={`Button ${index + 1}`}
            value={button.title}
            onChange={(e) => update(index, e.target.value)}
          />
          <button
            type="button"
            className="nodrag text-white/30 hover:text-red-400 flex-shrink-0"
            onClick={() => onChange(buttons.filter((_, i) => i !== index))}
            aria-label="Remove button"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      {buttons.length < max && (
        <button
          type="button"
          className="nodrag w-full text-[11px] text-accent2-ink border border-dashed border-accent2/30 rounded-lg py-1.5 hover:bg-accent2/5"
          onClick={() => onChange([...buttons, { id: newId("btn"), title: "" }])}
        >
          + Add button
        </button>
      )}
    </div>
  );
}

type RowEntry = { id: string; title: string; description?: string };
type SectionEntry = { title: string; rows: RowEntry[] };

function SectionsEditor({ value, onChange }: { value: unknown; onChange: (next: unknown) => void }) {
  const sections: SectionEntry[] = Array.isArray(value) ? (value as SectionEntry[]) : [];

  const patch = (index: number, next: Partial<SectionEntry>) =>
    onChange(sections.map((s, i) => (i === index ? { ...s, ...next } : s)));

  const rowCount = sections.reduce((total, s) => total + s.rows.length, 0);

  return (
    <div className="space-y-2">
      {sections.map((section, sIndex) => (
        <div key={sIndex} className="border border-white/8 rounded-lg p-2 space-y-1.5">
          <div className="flex items-center gap-1.5">
            <input
              className={inputClass}
              maxLength={24}
              placeholder="Section title"
              value={section.title}
              onChange={(e) => patch(sIndex, { title: e.target.value })}
            />
            <button
              type="button"
              className="nodrag text-white/30 hover:text-red-400 flex-shrink-0"
              onClick={() => onChange(sections.filter((_, i) => i !== sIndex))}
              aria-label="Remove section"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {section.rows.map((row, rIndex) => (
            <div key={row.id} className="flex items-center gap-1.5 pl-2">
              <input
                className={inputClass}
                maxLength={24}
                placeholder={`Row ${rIndex + 1}`}
                value={row.title}
                onChange={(e) =>
                  patch(sIndex, {
                    rows: section.rows.map((r, i) =>
                      i === rIndex ? { ...r, title: e.target.value } : r
                    ),
                  })
                }
              />
              <button
                type="button"
                className="nodrag text-white/30 hover:text-red-400 flex-shrink-0"
                onClick={() =>
                  patch(sIndex, { rows: section.rows.filter((_, i) => i !== rIndex) })
                }
                aria-label="Remove row"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {/* WhatsApp caps a list at 10 rows across every section, so the
              limit is enforced on the total rather than per section. */}
          {rowCount < 10 && (
            <button
              type="button"
              className="nodrag w-full text-[11px] text-accent2-ink py-1 hover:underline"
              onClick={() =>
                patch(sIndex, { rows: [...section.rows, { id: newId("row"), title: "" }] })
              }
            >
              + Add row
            </button>
          )}
        </div>
      ))}

      <button
        type="button"
        className="nodrag w-full text-[11px] text-accent2-ink border border-dashed border-accent2/30 rounded-lg py-1.5 hover:bg-accent2/5"
        onClick={() => onChange([...sections, { title: "", rows: [{ id: newId("row"), title: "" }] }])}
      >
        + Add section
      </button>
      {rowCount >= 10 && (
        <p className="text-[10px] text-amber-400/70">
          10 rows is WhatsApp&apos;s maximum for a list.
        </p>
      )}
    </div>
  );
}

// --- the node --------------------------------------------------------------

/**
 * A node's mark.
 *
 * Was a faint glyph on a 10%-opacity square, which at 20px reads as a
 * smudge — every component in the palette looked like the same grey
 * blur, so the list had to be read word by word. A mark earns its place
 * by being identifiable before the label is: a solid tinted tile, a ring
 * in the node's own colour, and a glyph at full strength.
 */
function PaletteIcon({ def, size = "sm" }: { def: NodeDef; size?: "sm" | "xs" | "lg" }) {
  const Icon = NODE_ICONS[def.kind];

  const box = size === "lg" ? "w-9 h-9 rounded-xl" : size === "sm" ? "w-8 h-8 rounded-[10px]" : "w-7 h-7 rounded-lg";
  const glyph = size === "lg" ? "w-4.5 h-4.5" : size === "sm" ? "w-4 h-4" : "w-3.5 h-3.5";

  return (
    <span
      className={`${box} grid place-items-center flex-shrink-0 border`}
      style={{
        // A gradient rather than a flat wash: it gives the tile an edge at
        // small sizes, which is what makes it read as a mark and not a
        // background.
        background: `linear-gradient(140deg, ${def.accent}2E, ${def.accent}12)`,
        borderColor: `${def.accent}59`,
        color: def.accent,
        boxShadow: `inset 0 1px 0 ${def.accent}26`,
      }}
    >
      <Icon className={glyph} strokeWidth={2.25} />
    </span>
  );
}

function FlowNodeCard({ id, data, selected }: NodeProps<BuilderNode>) {
  const { setNodes, setEdges } = useReactFlow<BuilderNode, Edge>();
  const def = nodeDef(data.kind);

  const setValue = useCallback(
    (name: string, value: unknown) => {
      setNodes((nodes) =>
        nodes.map((n) =>
          n.id === id ? { ...n, data: { ...n.data, values: { ...n.data.values, [name]: value } } } : n
        )
      );
    },
    [id, setNodes]
  );

  const remove = useCallback(() => {
    setNodes((nodes) => nodes.filter((n) => n.id !== id));
    setEdges((edges) => edges.filter((e) => e.source !== id && e.target !== id));
  }, [id, setNodes, setEdges]);

  const duplicate = useCallback(() => {
    setNodes((nodes) => {
      const source = nodes.find((n) => n.id === id);
      if (!source) return nodes;
      return [
        ...nodes,
        {
          ...source,
          id: newId(source.data.kind),
          position: { x: source.position.x + 60, y: source.position.y + 60 },
          selected: false,
        },
      ];
    });
  }, [id, setNodes]);

  if (!def) return null;

  // Outlets are derived from the node's own configuration, so adding a
  // button immediately gives you somewhere to connect it from.
  const outlets: { id: string; label: string }[] =
    def.dynamicHandles === "buttons"
      ? (Array.isArray(data.values.buttons) ? (data.values.buttons as ButtonEntry[]) : [])
          .filter((b) => b.title.trim())
          .map((b) => ({ id: b.id, label: b.title }))
      : def.dynamicHandles === "rows"
        ? (Array.isArray(data.values.sections) ? (data.values.sections as SectionEntry[]) : [])
            .flatMap((s) => s.rows)
            .filter((r) => r.title.trim())
            .map((r) => ({ id: r.id, label: r.title }))
        : (def.handles ?? []);

  const isTrigger = def.group === "Trigger";

  return (
    <div
      className={`w-[284px] rounded-xl border bg-[var(--surface-1)] shadow-xl overflow-hidden transition-colors ${
        selected ? "border-accent/60" : "border-white/12 hover:border-white/20"
      }`}
      style={{ boxShadow: selected ? `0 0 0 1px ${def.accent}55` : undefined }}
    >
      {!isTrigger && (
        <Handle
          type="target"
          position={Position.Left}
          className="!w-2.5 !h-2.5 !bg-accent !border-2 !border-[var(--surface-1)]"
        />
      )}

      {/* The node's colour as an edge, so a canvas of twenty cards can be
          read by hue before any label is. */}
      <div
        className="h-[3px] rounded-t-xl"
        style={{ background: `linear-gradient(90deg, ${def.accent}, ${def.accent}44)` }}
      />

      <header
        className="flex items-center gap-2.5 px-3 py-2.5 border-b border-white/8"
        style={{ background: `${def.accent}12` }}
      >
        <PaletteIcon def={def} size="sm" />
        <span className="text-xs font-semibold flex-1 truncate tracking-tight">{def.label}</span>
        <button type="button" onClick={duplicate} className="nodrag text-white/30 hover:text-white/70" aria-label="Duplicate">
          <Copy className="w-3 h-3" />
        </button>
        <button type="button" onClick={remove} className="nodrag text-white/30 hover:text-red-400" aria-label="Delete">
          <Trash2 className="w-3 h-3" />
        </button>
      </header>

      {def.runtime !== "ready" && (
        <div className="mx-3 mt-2 text-[10px] leading-relaxed text-amber-300/80 bg-amber-400/8 border border-amber-400/20 rounded-lg px-2 py-1.5">
          <span className="font-semibold">{RUNTIME_LABEL[def.runtime]}.</span> {def.runtimeNote}
        </div>
      )}

      <div className="p-3 space-y-2.5">
        {def.fields.map((field) => (
          <div key={field.name}>
            <label className="block text-[10px] font-medium text-white/45 mb-1">{field.label}</label>
            <FieldEditor
              field={field}
              value={data.values[field.name]}
              onChange={(next) => setValue(field.name, next)}
            />
            {field.hint && <p className="text-[9px] text-white/25 mt-1">{field.hint}</p>}
          </div>
        ))}
        {def.fields.length === 0 && (
          <p className="text-[11px] text-white/35">{def.description}</p>
        )}
      </div>

      {/* One outlet per path. A node with named outlets gets a labelled row
          each; everything else gets a single handle on the right edge. */}
      {outlets.length > 0 ? (
        <div className="border-t border-white/8">
          {outlets.map((outlet, index) => (
            <div
              key={outlet.id}
              className="relative flex items-center justify-end px-3 py-1.5 text-[10px] text-white/50 border-b border-white/5 last:border-0"
            >
              <span className="truncate">{outlet.label}</span>
              <Handle
                type="source"
                id={outlet.id}
                position={Position.Right}
                style={{ top: "50%" }}
                className="!w-2.5 !h-2.5 !bg-accent2 !border-2 !border-[var(--surface-1)]"
                data-index={index}
              />
            </div>
          ))}
        </div>
      ) : (
        <Handle
          type="source"
          position={Position.Right}
          className="!w-2.5 !h-2.5 !bg-accent2 !border-2 !border-[var(--surface-1)]"
        />
      )}
    </div>
  );
}

const nodeTypes = { flowNode: FlowNodeCard };

/**
 * A connection with a cross on it.
 *
 * React Flow's own way to remove a link is to click it and press Delete,
 * which is not something anybody discovers — and on a touchpad, aiming at
 * a two-pixel curve to select it is its own small ordeal. So the cross is
 * drawn on every connection, sitting at its midpoint: visible enough to
 * find, faint enough not to turn a ten-node flow into a field of buttons,
 * and red under the pointer so there is no doubt what it does.
 */
function DisconnectEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style,
  markerEnd,
}: EdgeProps) {
  const { setEdges } = useReactFlow();

  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge id={id} path={path} style={style} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        <button
          type="button"
          title="Disconnect these two steps"
          aria-label="Disconnect these two steps"
          // nodrag/nopan or the canvas pans out from under the click, and
          // pointerEvents because the label layer ignores them by default.
          className="nodrag nopan absolute flex items-center justify-center w-5 h-5 rounded-full border border-white/25 bg-[var(--surface-1)] text-white/60 shadow-sm transition-all hover:w-6 hover:h-6 hover:border-red-400 hover:bg-red-500/20 hover:text-red-300 focus:outline-none focus-visible:border-red-400 focus-visible:text-red-300"
          style={{
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          onClick={(event) => {
            // The click belongs to the button, not to the canvas behind it.
            event.stopPropagation();
            setEdges((current) => current.filter((edge) => edge.id !== id));
          }}
        >
          <X className="w-3 h-3" strokeWidth={2.5} />
        </button>
      </EdgeLabelRenderer>
    </>
  );
}

const edgeTypes = { disconnect: DisconnectEdge };

/** Every connection looks and behaves the same, however it came to exist. */
const EDGE_STYLE = {
  type: "disconnect" as const,
  animated: true,
  style: { stroke: "#00D4FF66" },
};

// --- the builder -----------------------------------------------------------

interface BuilderProps {
  flowId: string;
  initialName: string;
  initialActive: boolean;
  initialNodes: FlowNode[];
  initialEdges: FlowEdge[];
  /** The workspace's numbers, for the trigger's Phone Numbers field. */
  numbers: BuilderNumber[];
  /** Forms that exist at Meta, for the Send Form node. */
  forms: BuilderForm[];
  /** Assistants in this workspace, for the AI Agent node. */
  assistants: BuilderAssistant[];
}

// `numbers` is deliberately not destructured: the field editor reads it
// from context, which FlowBuilder provides around this component.
function Builder({
  flowId,
  initialName,
  initialActive,
  initialNodes,
  initialEdges,
}: BuilderProps) {
  const [nodes, setNodes, onNodesChange] = useNodesState<BuilderNode>(
    initialNodes.map((n) => ({
      id: n.id,
      type: "flowNode" as const,
      position: n.position ?? { x: 0, y: 0 },
      data: { kind: n.kind, values: n.data ?? {} },
    }))
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>(
    initialEdges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
      ...EDGE_STYLE,
    }))
  );

  const [name, setName] = useState(initialName);
  const [active, setActive] = useState(initialActive);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const { screenToFlowPosition } = useReactFlow();
  const theme = useTheme();

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((current) => addEdge({ ...connection, ...EDGE_STYLE }, current)),
    [setEdges]
  );

  const addNode = useCallback(
    (kind: FlowNodeKind, position: { x: number; y: number }) => {
      const def = nodeDef(kind);
      if (!def) return;
      setNodes((current) => [
        ...current,
        {
          id: newId(kind),
          type: "flowNode" as const,
          position,
          data: { kind, values: { ...def.defaults } },
        },
      ]);
    },
    [setNodes]
  );

  const onDrop = useCallback(
    (event: DragEvent) => {
      event.preventDefault();
      const kind = event.dataTransfer.getData("application/neura-node") as FlowNodeKind;
      if (!kind) return;
      addNode(kind, screenToFlowPosition({ x: event.clientX, y: event.clientY }));
    },
    [addNode, screenToFlowPosition]
  );

  const onSave = useCallback(async () => {
    setSaving(true);
    setStatus(null);

    const payloadNodes: FlowNode[] = nodes.map((n) => ({
      id: n.id,
      kind: n.data.kind,
      position: n.position,
      data: n.data.values,
    }));
    const payloadEdges: FlowEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? null,
    }));

    const result = await saveFlowGraph({
      id: flowId,
      name,
      isActive: active,
      nodes: payloadNodes,
      edges: payloadEdges,
    });

    setSaving(false);
    setStatus({ ok: result.ok, text: result.error ?? result.message ?? "Saved." });
  }, [flowId, name, active, nodes, edges]);

  const palette = useMemo(() => {
    const term = query.trim().toLowerCase();
    return NODE_GROUPS.map((group) => ({
      group,
      items: NODE_DEFS.filter(
        (d) =>
          d.group === group &&
          (!term || d.label.toLowerCase().includes(term) || d.description.toLowerCase().includes(term))
      ),
    })).filter((g) => g.items.length > 0);
  }, [query]);

  // Which numbers the trigger listens on, read off the canvas so the Send
  // Form picker narrows the moment a number is ticked rather than on the
  // next reload. Several triggers are allowed, and a bot listening on two
  // of them listens on the union.
  const listening = useMemo(() => {
    const ids = new Set<string>();
    for (const node of nodes) {
      const picked = (node.data as NodeData).values?.phoneNumbers;
      if (Array.isArray(picked)) for (const id of picked) ids.add(String(id));
    }
    return [...ids];
  }, [nodes]);

  return (
    <ListeningContext.Provider value={listening}>
    <div className="flex h-full min-h-0">
      {/* Palette */}
      <aside className="w-64 border-r border-white/8 flex flex-col flex-shrink-0 min-h-0 bg-[var(--surface-2)]">
        <div className="p-3 border-b border-white/8">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-white/30 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              className="w-full bg-white/4 border border-white/10 rounded-lg pl-8 pr-2.5 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-accent/40"
              placeholder="Search components…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {palette.map(({ group, items }) => (
            <div key={group}>
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/30 mb-2">
                {group} ({items.length})
              </div>
              <div className="space-y-1.5">
                {items.map((def) => (
                  <button
                    key={def.kind}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("application/neura-node", def.kind);
                      e.dataTransfer.effectAllowed = "move";
                    }}
                    // Click also adds, dropped near the middle: dragging is
                    // fiddly on a trackpad and this is the same action.
                    onClick={() => addNode(def.kind, { x: 260 + Math.random() * 120, y: 120 + Math.random() * 200 })}
                    className="group w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl border border-white/8 bg-white/3 hover:border-white/20 hover:bg-white/[0.07] transition-colors text-left cursor-grab active:cursor-grabbing"
                    title={def.description}
                  >
                    <PaletteIcon def={def} />

                    {/* The description was hidden in a title attribute,
                        which on a touchpad nobody ever sees. A component
                        list is unusable if the only way to learn what
                        something does is to drop it on the canvas. */}
                    <span className="min-w-0 flex-1">
                      <span className="block text-xs font-medium truncate">{def.label}</span>
                      <span className="block text-[10px] text-white/35 truncate leading-snug">
                        {def.description}
                      </span>
                    </span>

                    {def.runtime !== "ready" && (
                      <span
                        className="flex-shrink-0 w-4 h-4 rounded-full grid place-items-center text-[9px] font-bold text-amber-300 bg-amber-400/15 border border-amber-400/30"
                        title={def.runtimeNote}
                      >
                        !
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Canvas */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <header className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-white/8 flex-shrink-0">
          <input
            className="bg-white/4 border border-white/10 rounded-lg px-3 py-1.5 text-sm font-medium text-white focus:outline-none focus:border-accent/40 min-w-0"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Bot name"
          />

          {/* Two readings of one switch: what it is set to, and what that
              means for live messages. "Published / Draft" alone leaves people
              asking whether the bot is actually answering anyone. */}
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => setActive((v) => !v)}
              role="switch"
              aria-checked={active}
              aria-label="Published"
              className="flex items-center gap-2 text-xs"
            >
              <span
                className={`relative w-9 h-5 rounded-full transition-colors ${
                  active ? "bg-accent" : "bg-white/15"
                }`}
              >
                <span
                  className={`absolute top-0.5 w-4 h-4 rounded-full bg-[var(--app-bg)] transition-all ${
                    active ? "left-4.5" : "left-0.5"
                  }`}
                />
              </span>
              <span className={active ? "text-white/80" : "text-white/45"}>
                {active ? "Published" : "Draft"}
              </span>
            </button>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-md border ${
                active
                  ? "text-accent-ink border-accent/30 bg-accent/10"
                  : "text-white/40 border-white/12 bg-white/4"
              }`}
              title={
                active
                  ? "Matched against every inbound message."
                  : "Saved, but never matched against inbound messages."
              }
            >
              {active ? "Active" : "Not answering"}
            </span>
          </div>

          <div className="text-[11px] text-white/35">
            {nodes.length} node{nodes.length === 1 ? "" : "s"} · {edges.length} connection
            {edges.length === 1 ? "" : "s"}
          </div>

          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="btn-primary text-sm ml-auto disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            {saving ? "Saving…" : "Save"}
          </button>

          {status && (
            <span className={`text-xs ${status.ok ? "text-accent-ink" : "text-red-400"}`}>
              {status.text}
            </span>
          )}
        </header>

        <div ref={wrapper} className="flex-1 min-h-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
            }}
            nodeTypes={nodeTypes}
            edgeTypes={edgeTypes}
            fitView
            proOptions={{ hideAttribution: false }}
            defaultEdgeOptions={EDGE_STYLE}
            colorMode={theme}
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="color-mix(in oklab, var(--color-white) 16%, transparent)" />
            <Controls className="!bg-[var(--surface-1)] !border !border-white/10 [&_button]:!bg-transparent [&_button]:!border-white/10 [&_button]:!fill-white/60" />
            <MiniMap
              pannable
              zoomable
              className="!bg-[var(--surface-1)] !border !border-white/10"
              nodeColor={(n) => nodeDef((n.data as NodeData).kind)?.accent ?? "#ffffff30"}
              maskColor="color-mix(in oklab, var(--app-bg) 60%, transparent)"
            />
          </ReactFlow>
        </div>
      </div>
    </div>
    </ListeningContext.Provider>
  );
}

export default function FlowBuilder(props: BuilderProps) {
  return (
    <NumbersContext.Provider value={props.numbers}>
      <FormsContext.Provider value={props.forms}>
        <AssistantsContext.Provider value={props.assistants}>
          <ReactFlowProvider>
            <Builder {...props} />
          </ReactFlowProvider>
        </AssistantsContext.Provider>
      </FormsContext.Provider>
    </NumbersContext.Provider>
  );
}

/**
 * Which form a Send Form node opens.
 *
 * Stores the form's id, not its name. The runtime still accepts a name —
 * bots built before this picker existed have one saved — but a name saved
 * today would break the moment someone renamed the form.
 */
function FormPicker({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const all = useContext(FormsContext);
  const numbers = useContext(NumbersContext);
  const listening = useContext(ListeningContext);
  const current = String(value ?? "");

  // Only the forms this bot can actually open. A form lives on one WhatsApp
  // Business Account; a bot listening on a number from another account
  // cannot open it, and WhatsApp refuses it in front of the customer rather
  // than here.
  const forms = formsOnNumbers(all, numbers, listening);

  // Naming the numbers, because "no forms" and "no forms on this number"
  // send someone to two completely different places.
  const listeningLabel = listening
    .map((id) => numbers.find((number) => number.id === id)?.label)
    .filter(Boolean)
    .join(", ");

  if (forms.length === 0) {
    return (
      <p className="text-[11px] text-white/45 leading-relaxed">
        {all.length > 0 && listeningLabel ? (
          <>
            No form exists on {listeningLabel}. A form belongs to one WhatsApp account and only a
            bot listening there can open it — build one on that number under Manage → WhatsApp
            Forms, or tick a different number on the trigger.
          </>
        ) : (
          <>
            No forms are ready. Build one under Manage → WhatsApp Forms and press Update Flow — a
            form has to exist at WhatsApp before a bot can open it.
          </>
        )}
      </p>
    );
  }

  // A saved value that matches nothing is shown rather than silently
  // replaced: it may be a form built in WhatsApp Manager, one deleted
  // since, or one on a number this bot no longer listens on — and either
  // way the author should see what the node still says.
  const known = forms.some((form) => form.id === current);
  const onAnotherNumber = !known && all.some((form) => form.id === current);

  return (
    <>
      <select
        className={inputClass}
        value={known ? current : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" className="bg-[var(--surface-1)]">
          Choose a form…
        </option>
        {forms.map((form) => (
          <option key={form.id} value={form.id} className="bg-[var(--surface-1)]">
            {form.name}
            {form.status !== "published" ? " (draft)" : ""}
          </option>
        ))}
      </select>
      {listeningLabel && (
        <p className="text-[11px] text-white/30 mt-1.5">
          Forms on {listeningLabel}.
        </p>
      )}
      {current && !known && (
        <p className="text-[11px] text-[#FACC15] mt-1.5 leading-relaxed">
          {onAnotherNumber ? (
            <>
              This node opens a form built on a different WhatsApp account, so this bot cannot
              send it. Pick one above, or tick that number on the trigger.
            </>
          ) : (
            <>
              This node currently says &ldquo;{current}&rdquo;, which is not a form in this
              workspace. Pick one above to replace it.
            </>
          )}
        </p>
      )}
    </>
  );
}


/**
 * Which of the workspace's numbers a trigger listens on.
 *
 * Ticking nothing means every number, which is what a one-number workspace
 * wants and what every bot built before numbers existed already means.
 */
function NumbersEditor({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const numbers = useContext(NumbersContext);
  const selected = Array.isArray(value) ? (value as string[]) : [];

  if (numbers.length === 0) {
    return (
      <p className="text-[11px] text-white/35 leading-relaxed">
        No numbers connected yet. Connect one under Integrations and it will appear here.
      </p>
    );
  }

  const toggle = (id: string) =>
    onChange(
      selected.includes(id) ? selected.filter((entry) => entry !== id) : [...selected, id]
    );

  return (
    <div className="nodrag space-y-1">
      {numbers.map((number) => {
        const checked = selected.includes(number.id);
        return (
          <label
            key={number.id}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-white/5 cursor-pointer"
          >
            <span
              className={`grid place-items-center w-4 h-4 rounded border shrink-0 transition-colors ${
                checked ? "bg-accent border-accent" : "border-white/25"
              }`}
            >
              {checked && <Check className="w-3 h-3 text-[var(--app-bg)]" strokeWidth={3} />}
            </span>
            <input
              type="checkbox"
              checked={checked}
              onChange={() => toggle(number.id)}
              className="sr-only"
            />
            <span className="text-xs tabular-nums flex-1 truncate">{number.label}</span>
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded ${
                number.status === "active"
                  ? "bg-accent/12 text-accent-ink"
                  : "bg-white/8 text-white/45"
              }`}
            >
              {number.status === "active" ? "Active" : number.status}
            </span>
          </label>
        );
      })}
      <p className="text-[11px] text-white/30 pt-1">
        {selected.length === 0
          ? "Listening on all numbers."
          : `Listening on ${selected.length} of ${numbers.length}.`}
      </p>
    </div>
  );
}

/**
 * Which assistant an AI Agent node hands the turn to.
 *
 * Filtered to the numbers this bot listens on, because an assistant pinned
 * to one number cannot answer on another. Without this the node took
 * whichever assistant was oldest in the workspace, so a business with a
 * sales assistant and a support assistant got the same one on every bot and
 * every number — with no way to say otherwise.
 */
function AssistantPicker({
  value,
  onChange,
}: {
  value: unknown;
  onChange: (next: unknown) => void;
}) {
  const all = useContext(AssistantsContext);
  const numbers = useContext(NumbersContext);
  const listening = useContext(ListeningContext);
  const current = String(value ?? "");

  const available = assistantsOnNumbers(all, listening);

  const listeningLabel = listening
    .map((id) => numbers.find((number) => number.id === id)?.label)
    .filter(Boolean)
    .join(", ");

  const nameOfNumber = (id: string | null) =>
    id ? (numbers.find((number) => number.id === id)?.label ?? "another number") : null;

  if (available.length === 0) {
    return (
      <p className="text-[11px] text-white/45 leading-relaxed">
        {all.length > 0 && listeningLabel ? (
          <>
            No assistant runs on {listeningLabel}. An assistant answers on the number it is set to
            — open AI Assistant, set one to this number or to all numbers, then reopen this bot.
          </>
        ) : (
          <>
            No assistant exists yet. Build one under AI Assistant and reopen this bot — this node
            has nothing to hand the reply to until then.
          </>
        )}
      </p>
    );
  }

  // A saved value that matches nothing is shown rather than silently
  // dropped: it may be an assistant switched off, deleted, or pinned to a
  // number this bot no longer listens on, and the author should see which.
  const known = available.some((assistant) => assistant.id === current);
  const onAnotherNumber = !known && all.some((assistant) => assistant.id === current);

  return (
    <>
      <select
        className={inputClass}
        value={known ? current : ""}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="" className="bg-[var(--surface-1)]">
          First one that fits the number
        </option>
        {available.map((assistant) => (
          <option key={assistant.id} value={assistant.id} className="bg-[var(--surface-1)]">
            {assistant.name}
            {assistant.connectionId
              ? ` · ${nameOfNumber(assistant.connectionId)}`
              : " · all numbers"}
          </option>
        ))}
      </select>
      {listeningLabel && (
        <p className="text-[11px] text-white/30 mt-1.5">Assistants on {listeningLabel}.</p>
      )}
      {current && !known && (
        <p className="text-[11px] text-[#FACC15] mt-1.5 leading-relaxed">
          {onAnotherNumber ? (
            <>
              This node points at an assistant that answers on a number this bot does not listen
              on. Pick one above, or tick that number on the trigger.
            </>
          ) : (
            <>
              This node points at an assistant that no longer exists in this workspace. Pick one
              above to replace it.
            </>
          )}
        </p>
      )}
    </>
  );
}
