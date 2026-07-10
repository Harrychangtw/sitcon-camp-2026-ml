---
marp: true
theme: camp-dark
paginate: true
footer: Cover
---

<!-- _class: cover -->


---

<!-- _class: sparse -->
<!-- footer: 關於我 -->

# 帶課的人 _Harry 張祺煒_


- 臺大資工準新生（特殊選才）
- 奧義智慧（CyCraft）研究實習生
- 研究「怎麼讓 AI 更安全」：發過兩篇論文（TMLR、EACL）
- SITCON 2025、2026 年會講者
- 下課想聊的都歡迎：攝影、剪片、英文辯論


---

<!-- footer: Outline -->

![bg cover](../assets/bg/toc.png)



---

<!-- _class: statement -->


# 開始之前，一個約定 _有問題，隨時舉手_

今天的東西，第一次聽卡住很正常。

有任何聽不懂的地方，**隨時舉手打斷我**。

_「這個詞沒聽過」「這張圖在畫什麼」「太快了，再講一次」，都是舉手的好理由。_

_你卡住的地方，旁邊的人多半也卡住了。_


---

<!-- _class: divider -->
<!-- footer: 文字怎麼變數字 -->

![bg cover](../assets/bg/divider-01.png)




---

<!-- _class: sparse -->

# 上一堂的模型，看不懂字 _模型只吃數字，這堂的輸入卻是一句話_

<div class="cols">
<div>

### 上一堂

餵進去的是一排數字。

`[5.1, 3.5, 1.4, 0.2]`

_花瓣長度、寬度，本來就是數字。_

</div>
<div data-marpit-fragment="1">

### 這堂

餵進去的是**一句話**。

「今天天氣真好」

_模型看不懂字，得先把字變成數字。_

</div>
</div>

<div data-marpit-fragment="2">

差的那一步，就是**把文字變成數字**。

</div>


---

<!-- _class: statement -->

# 第一步：先切成小塊 _為什麼要先切塊?_

句子有無限多種，沒辦法一句一句對應到數字。

<div data-marpit-fragment="1">

先把句子**切成一小塊一小塊**，這些小塊就叫 token。

</div>

<div data-marpit-fragment="2">

_塊的種類是有限的，每一塊才能在詞表裡有自己的編號。_

_負責切塊的工具，就叫 tokenizer，下一站就去玩它。_

</div>


---

# 換你動手 _Tokenizer 探索站_

<div class="station">
<div class="st">
<h4>你要動的旋鈕</h4>

輸入任意文字，切換**切分方式**（字元／詞／BPE），看同一句話切出不同的 **token** 與編號

</div>
<div class="st">
<h4>試試看</h4>

- 中英混寫「機器學習的 tokenization」，字元／詞／BPE 各按一次
- 標點與空格「你好！！！」，看空格怎麼被標記
- 罕見詞、自己的名字「祺煒」，在字元／詞模式看會不會變成 [UNK]（沒看過的詞）

</div>
<div class="st">
<h4>你應該會看到</h4>

換一種切法，同一句話就變成不同數量、不同邊界的 token。

</div>
<div class="st check">
<h4>檢核點</h4>

我按過三種切法，看到同一句話的 token 數和切分邊界都不一樣。

</div>
</div>

<span class="chip">🛠 講師畫面／各組電腦已開好 · <a href="https://camp.harrychang.me/tokenizer">/tokenizer</a></span>


---

# 模型眼中，只有 Token 和編號

<div class="cols">
<div>

### Text 視角

![h:820](../../figures/oai-tokenizer-text-token.png)

###### 彩色切塊：一句話被切成一顆顆 token

</div>
<div>

### Token IDs 視角

![h:820](../../figures/oai-tokenizer-token-id.png)

###### 每顆 token 一個編號，是座號不是語意

</div>
</div>

所以在模型眼中，只有 **token** 和它的編號。


---

# 細與多的折衷 _為什麼切成這樣?_

