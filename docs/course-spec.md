# SITCON Camp 2026｜ML 課程 Spec

## 前提
- **平台**：全程 Web App，不碰 Colab。理由：Colab 環境下學員容易狂叫 AI agent，引導節奏會失控。
- **教學方法論**：loop（給問題 → 讓他摸索 → 得到不差的結果 → 我們把問題變難 → 新工具/概念登場 → 再摸索）。每一步都是「舊方法撞牆」驅動，不是單方面丟名詞。
- **環境即引導**：盡量讓介面本身把學員推向正解，而不是講師用嘴帶。
- **時間**：3-3-2

## 第一堂課：從零到 MLP（3 小時）

**Hook 更動**：從「猜類組」改成「晨型人 vs 夜貓子」。二元分類、分佈相對平衡，naive baseline（全猜同一類）沒那麼好賺，撞牆感更真實

**目標路徑**：classification 直覺 → training loop → linear classifier → gradient descent → 為什麼要加層（MLP）

### Loop 0｜前置（營前幾天，非當天）
- 表單提前發，當天不現場生 synthetic data
- 欄位（都要能當 feature）：平日起床/就寢時間、最有生產力時段、咖啡因攝取量、週末 vs 平日作息偏移、自評（晨型/夜貓）= label。
- 後台直接把資料切成 real set + 之後 Loop 2 要用的 distribution 來源。

### Loop 1｜手標 + classification 直覺（~40 min）
- 給 ~50 筆真實資料，strip 掉 label。
- 各小隊分工手標（一人 8–9 筆），現場猜晨型/夜貓
- 比各隊準度 → 自然帶出「人會憑特徵分群」的直覺。
- **結尾收在 classification 的概念**（不需要工具，純人腦摸）

### Loop 2｜資料變多 + 視覺化工具（~40 min）
- 從真實 distribution 現場生到 ~500 筆，丟回給學員。
- 痛點：500 筆手標不完 → justify 引入視覺化工具。
- 工具兩段：
  1. **視覺化**：dropdown 選 ~5 種視覺化方法 + 選要看哪些 column，按執行（含 fake loading）render 圖。
  2. **圈選標記**：在圖上 lasso 一群人給 soft label（「可能晨型」），可重複圈、多種方法各圈一次 → 匯出一份每筆帶 N 個標記的表 → 加總/除以總數當機率。
- **結尾新增的是 training loop 直覺**（試一個方法 → 看結果 → 調整再試），classification 概念沿用 Loop 1。

### Loop 3｜手動 → 自動：linear classifier（~20 min）
- 不再手動圈 cluster，改成讓學員設計一條 WX+B。
- 介面：自由拉 W、B 的 slider，線的一側 = 晨型、另一側 = 夜貓；即時顯示準度/機率。
- 限制：只能用「一個 view 的 WX+B」，逼學員找一條乾淨切開兩群的線。
- 可與 Loop 4 合併，中間用一個小結串

### Loop 4｜自動化調參：gradient descent（~20 min）
- 痛點：手拉 W、B 很煩、也不知道是不是最好 → 想自動化。
- **介面用積木（非 Python）**：input 是 WX+B 與資料點，output 是新的 WX+B。
- **環境引導關鍵**：可用積木裡約 **1/3 是斜率/梯度相關**（如「算這個點的斜率」「往下坡走一步」「loss 變化量」），讓學員拼出來的策略自然長得像 gradient descent，不靠講師明講。
- 先 visualize loss landscape / heatmap，把學員 Loop 3 手動找到的點（near-optimal）標在圖上 → 收在 gradient descent 的概念。

### Loop 5｜線性的天花板 → 非線性 → MLP（~30 min）

**撞牆**
- 給一個線性切不開的 dataset（XOR 結構；晨型/夜貓版本待設計）。
- 學員沿用 Loop 4 介面拉線，發現一條線怎麼擺都切不乾淨。

**直覺陷阱：加線就好？**
- 開放「加第二條線」→ 學員會試。
- 介面即時顯示：兩條線疊起來的結果等價於一條線（兩個 linear 組合還是 linear）
    - 先讓「規模變大就會變好」的直覺撞牆，不然後面加層的意義出不來

**解鎖：在兩層之間塞一個「彎折」**
- 介面新增一個開關：在兩條線中間加 activation（視覺上呈現為「把空間折一下再切」）
- 開了之後重跑 → 準度明顯提升，XOR 被分開
- 不講 ReLU 公式，用動畫讓學員看到「折疊空間」的效果

