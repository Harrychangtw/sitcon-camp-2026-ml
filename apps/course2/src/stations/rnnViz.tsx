/**
 * RNN VIZ — station 05 of Course 2.
 *
 * The first real answer to "how do we handle order": carry a HIDDEN STATE along
 * the sequence. Students type a sentence, step through it token by token and
 * watch the hidden-state vector evolve on a heatmap — then feel the wall: the
 * earliest token's fingerprint washes out of one fixed-size vector (the
 * `influence` trace decays), which motivates attention next.
 *
 * Wave 3: the RNN is REAL — a small GRU language model trained by
 * `camp-precompute train-rnn` on Alice in Wonderland (Qwen is a transformer;
 * reusing it here would defeat the lesson). Presets are recorded outputs of
 * those trained weights; typed sentences are forwarded through the same
 * weights on the live GPU server. The browser NEVER runs the RNN — it replays
 * JSON; the displayed state is a pure function of (sequence, step).
 */
import { useEffect, useMemo, useState } from "react";
import {
  LabeledSlider,
  LiveStatus,
  RunButton,
  SegmentedControl,
  StationLayout,
  type LiveState,
} from "@camp/ui";
import { Heatmap } from "@camp/viz";
import { liveInferTimed, loadJSON } from "@camp/data";

interface RnnSequence {
  sequenceId: string;
  label: string;
  tokens: string[];
  /** hidden[step] = hidden-state vector after consuming token `step`. */
  hidden: number[][];
  /** influence[step] = normalized lingering influence of the FIRST token. */
  influence: number[];
}

interface Activations {
  hiddenSize: number;
  sequences: RnnSequence[];
}

const DATA_URL = "/data/course2/rnn-viz/activations.json";
const AUTO_STEP_MS = 650;