<div class="caps">
<div class="cap" data-marpit-fragment="1">
<span class="cap-emoji">🔡</span>
<div class="cap-label"><span class="cap-title">照字母切</span><span class="cap-sub">Character-level</span></div>
<div class="cap-div"></div>
<div class="cap-text">'hello' → ['h', 'e', 'l', 'l', 'o']，切最細，一句話變超長。</div>
</div>
<div class="cap" data-marpit-fragment="2">
<span class="cap-emoji">📚</span>
<div class="cap-label"><span class="cap-title">照整詞切</span><span class="cap-sub">Word-level</span></div>
<div class="cap-div"></div>
<div class="cap-text">'祺煒' → [UNK]，詞表爆炸，還老是遇到新詞。</div>
</div>
<div class="cap" data-marpit-fragment="3">
<span class="cap-emoji">✂️</span>
<div class="cap-label"><span class="cap-title">照字塊切</span><span class="cap-sub">Subword</span></div>
<div class="cap-div"></div>
<div class="cap-text">'tokenizer' → ['token', 'izer']，長度與詞表兩邊都顧到。</div>
</div>
</div>


---

<!-- _class: statement -->

# 編號，只是座號 _光看號碼，答得出像不像嗎?_

「貓」是 3711 號、「狗」是 890 號、「桌子」是 12690 號。

只看號碼回答：**哪兩個比較像?**

_號碼只回答「是哪個字」，沒回答「跟哪些字像」。_


---

<!-- _class: statement -->

# 開門之前，先想一想 _一張字的地圖_

聽說有人把幾萬個字，搬進了同一張地圖，每個字有自己的位置。

<div data-marpit-fragment="1">

**照什麼規則排，這張地圖才有用?**

</div>

<div data-marpit-fragment="2">

_想像一下：「貓」隔壁會住誰? 英文的 cat 會住哪裡? 「蘋果」的鄰居又是誰?_

</div>


---

# 換你動手 _語意地圖站_

<div class="station">
<div class="st">
<h4>你要動的旋鈕</h4>

打一個詞去搜，切平面／立體地圖（2D／3D），調 Top K 看誰住它隔壁

</div>
<div class="st">
<h4>試試看</h4>

- 搜「貓」，把鄰居一個個唸出來，跟你剛剛的猜想對一對
- 找 cat：英文字自己住一區，還是就在「貓」隔壁?
- 搜「蘋果」：鄰居真的是水果嗎?

</div>
<div class="st">
<h4>你應該會看到</h4>

有的字擠成一團、有的字離得老遠；擠在一起的字，意思好像都有關係。

</div>
<div class="st check">
<h4>檢核點</h4>

我驗完了自己的三個猜想，還能用一句話說出這張地圖排位置的規則。

</div>
</div>

<span class="chip">🛠 講師畫面／各組電腦已開好 · <a href="https://camp.harrychang.me/embedding">/embedding</a></span>


---

# 你剛剛逛的，是一張字的地圖 _這個做法，叫 embedding_

規則只有一條：**意思像的字，住得近。**

![h:820](../../figures/word_embedding.png)

###### 每個字的位置，其實是一排學出來的數字，像門牌住址；光有座號，做不到這件事

把字變成住址的這個做法，就叫 **embedding**。


---

# 這張地圖，是誰排的? _語意是怎麼學出來的_

沒有人動手排。位置是模型在海量文字上玩「猜字遊戲」玩出來的。

![h:900](../../figures/word2vec_tasks.png)

###### 圖：同一句話的兩種玩法，一種猜被遮住的字，一種猜旁邊的字

能在同一種句子裡互換的字，遊戲玩久了，就會被**搬到隔壁**：貓和狗就是這樣變成鄰居的。


---

# 連「怎麼走」都有意義，偏見一起學進來

![bg cover](../assets/bg/embedding-demo-composed.png)




---

# 文字，就這樣變成數字 _Loop 0 小結_

