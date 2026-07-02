// Landing page + station index. Server component (no client interactivity).
//
// The station apps are SEPARATE Vite apps on their own origin/port, so links
// into them are plain <a> tags, not next/link. In dev, course2 runs on :5173
// (start everything with `pnpm dev`). Override via NEXT_PUBLIC_COURSE2_URL.

const COURSE2_BASE =
  process.env.NEXT_PUBLIC_COURSE2_URL ?? "http://localhost:5173";

interface StationLink {
  id: string;
  title: string;
  blurb: string;
  /** Developer-only route, marked distinctly in the index. */
  dev?: boolean;
}

const course2Stations: StationLink[] = [
  { id: "tokenizer", title: "Tokenizer", blurb: "原始文字如何變成 token。" },
  { id: "embedding", title: "Embedding", blurb: "token 變成帶有語意的 vector。" },
  { id: "order-shuffle", title: "打亂詞序", blurb: "為什麼詞序很重要（bag-of-words 會失效）。" },
  { id: "next-token", title: "Next Token", blurb: "把語言建構成 next token 預測。" },
  { id: "rnn-viz", title: "RNN 視覺化", blurb: "在序列中傳遞狀態。" },
  { id: "transformer", title: "Transformer", blurb: "attention：每個 token 都能看到每個 token。" },
  { id: "_reference", title: "Reference Station", blurb: "開發者範本，複製我。", dev: true },
  { id: "viz-sandbox", title: "Viz Sandbox", blurb: "用假資料展示每個 @camp/viz 元件。", dev: true },
];

function StationCard({ base, station }: { base: string; station: StationLink }) {
  return (
    <a
      href={`${base}/${station.id}`}
      className="block rounded-lg border border-border bg-panel p-4 transition-colors hover:border-accent"
    >
      <div className="flex items-center gap-2">
        <span className="font-medium">{station.title}</span>
        {station.dev ? (
          <span className="rounded bg-warning/20 px-1.5 py-0.5 font-mono text-[10px] uppercase text-warning">
            dev
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-sm text-muted">{station.blurb}</p>
    </a>
  );
}

export default function HomePage() {
  return (
    <div className="flex flex-col gap-12">
      <section className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold tracking-tight">
          動手戳一戳，理解 Machine Learning
        </h1>
        <p className="max-w-2xl text-muted">
          SITCON Camp 2026 Machine Learning 課程的互動式網頁「stations（關卡）」，
          一個為台灣高中生舉辦的暑期營隊。教學是一種<strong>循環（loop）</strong>：
          給學生一個問題，讓他們動手嘗試、撞牆，接著引入新工具或概念，再重複。
          每個 station 都是一塊厚重、純前端的互動畫布。
        </p>
        <p className="max-w-2xl text-sm text-muted">
          繁重的運算（訓練模型）都在<strong>事前</strong>完成，由 Python
          precompute pipeline 匯出小巧的產物（ONNX 模型、JSON）。瀏覽器只負責
          播放這些產物，或執行輕量推論，從不訓練。
        </p>
      </section>

      <section id="stations" className="flex flex-col gap-6">
        <h2 className="text-xl font-semibold">課程與 stations</h2>

        <div className="rounded-lg border border-border p-5">
          <div className="mb-1 flex items-baseline justify-between">
            <h3 className="text-lg font-semibold">
              Course 2 · 模型架構演進
            </h3>
            <span className="font-mono text-xs text-muted">MLP → RNN → Transformer</span>
          </div>
          <p className="mb-4 text-sm text-muted">
            最先開發的課程。點開下方任一 station（需先啟動 course2 dev server）。
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {course2Stations.map((s) => (
              <StationCard key={s.id} base={COURSE2_BASE} station={s} />
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-dashed border-border p-5 text-sm text-muted">
          <h3 className="mb-1 text-lg font-semibold text-fg">
            Course 1 與 Course 3
          </h3>
          <p>
            尚未開發。Course 1 將使用本 shell 中保留的{" "}
            <code className="font-mono">/api/synthetic</code> 後端（目前回傳
            501）。
          </p>
        </div>
      </section>
    </div>
  );
}