export function RnnVizStation() {
  // 1. STATE
  const [data, setData] = useState<Activations | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sequenceId, setSequenceId] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  // 2. LOAD PRECOMPUTED DATA — via @camp/data inside an effect.
  useEffect(() => {
    let alive = true;
    loadJSON<Activations>(DATA_URL)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setSequenceId(d.sequences[0]?.sequenceId ?? null);
      })
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  // TYPED INPUT — the primary interaction: any sentence is forwarded through
  // the SAME trained GRU weights on the live GPU server and rendered as one
  // more sequence through the identical viz path. Presets stay precomputed
  // (recorded outputs of the same weights) and keep working offline.
  const [customText, setCustomText] = useState("");
  const [customSeq, setCustomSeq] = useState<RnnSequence | null>(null);
  const [liveMs, setLiveMs] = useState(0);
  const [livePending, setLivePending] = useState(false);
  const [liveFailed, setLiveFailed] = useState(false);
  const [liveShown, setLiveShown] = useState(false);

  const sequences = useMemo<RnnSequence[]>(() => {
    const base = data?.sequences ?? [];
    return customSeq ? [...base, customSeq] : base;
  }, [data, customSeq]);

  const submitCustom = async () => {
    const text = customText.trim();
    if (!text || livePending) return;
    setLivePending(true);
    setLiveFailed(false);
    const r = await liveInferTimed<RnnSequence>("/rnn/forward", { text });
    setLivePending(false);
    if (!r) {
      setLiveFailed(true);
      return;
    }
    setCustomSeq(r.data);
    setLiveMs(r.ms);
    setLiveShown(true);
    setSequenceId(r.data.sequenceId);
  };

  const seq = useMemo(
    () => sequences.find((s) => s.sequenceId === sequenceId) ?? null,
    [sequences, sequenceId],
  );
  const showingLive = Boolean(seq?.sequenceId.startsWith("live-"));

  const liveState = useMemo<LiveState>(() => {
    if (livePending) return { kind: "pending" };
    if (liveFailed) return { kind: "cached" };
    if (liveShown && showingLive) return { kind: "live", ms: liveMs };
    return { kind: "idle" };
  }, [livePending, liveFailed, liveShown, showingLive, liveMs]);
  const steps = seq?.tokens.length ?? 0;
  const lastStep = Math.max(steps - 1, 0);

  // Reset the step whenever the sequence changes (lengths differ — never index
  // past the shorter one).
  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [sequenceId]);

  // Auto-advance: RunButton only fires a one-shot beat, so we drive the timer
  // ourselves. Stop at the last step; clean up on unmount / dependency change.
  useEffect(() => {
    if (!playing || steps === 0) return;
    if (step >= lastStep) {
      setPlaying(false);
      return;
    }
    const id = setTimeout(() => setStep((s) => Math.min(s + 1, lastStep)), AUTO_STEP_MS);
    return () => clearTimeout(id);
  }, [playing, step, lastStep, steps]);

  // 3. DERIVED CANVAS DATA — a pure function of (seq, step).
  // Rows = hidden dims, columns = timesteps; column labels are the tokens
  // consumed at each step. Only steps up to the current one are revealed, so the
  // state visibly accumulates left-to-right.
  const { matrix, colLabels, rowLabels } = useMemo(() => {
    if (!seq || !data) return { matrix: [] as number[][], colLabels: [], rowLabels: [] };
    const h = data.hiddenSize;
    const cols = seq.hidden.slice(0, step + 1);
    const rowsOut: number[][] = [];
    for (let d = 0; d < h; d++) {
      rowsOut.push(cols.map((col) => col[d] ?? 0));
    }
    return {
      matrix: rowsOut,
      colLabels: seq.tokens.slice(0, step + 1),
      rowLabels: Array.from({ length: h }, (_, d) => `h${String(d).padStart(2, "0")}`),
    };
  }, [seq, data, step]);

  const influenceNow = seq ? seq.influence[step] ?? 0 : 0;

  return (
    <StationLayout
      title="RNN 視覺化"
      subtitle="處理順序的一種想法：沿著序列傳遞一個隱藏狀態（hidden state）。"
      controls={
        <>
          <label className="flex flex-col gap-1.5">
            <span className="font-mono text-xs text-muted">
              自己打一句（GPU 即時跑訓練好的 RNN，最多 24 個 token）
            </span>
            <input
              type="text"
              value={customText}
              onChange={(e) => setCustomText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitCustom();
              }}
              placeholder="例如 the cat forgot the first word"
              className="rounded-md border border-border bg-panel px-3 py-2 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void submitCustom()}
              disabled={livePending || !customText.trim()}
              className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-fg transition-colors hover:border-accent disabled:opacity-40"
            >
              {livePending ? "計算中…" : "餵給 RNN"}
            </button>
            <LiveStatus state={liveState} />
          </label>

          {seq ? (
            <SegmentedControl<string>
              label="或選一個預設序列"
              value={seq.sequenceId}
              onChange={setSequenceId}
              options={sequences.map((s) => ({
                label: s.sequenceId.startsWith("live-")
                  ? "自訂句子"
                  : s.sequenceId.replace(/-/g, " "),
                value: s.sequenceId,
              }))}
            />
          ) : null}

          <div>
            <div className="mb-1 font-mono text-xs text-muted">步驟</div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setStep((s) => Math.max(s - 1, 0));
                }}
                disabled={!seq || step <= 0}
                className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-fg transition-colors hover:border-accent disabled:opacity-40"
              >
                ← 上一步
              </button>
              <button
                type="button"
                onClick={() => {
                  setPlaying(false);
                  setStep((s) => Math.min(s + 1, lastStep));
                }}
                disabled={!seq || step >= lastStep}
                className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm text-fg transition-colors hover:border-accent disabled:opacity-40"
              >
                下一個 token →
              </button>
            </div>
          </div>

          <RunButton
            label="跑整段序列"
            runningLabel="餵入 token 中…"
            durationMs={300}
            disabled={!seq}
            onRun={() => {
              if (step >= lastStep) setStep(0);
              setPlaying(true);
            }}
          />

          <LabeledSlider
            label="拖曳"
            min={0}
            max={lastStep}
            step={1}
            value={step}
            onChange={(v) => {
              setPlaying(false);
              setStep(v);
            }}
            format={(v) => `${String(v + 1).padStart(2, "0")} / ${String(steps).padStart(2, "0")}`}
          />
        </>
      }
      takeaway={
        <span>
          往後走得夠遠，最早那個 token 的痕跡就會淡去。把所有東西塞進一個
          vector 裡是行不通的。
        </span>
      }
    >
      <div className="flex h-full flex-col gap-5">
        {error ? (
          <p className="text-sm text-warning">
            無法載入啟動值（{error}）。請執行{" "}
            <code className="font-mono">uv run camp-precompute rnn-viz</code>。
          </p>
        ) : !seq || !data ? (
          <p className="text-sm text-muted">載入啟動值中…</p>
        ) : (
          <>
            {/* The sequence as tokens; the token just consumed is the lime mark. */}
            <div>
              <div className="mb-1 font-mono text-xs text-muted">
                序列 · 正在讀第 {String(step + 1).padStart(2, "0")} 個 token
              </div>
              <div className="flex flex-wrap gap-1.5">
                {seq.tokens.map((tok, i) => {
                  const consumed = i <= step;
                  const active = i === step;
                  return (
                    <span
                      key={`${tok}-${i}`}
                      className={`rounded-md border px-2 py-1 font-mono text-xs transition-colors ${
                        active
                          ? "border-accent text-accent"
                          : consumed
                            ? "border-border text-fg"
                            : "border-border/40 text-muted"
                      }`}
                    >
                      {tok}
                    </span>
                  );
                })}
              </div>
            </div>

            {/* Hidden state: rows = dims, cols = steps. Diverging (signed tanh
                values), active step marked in lime. */}
            <div className="min-h-0 flex-1">
              <div className="mb-1 font-mono text-xs text-muted">
                隱藏狀態 · {data.hiddenSize} 維 × {step + 1} 步
              </div>
              <Heatmap
                matrix={matrix}
                rowLabels={rowLabels}
                colLabels={colLabels}
                min={-1}
                max={1}
                diverging
                highlightMax={false}
                highlightCol={step}
                height={360}
              />
            </div>

            {/* The wall, made concrete: influence of the FIRST token, now. */}
            <div>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="font-mono text-xs text-muted">
                  第 01 個 token（&ldquo;{seq.tokens[0]}&rdquo;）對狀態的影響
                </span>
                <span className="font-mono text-xs text-accent">
                  {(influenceNow * 100).toFixed(1)}%
                </span>
              </div>
              <div className="relative h-2 w-full overflow-hidden rounded-sm bg-panel">
                <div
                  className="h-full rounded-sm bg-accent transition-[width] duration-300"
                  style={{ width: `${Math.max(influenceNow, 0) * 100}%` }}
                />
              </div>
              <p className="mt-2 text-sm text-muted">
                隨著餵入越多 token，第一個 token 在隱藏狀態上的痕跡會被沖淡，
                這正是 RNN 在長距離依賴上撞到的牆。這是一個真的在《愛麗絲夢遊仙境》
                上訓練過的小 GRU（hidden = {data.hiddenSize}）——不在它字彙表裡的詞會
                變成 <span className="font-mono">&lt;unk&gt;</span>，但一樣會推動狀態。
              </p>
            </div>
          </>
        )}
      </div>
    </StationLayout>
  );
}