<div class="caps">
<div class="cap" data-marpit-fragment="1">
<span class="cap-emoji">✂️</span>
<div class="cap-label"><span class="cap-title">切詞成塊</span></div>
<div class="cap-div"></div>
<div class="cap-text">一句話先切成一顆顆 token，才有能處理的單位。</div>
</div>
<div class="cap" data-marpit-fragment="2">
<span class="cap-emoji">🔢</span>
<div class="cap-label"><span class="cap-title">編號無意</span></div>
<div class="cap-div"></div>
<div class="cap-text">光給編號，查得到是哪個字，答不出誰跟誰像。</div>
</div>
<div class="cap" data-marpit-fragment="3">
<span class="cap-emoji">🗺️</span>
<div class="cap-label"><span class="cap-title w5">鄰居即語意</span></div>
<div class="cap-div"></div>
<div class="cap-text">embedding 給每個字一個住址，意思像的字住得近。</div>
</div>
<div class="cap" data-marpit-fragment="4">
<span class="cap-emoji">⚖️</span>
<div class="cap-label"><span class="cap-title">偏見殘留</span></div>
<div class="cap-div"></div>
<div class="cap-text">語料裡藏著的偏見，也會一起被學進字的位置裡。</div>
</div>
</div>


---

<!-- _class: statement -->


# 現在，每個字都是一排數字了

那……**就能餵給上一堂的 MLP 了嗎?**

_MLP：上一堂教的網路，一疊會學習的神經元，把一排數字變成答案_


---

<!-- _class: divider -->
<!-- footer: MLP 吃文字 -->

![bg cover](../assets/bg/divider-02.png)




---

# 早上那顆 MLP，看到的不是「圖」 _先回頭看清楚它拿到什麼_

今天早上，你們親手訓練了一顆 MLP 認 CIFAR-10。

它拿到的不是圖：一張圖先**攤平成 3,072 個數字**，排成一排才餵進去。

_文字也剛剛變成一排數字。先弄清楚：一排數字進去，MLP 到底「看」到什麼?_


---

<!-- _class: statement -->

# 先跟你打個賭 _把每一顆像素都打亂_

把每張圖的 1,024 顆像素全部搬家，**每張圖都照同一張搬家對照表**，訓練和考試都是。

你，還認得嗎?

它，還學得會嗎?



---

# 換你動手 _像素撞牆站_

<div class="station">
<div class="st">
<h4>你要動的旋鈕</h4>

「▶ 訓練」讓兩顆一樣的 MLP 同時開練；「圖片 ‹ ›」換驗證圖；點神經元看它在找的圖案（權重樣板）；按「還原排列 π⁻¹」把像素搬回家

</div>
<div class="st">
<h4>試試看</h4>

- 按「▶ 訓練」，盯著兩條 loss 曲線（錯誤分數，越低越好），等它自己跑完
- 用「圖片 ‹ ›」多換幾張，對照「你看到的」和「模型看到的」
- 按「⏸ 暫停」，點兩邊網路圖上同一顆隱藏神經元，再按「還原排列 π⁻¹」

</div>
<div class="st">
<h4>你應該會看到</h4>

兩條 loss 曲線疊在一起，收在同一個準度，參考曲線終點 **38% 對 38%**；像素搬回家之後，打亂那顆神經元在找的圖案，跟原始那顆長得一樣。

</div>
<div class="st check">
<h4>檢核點</h4>

我看到打亂像素那顆 MLP，學得跟原始那顆一模一樣好。

</div>
</div>

<span class="chip">🛠 講師畫面／各組電腦已開好 · <a href="https://camp.harrychang.me/pixel-shuffle">/pixel-shuffle</a></span>


---

# 你看到的 vs. 它看到的 _同一張圖_

![h:1000](../../figures/pixel_shuffle_pair.png)

###### 圖：站上同一張驗證圖（貓），右邊每顆像素照同一個固定排列 π 搬家，數值一個都沒變

對 MLP，位置只是**編號**；把編號換掉，題目沒變。



---

# 故事 vs. 事故 _換到文字，同一道牆_

圖的排列、句子的詞序，對這種模型都只是編號。

![h:900](../../figures/story_accident_bag.png)

###### 圖：📖 故事 與 💥 事故 是同一袋「故」＋「事」，順序對調，一袋字的模型輸出完全相同

語意天差地遠，它卻 **分不出來**。


---

# 問題不在準度，在假設

準度一分都沒掉：MLP 的設計裡，根本沒有「排列有意義」這個假設。