**收尾（~5 min）**
- 把剛剛的「兩層 + activation」正名為 MLP
- Tensorflow Playground 自由探索：加層、加 neuron、換 activation，看 decision boundary 怎麼變
- 第一堂 big picture wrap-up

## 第二堂課：模型架構演進（3 小時）

### Loop 0｜文字怎麼變數字：Tokenizer + Embedding（~40 min）
- 要餵文字進模型，得先把字變成數字（i.e., 向量）
- **Tokenizer 探索**：輸入一段字 → 看它被切成哪些 token / id，玩出「模型眼中沒有字、只有 token」
- **Embedding 探索**：丟進一個 embedding space 讓學員逛，看相近語意的字會靠在一起；結尾用 bias 例子收（man:king :: woman:? → arxiv 1607.06520）。
- 收尾：現在每個字都是一排數字 → 可以餵給上一堂的 MLP 了

### Loop 1｜MLP 吃文字 + 像素撞牆（~40 min）｜本堂核心 beat
- **橋接**：回收早上第一堂親手訓練的 CIFAR-10 MLP。它看到的從來不是「圖」：一張圖先攤平成 3,072 個數字才餵進去。先開賭（問全班表決）：把每張圖的像素全部用**同一個固定排列 π** 搬家（訓練和考試都是），它還學得會嗎？多數會押學不會 → 站上讓結果自己打臉。
- **撞牆 demo（環境引導關鍵）**：像素撞牆站（/pixel-shuffle），兩顆一樣的 MLP 在瀏覽器裡現場同步訓練，A 吃原始圖、B 吃 π 打亂的同一批圖。
    - 學員動的旋鈕：▶ 訓練（兩顆同時練）、圖片切換（對照「你看到的／模型看到的」）、點神經元看第一層權重樣板、還原排列 π⁻¹。
    - 觀察：**兩條 loss 曲線疊在一起、收斂到同一個 val 準度（參考曲線 38% 對 38%）**，逐張圖的預測相同；hover 同一顆隱藏神經元，打亂網的雜訊樣板按下 π⁻¹ 就變回原始網的同一張樣板 → 它從頭到尾沒發現圖被打亂過。
    - 點破：對 MLP，像素位置只是輸入線的**編號**；換編號，題目沒變。
- **轉寫到文字**：圖的排列、句子的詞序，對這種模型都只是編號 →「故事」vs「事故」同一袋字，它分不出來（詞袋平均的機制與 Iyyer 2015 準度佐證退到講者備忘）。
- 收束：準度一分都沒掉，牆在假設：MLP 的設計裡根本沒有「排列有意義」這個假設，資料再多也補不回 → 我們需要一個**假設順序有意義**的架構 → RNN。

### Loop 2｜RNN：把順序吃進去（~50 min）
- **next-token 互動（參考 Brilliant）**：給目前的字猜下一個最可能的字；介面讓學員逐步加大可參考的 context，體感「看得越多猜得越準」。
    - 學員動的旋鈕：context 視窗大小、要不要看更前面的字。
- **引入 RNN**：一次吃一個 token、把「記憶」往後傳的 hidden state，用動畫呈現狀態沿序列流動。
- **暴露 RNN 的牆**（為 Transformer 鋪路，逐一示範）：
    - 長 context 容易忘（前面資訊被沖淡）
    - 訓練不穩（梯度爆炸/消失，視覺上 loss 亂跳）

### Loop 3｜Transformer：讓每個字直接看到所有字（~50 min）
- **解法切入**：與其讓記憶一站一站傳，不如讓序列裡**每個 token 直接看向其他所有 token**（attention）
    - 學員動的旋鈕：點一個字，看它的 attention 分散到哪些字上。
- **逐步補架構**（時間緊的話可以直接去掉）：
    1. attention 本身對順序無感 → 補 positional embedding（把「第幾個」這個資訊塞回去）
    2. 疊深之後訓練變難 → 補 residual connection（讓資訊有條捷徑繞過層，loss 變穩）
    3. 可能還是得講 QKV 不然最重要的 attention 來源沒有解釋有點怪
        - Visualization: https://poloclub.github.io/transformer-explainer/
### Loop 4｜收尾：架構即樂高（~15 min）
- 把整堂串成一條線：**MLP（沒假設、order-blind）→ RNN（假設順序/記憶）→ Transformer（假設全局直接互看 + 補丁）**。
- 銜接第三堂：這些零件拼出來的大模型可以拿來玩什麼（LoRA / 生成 / RL）。