![h:460](../../figures/bag_vs_seq.png)

###### 圖：詞袋把字丟成一堆（無序）· 序列讓字一個接一個（有序）

我們需要一個 **假設順序有意義** 的架構 → RNN。

_RNN：一次讀一個字、把記憶往後傳的網路，下一節的主角_


---

<!-- _class: statement -->

# 休息 10 分鐘 _喝口水，等等回來拆牆_

10 分鐘後回來，準時開始 RNN。

_實際回來時間由講師現場宣布。_



---

<!-- _class: divider -->
<!-- footer: RNN -->

![bg cover](../assets/bg/divider-03.png)




---

<!-- _class: statement -->

# 先玩個遊戲 _猜下一個字_

## 今天天氣真 **＿＿**

<div data-marpit-fragment="1">

_你腦中大概已經有答案了，可能是：_ 好／熱／冷

</div>

<div data-marpit-fragment="2">

## 今天是夏天，溫度 40 度，今天天氣真 **＿＿**

</div>

<div data-marpit-fragment="3">

_前文一多，答案立刻收斂：_ 熱

</div>


---

# 換你動手 _next-token 站_

<div class="station">
<div class="st">
<h4>你要動的旋鈕</h4>

前文視窗（context）大小：模型能看到最後幾個 token；Temperature／Top-k 是進階旋鈕，好奇再玩

</div>
<div class="st">
<h4>試試看</h4>

- 點預設句「今天天氣真」，看 Qwen3 列出的候選字；再點 40 度的加長版，看「熱」怎麼衝上第一
- 把前文視窗縮到只剩 1~2 個 token，再放寬，看候選字怎麼變
- 找一句「視窗小會押錯、放寬就押對」的話

</div>
<div class="st">
<h4>你應該會看到</h4>

前文看得越多，押得**越有把握**：第一名的把握變大，其他選項縮小。

</div>
<div class="st check">
<h4>檢核點</h4>

我看到前文視窗放寬後，模型把把握集中到更少的字上。

</div>
</div>

<span class="chip">🛠 講師畫面／各組電腦已開好 · <a href="https://camp.harrychang.me/next-token">/next-token</a></span>


---

# 看得越多，越有把握 _可是句子會一直變長_

![h:1000](../../figures/context_accuracy.png)

###### 圖：能看到的前文越長，下一個字押得越有把握（示意圖）

猜下一個字靠前文，可是句子會一直變長，得把前面 **記住** 、一路帶著走。


---

# RNN _一次吃一個字，把記憶往後傳_

![h:960](../../figures/rnn_flow.png)

###### 圖：每讀一個字，更新記憶再傳下去；第一個字的資訊會沿途變淡

每讀一個字，就**更新一次記憶**，再把記憶傳給下一個字。


---

# 讀一個字，更新記憶，傳下去 _同一個網路，重複用四次_

<div style="position:relative; height:900px;">
<div style="position:absolute; left:0; right:0; top:0;">

![h:900](../../figures/rnn_step_1.png)

</div>
<div data-marpit-fragment="1" style="position:absolute; left:0; right:0; top:0;">

![h:900](../../figures/rnn_step_2.png)

</div>
<div data-marpit-fragment="2" style="position:absolute; left:0; right:0; top:0;">

![h:900](../../figures/rnn_step_3.png)

</div>
<div data-marpit-fragment="3" style="position:absolute; left:0; right:0; top:0;">

![h:900](../../figures/rnn_step_4.png)

</div>
</div>

###### 圖：「今天天氣真好」切成四顆 token，一步吃一顆；記憶盒每一步都一樣大

上一步傳出來的記憶，**就是下一步的輸入**。


---

# 換你動手 _RNN 視覺化站_

<div class="station">
<div class="st">
<h4>你要動的旋鈕</h4>

拖曳滑桿逐 token 前進，看記憶（hidden state）一列列填進格子圖；也可自己打一句丟給 GPU 上的 RNN

</div>
<div class="st">
<h4>試試看</h4>

- 點預設句：短句「the cat sat」、長句「the cat sat by the door…」各跑一次
- 盯住底下那條「影響」列，第一個字到句尾還剩多少
- 拖到句尾，看最早的 token 怎麼被逐漸沖淡

</div>
<div class="st">
<h4>你應該會看到</h4>

記憶（hidden state）一格格往後填；句子一長，最早那個 token 在「影響」列幾乎**歸零**。

</div>
<div class="st check">
<h4>檢核點</h4>

我看到長句跑到句尾時，第一個字的資訊幾乎不見了。

</div>
</div>

<span class="chip">🛠 講師畫面／各組電腦已開好 · <a href="https://camp.harrychang.me/rnn-viz">/rnn-viz</a></span>


---

# RNN 撞到的兩道牆 _所以還需要下一個架構_

<div class="cols">
<div>

### 🧠 記憶健忘

_越長越記不住_

![h:460](../../figures/rnn_wall_forget.png)

句子一長，前面的資訊被沖淡，長句記不住開頭。

</div>
<div>

### ⚡ 訓練不穩

_越練越亂跳_

![h:460](../../figures/rnn_wall_unstable.png)

訓練時的糾正得從句尾一站一站傳回句首，站一多，不是越傳越走樣，就是傳到沒聲音。

</div>
</div>

記憶得一站一站傳，那能不能讓每個字 **直接互看** ?


---

<!-- _class: divider -->
<!-- footer: Transformer -->

![bg cover](../assets/bg/divider-04.png)




---

# 換個想法 _不用一站一站傳_

![h:1040](../../figures/rnn_vs_attention.png)

###### 左：RNN 記憶一站一站傳，越傳越淡；右：每個字直接連到所有字

與其接力傳記憶，不如讓每個字直接看所有字，這就是 **attention**（注意力）。

_用這一招疊出來的新架構，名字就叫 Transformer。_


---

# 換你動手 _Transformer 站・attention 連線_

<div class="station">
<div class="st">
<h4>你要動的旋鈕</h4>

滑過**注意力格子圖**，看某個字把多少注意力分給另一個字；再動 Layer（第幾層）× Head（哪一種眼光）換層換頭。

</div>
<div class="st">
<h4>試試看</h4>

- 點預設句「我的媽媽說她很開心」，滑到「她」，亮起來的格子就是它在看誰
- 自己打一句有指代的句子，讓 GPU 跑一次真實 pipeline，再看一次
- 轉 Layer／Head，看不同層、不同頭的關注模式怎麼變

</div>
<div class="st">
<h4>你應該會看到</h4>

每個字直接對整句算注意力，但只看得到自己左邊（右邊還沒出生），相關的字一格就連上，沒有逐站接力。

</div>
<div class="st check">
<h4>檢核點</h4>

我滑到一格，就看到某個字把注意力直接分給了相關的字。

</div>
</div>

<span class="chip">🛠 講師畫面／各組電腦已開好 · <a href="https://camp.harrychang.me/transformer">/transformer</a></span>


---

# 剛剛動的 Head，到底是什麼? _多頭注意力 Multi-head_

![h:740](../../figures/multihead_heads.png)

###### 圖：常見的頭大概長這幾種樣子；真實的頭更亂，找不到個性也正常

一個頭一次只能用一種眼光看「誰看誰」，所以 Transformer 開**好幾個頭，各看各的**，最後再合起來；這件事還疊了很多層，每層都有自己的一組頭。

回站上獵頭：動 Layer × Head，找一個個性最明顯的頭，跟隔壁比誰找到的頭最有戲。


---

# 拼起來，就是 Transformer _這個 Loop 的三塊_

<div class="caps">
<div class="cap" data-marpit-fragment="1">
<span class="cap-emoji">👀</span>
<div class="cap-label"><span class="cap-title">注意機制</span><span class="cap-sub">Attention</span></div>
<div class="cap-div"></div>
<div class="cap-text">每個字直接看到句子裡的所有字，不必逐站傳記憶。</div>
</div>
<div class="cap" data-marpit-fragment="2">
<span class="cap-emoji">🎭</span>
<div class="cap-label"><span class="cap-title">多頭</span><span class="cap-sub">Multi-head</span></div>
<div class="cap-div"></div>
<div class="cap-text">好幾個頭同時看同一句話，各看各的，最後再合起來。</div>
</div>
<div class="cap" data-marpit-fragment="3">
<span class="cap-emoji">🕶️</span>
<div class="cap-label"><span class="cap-title">只看左邊</span><span class="cap-sub">Causal</span></div>
<div class="cap-div"></div>
<div class="cap-text">接龍時右邊的字還沒出生，每個字只看得到自己左邊。</div>
</div>
</div>