## 第三堂課：拉開全景（2 小時，4×30 min）

- **定位**：Flashy + 發散。前兩堂是「一條線打穿」，第三堂是「讓學員看到 ML 世界比那條線大很多」。
- **共通原則**：能先跑就先跑，現場只載入/微調看成果，把 30 分鐘留給「玩 + 看到變化」而非等 loading。
- **參與感底線**：每一站都要有一個學員能動的旋鈕（adapter / prompt / reward / 節點），避免變成「看講師 demo」。

### 3-1｜LoRA：教模型講話（~30 min）
- 拿一顆小的 local LLM，**adapter 事先訓練好**，現場直接載入。
- 學員動的旋鈕：切換 base vs adapter、換不同 adapter（不同講話風格/任務）對比同一個 prompt 的輸出差異。
- 直覺收束：不用重訓整顆模型，只貼一層小東西就能改變行為 → 帶出「微調」的概念。
- 可選搭：uncensored vs censored 對比放這站當 safety 小料（時間夠才上）

### 3-2｜ComfyUI：影像生成（~30 min）
- 前置：workflow / 環境**事先架好**，學員不從零接節點。
- 學員動的旋鈕：在既有 workflow 上改 prompt、換幾個關鍵節點參數（step、seed、strength），即時看圖怎麼變。

### 3-3｜RL：讓 agent 自己學（~30 min）
- 環境用 Pong 一類視覺直觀的。
- **避免「看電腦自己玩」**：給學員可動的是 reward shaping / 動作空間 / 觀測設定，改完重跑看 agent 行為怎麼變。
- 訓練同樣 front-load：事先存好幾個不同階段的 checkpoint，現場載入對比「學壞 → 學好」。

### 3-4｜Wrap-up + 全景（~30 min）
- 把三堂收束：ML 不只 classification、不只 ChatGPT
- 點名幾條可延伸方向（可解釋性、多模態、agent 等），給想繼續玩的人一個入口



### feedback
- 看要不要變成是變成是把電腦教室分成 4 個區域然後讓學員自己去 explore
- 其他第四個 session
    - CV classificaiton
    - CLIP + Webcam (可能先整理在)
    - [音樂相關的](https://huggingface.co/google/magenta-realtime)
    - feature steering

## 開發清單（Web App）
**共用**：scatter rendering、dataset loader、一致的 UI shell
### 第一堂課
- **表單 + 資料後台**：營前收 feature + self-label，後台切 real set / distribution 來源、現場生 synthetic data 的端點，這可能直接用 google 表單
- **Loop 2 視覺化工具**：~5 種視覺化方法 dropdown、column 選擇器、fake loading、render；lasso 圈選 + 指派 label；匯出每筆多標記的 CSV/Excel。
- **Loop 3 WX+B 介面**：W/B slider、scatter 上即時畫線、即時準度/機率顯示。
- **Loop 4 積木調參介面**：積木編輯器（**約 1/3 積木為斜率/梯度操作**）、loss landscape heatmap、把學員手動點標在圖上、gradient descent 執行動畫。
- **Loop 5 加層介面**：加 hidden layer 開關、XOR dataset、加層前後對比視覺化；嵌入 Tensorflow Playground。

### 第二堂課
- **Tokenizer 探索站**：輸入文字 → 顯示切出來的 token 與 id。
- **Embedding 探索站**：embedding space 2D/3D 投影、向量運算 demo、結尾 bias 例子。
- **像素撞牆站 pixel-shuffle**（pixel-shuffle 回歸了：當年為 CNN 撞牆設計、一度被順序撞牆站取代，現在改為佐證「序列假設」而非 CNN）：雙 MLP 現場同步訓練（原始 vs 固定 π 打亂）、loss/val 即時對比、神經元權重樣板 hover、還原排列 π⁻¹；舊順序撞牆站（/order-shuffle）降為講師 dev 站。
- **next-token 站**：可調 context 長度的逐字預測介面。
- **RNN 視覺化**：hidden state 沿序列流動 + loss 不穩動畫。
- **Transformer 站**：attention 權重連線、PE on/off、residual on/off 對 loss 穩定度對比、QKV（接 transformer-explainer）。

### 第三堂課
- LoRA adapter ×N（不同風格）、RL 各階段 checkpoint、ComfyUI workflow 與環境