---

<!-- _class: divider -->
<!-- footer: 架構即樂高 -->

![bg cover](../assets/bg/divider-05.png)


---

<!-- footer: 架構即樂高 -->

# 三個架構，其實是三個假設 _MLP → RNN → Transformer_

![h:720](../../figures/three_arch_glyphs.png)

<div class="cols3">
<div>

### MLP

沒有任何順序假設，句子在它眼中只是一袋字。

</div>
<div>

### RNN

假設順序有意義，用一份記憶把前文一路帶著走。

</div>
<div>

### Transformer

假設每個字都能直接互看，還開好幾個頭各看各的。

</div>
</div>


---

<!-- _class: statement -->

# 零件拼起來，就是大模型 _銜接第三堂_

切塊、住址、記憶、直接互看，

這些零件拼起來，就是你正在用的大模型。

下一堂，我們拿它來**玩**：LoRA、生成、RL。


---

<!-- _class: sparse -->

# 帶回家的對照表 _今天出現過的名字，每個一句話_

<div class="cols">
<div>

token
_句子先切成的小塊，模型閱讀的單位。_

tokenizer
_負責切塊的工具。_

embedding
_給每個字一個地圖上的住址，意思像的住得近。_

MLP
_上一堂的網路，把一排數字變成答案。_

</div>
<div>

RNN
_一次讀一個字，把記憶往後傳。_

attention
_每個字直接看所有字，決定看誰、看多重。_

multi-head
_好幾個頭各看各的，最後合起來。_

Transformer
_用 attention 疊出來的架構，大模型的骨架。_

</div>
</div>


---

<!-- _class: statement -->
<!-- footer: 附錄 -->

# 附錄 _給想深挖的你_

接下來這幾頁**課堂上不會講**，

是留給想自己深挖的你，回家慢慢看。

<span class="chip">💻 今天所有互動站的程式碼 · <a href="https://github.com/Harrychangtw/sitcon-camp-2026-ml-pt2">github.com/Harrychangtw/sitcon-camp-2026-ml-pt2</a></span>


---

# attention 的盲點 _為什麼需要位置資訊_

![h:960](../../figures/attention_orderblind.png)

###### 圖：把同一堆字打散重排，attention 算出來一模一樣

它對**順序**無感，_就像 Loop 1 的詞袋牆：「故事」和「事故」看起來一樣。_


---

# 補丁一：把順序塞回去 _Positional Embedding_

![h:900](../../figures/pe_stripes.png)

###### 圖：每個字的「詞資訊」加上「第幾個」，一起丟進 attention

attention 分不出誰前誰後，補一塊 **positional embedding** 把「第幾個」塞回去。

_想一想：如果不塞位置資訊，把句子打亂重排，attention 會不會算出一樣的結果?_


---

# 補丁二：給資訊一條捷徑 _Residual Connection_

![h:900](../../figures/residual_skip.png)

###### 圖：捷徑繞過層；沒有它，錯誤分數（loss）亂跳，有它就穩（示意圖）

網路疊得深，訓練就亂跳；補一條 **residual** 給資訊一條捷徑繞過層，訓練就穩。

_圖示：關掉捷徑，深層訓練亂跳；補上捷徑，就穩。_


---

# attention 怎麼決定看誰 _Query · Key · Value_

![h:900](../../figures/qkv_diagram.png)

###### 🔍 Query 我想找什麼　🏷️ Key 每個字的標籤　📦 Value 那個字的內容

一個字的問題對上哪把鑰匙，就多讀那個字的 **內容**。

<span class="chip">🛠 poloclub.github.io/transformer-explainer</span>




