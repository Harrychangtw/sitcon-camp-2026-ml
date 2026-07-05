<!-- _class: cover -->

<!--
封面文字（課名、講者、日期）都在 assets/bg/cover.png 裡。
給 Harry 的 Affinity 排版意圖：
- Title L1（白）：機器，是怎麼讀懂一句話的?
- Title L2（灰）：從 MLP 到 Transformer 的演進
- Meta：Harry 張祺煒 · SITCON Camp 2026｜ML · 2026-07-10
-->

---

<!-- footer: Outline -->

# 這堂課要回答的五個問題 _Outline_

<div class="cols3">
<div>

### _01_ 文字怎麼變數字?

- _Tokenizer 切詞_
- _Embedding 語意_

</div>
<div>

### _02_ 直接餵給 MLP 會怎樣?

- _bag-of-embeddings_
- _順序撞牆站_

</div>
<div>

### _03_ 怎麼把「順序」吃進去?

- _next-token 站_
- _RNN 的兩道牆_

</div>
</div>

<div class="cols">
<div>

### _04_ 能不能讓每個字直接互看?

- _attention_
- _PE、residual、QKV_

</div>
<div>

### _05_ 這些零件能拼出什麼?

- _三架構一條線_
- _銜接第三堂_

</div>
</div>

<!--
講者備忘：一頁把整堂的路線圖交代完，五個問題就是五個 Loop 的進場問句，之後每個 divider 會再單獨丟一次。這頁講快一點，讓學生知道「今天會從切字一路走到 Transformer」，不用細講每個子項。
自學備註：舊版大綱是烘進 assets/bg/toc.png 的靜態圖，頁碼已過期，因此改用 Markdown 重建，五組問句對應五個 Loop，子項是各 Loop 會經過的站與重點；Marp 會自動編頁碼，這裡刻意不寫頁碼。
-->

---

<!-- _class: divider -->
<!-- footer: 文字怎麼變數字 -->

![bg cover](../assets/bg/divider-01.png)

<!-- 分節文字（Section 01. + 問句「文字，怎麼變成數字?」）都烘在 divider-01.png 裡。 -->

<!-- ⏱ Loop 0：42 min · hands-on 18 -->

<!--
講者備忘：這是 Loop 0 的進場。整個 Loop 一句話講完：先用 tokenizer 把句子切成 token，再用 embedding 把 token 變成有語意的數字，最後用 bias 例子收尾。這頁只丟問題，不給答案。
自學備註：這一節要回答的核心問題就是標題這句「文字怎麼變成數字」。模型內部只有數字，任何文字任務的第一步都是把字變成一排數字。接下來會依序拆解：tokenizer（切）、embedding（編碼與語意）、以及語意裡藏著的偏見。
-->

---

# 上一堂的模型，看不懂字 _模型只吃數字，這堂的輸入卻是一句話_

<div class="cols">
<div>

### 上一堂

餵進去的是一排數字。

`[5.1, 3.5, 1.4, 0.2]`

_花瓣長度、寬度，本來就是數字。_

</div>
<div>

### 這堂

餵進去的是**一句話**。

「今天天氣真好」

_模型看不懂字，得先把字變成數字。_

</div>
</div>

<!--
講者備忘：先點出落差再帶工具。問學生：上一堂餵的是一排數字，這堂想餵一句話，中間差了什麼? 讓他們自己說出「文字要先變成數字」。左邊放上一堂鳶尾花那種數值特徵向量，右邊放一句真的中文，對比才具體。
自學備註：上一堂 MLP 吃的是數值特徵（例如花瓣長寬），這堂的輸入卻是自然語言。這中間的鴻溝就是 Loop 0 要補的：把一句話轉成模型能吃的數字。這頁只負責把牆立起來，怎麼跨過去留給後面的站。
-->

---

# 換你動手 _Tokenizer 探索站_

<div class="station">
<div class="st">
<h4>你要動的旋鈕</h4>

輸入文字 → 看它切出來的 **token** 與 id

</div>
<div class="st">
<h4>試試看</h4>

- 中英混寫：「我今天很 happy」
- 標點與空格：「你好！！！」
- 罕見詞／自己的名字：「祺煒」

</div>
<div class="st">
<h4>你應該會看到</h4>

一個「字」常被拆成好幾塊，切法不直覺。

</div>
</div>

<div class="checkpoint">檢核點：我看到同一個字，換個位置或語言就被切成不同塊</div>

<span class="chip">🛠 講師畫面／各組電腦已開好（URL 開站後補）</span>

<!-- STATION SPEC: Tokenizer 探索站 must accept free-text input (中英混寫、標點、空格、任意罕見詞／人名), and for that input display BOTH the coloured token segmentation and the numeric token id array live. -->

<!--
講者備忘：本站 10 分鐘，其中 8 分鐘放手讓學生玩，教學發生在工具裡不在這頁。開站後閉嘴，巡場時丟提示：空格和大小寫也算數、罕見字會被切得很碎、同一個詞在句首句中切法可能不同。
自學備註：tokenizer 是把原始文字切成一顆顆 token 的規則。重點是切法不直覺：一個中文「字」常被拆成好幾塊，英文長詞也會被拆成字塊。動手換不同輸入，就能親眼看到「模型讀到的單位」和「你以為的字」不一樣。
-->

---

# 模型眼中，只有 Token 和編號

<div class="cols">
<div>

### Text 視角

![h:820](../../figures/placeholder_tokenizer_text.png)

###### 彩色切塊：一句話被切成一顆顆 token

</div>
<div>

### Token IDs 視角

![h:820](../../figures/placeholder_tokenizer_ids.png)

###### 每顆 token 一個編號，是座號不是語意

</div>
</div>

所以在模型眼中，只有 **token** 和它的編號。

<!-- ASSET TODO: placeholder_tokenizer_text.png — platform.openai.com/tokenizer，輸入「今天天氣真好 I am happy」，切到 Text 視角（彩色切塊），截整個切塊區。 -->
<!-- ASSET TODO: placeholder_tokenizer_ids.png — 同一頁同一句，切到 Token IDs 視角，截出 id 陣列。 -->

<!--
講者備忘：強調左右是「同一句話」的兩種視角。追問：這些編號有大小關係嗎? 37271 比 2574「大」代表什麼嗎? 引導出答案：不代表任何東西，只是查表用的座號。
自學備註：token 的 id 只是一個編號，不是語意。id 相鄰不代表意思相近，id 大小也沒有意義，它純粹是「在詞表裡的第幾格」。正因為編號本身沒有語意，才需要下一步的 one-hot 與 embedding，把「編號」變成「有意義的數字」。
-->

---

# 細與多的折衷 _為什麼切成這樣?_

<div class="caps">
<div class="cap">
<span class="cap-emoji">⧉</span>
<div class="cap-label"><span class="cap-title">照字母切</span><span class="cap-sub">Character-level</span></div>
<div class="cap-div"></div>
<div class="cap-text">'hello' → ['h', 'e', 'l', 'l', 'o']，切最細，一句話變超長。</div>
</div>
<div class="cap">
<span class="cap-emoji">📚</span>
<div class="cap-label"><span class="cap-title">照整詞切</span><span class="cap-sub">Word-level</span></div>
<div class="cap-div"></div>
<div class="cap-text">'祺煒' → [UNK]，詞表爆炸，還老是遇到新詞。</div>
</div>
<div class="cap">
<span class="cap-emoji">✂️</span>
<div class="cap-label"><span class="cap-title">照字塊切</span><span class="cap-sub">Subword</span></div>
<div class="cap-div"></div>
<div class="cap-text">'tokenizer' → ['token', 'izer']，長度與詞表兩邊都顧到。</div>
</div>
</div>

<!--
講者備忘：只講動機，不講 BPE 或歷史。三個膠囊都是先給例子再解釋。'祺煒' 是真的會 OOV 的人名，可以問在場同學：你的名字丟進去會不會也變成 [UNK]? 讓折衷感更具體。
自學備註：為什麼不照字母、也不照整詞? 照字母切，序列會變超長，模型很難讀完；照整詞切，詞表會爆炸，而且永遠有沒收錄過的新詞變成 [UNK]。subword 取中間：常用字整塊、罕見字拆成字塊，長度和詞表大小兩邊都顧到，這就是現在主流 tokenizer 的做法。
-->

---

# 從編號到有語意的數字 _One-hot vs Embedding_

<div class="cols">
<div>

### One-hot

![h:900](../../figures/onehot_encoding.png)

###### 跟字典一樣長，兩兩等距，看不出語意（這就是牆）

</div>
<div>

### Embedding

![h:900](../../figures/word_embedding.png)

###### 壓短、變密，位置是**從資料學**出來的（這是解法）

</div>
</div>

<!--
講者備忘：左邊是牆，右邊是解法，一頁對照完。指著左圖問：這樣編碼，「貓」和「狗」的距離，跟「貓」和「桌子」的距離一樣嗎? 答案是一樣，這就是問題。右圖不寫公式，重點一句：語意 = 學出來的位置。
自學備註：one-hot 把每個 token 變成一排 0，只有自己那格是 1，向量長度等於整個詞表，又長又稀疏，且任兩個向量都互相垂直、距離相等，看不出語意。embedding 用一張可學習的表，把 token 對應到一排較短較密的數字，這些數字是模型從語料學出來的，結果是語意相近的字位置也相近。
-->

---

# 換你動手 _Embedding 探索站_

<div class="station">
<div class="st">
<h4>你要動的旋鈕</h4>

在 embedding space 2D／3D 投影裡逛，挑字看最近鄰

</div>
<div class="st">
<h4>試試看</h4>

- 挑「貓」，看它的鄰居是誰
- 比一比「國王」和「皇后」
- 自己挑一個字，猜再看

</div>
<div class="st">
<h4>你應該會看到</h4>

語意相近的字，在空間裡的距離也近。

</div>
</div>

<div class="checkpoint">檢核點：我挑的字，最近的鄰居語意也相近</div>

<span class="chip">🛠 講師畫面／各組電腦已開好（URL 開站後補）</span>

<!-- STATION SPEC: Embedding 探索站 must render a 2D/3D projection of the embedding space, let the student select any word to highlight it, and list that word's nearest neighbours (cosine/euclidean) so「距離即語意」is directly observable. -->

<!--
講者備忘：本站 12 分鐘，其中 10 分鐘放手玩。教學發生在站上，別在這頁講解。巡場時建議學生試 貓／狗、國王／皇后 這類配對，看它們是不是真的靠在一起，讓他們自己逛出「距離即語意」的感覺。
自學備註：上一頁說 embedding 把語意壓進位置，這一站就是去驗證它。挑一個字看它的最近鄰，你會發現鄰居多半語意相關（貓的鄰居可能是狗、貓咪、寵物），這說明「語意」在這個空間裡是以「距離」呈現的。
-->

---

# 方向也有意義 _連偏見一起學進來_

<div class="cols">
<div>

### 最近鄰 _recap_

![h:500](../../figures/placeholder_projector_neighbors.png)

###### 語意相近 → 位置相近

</div>
<div>

### 方向類比

![h:300](../../figures/placeholder_projector_tense.png)

![h:300](../../figures/placeholder_projector_royal.png)

`king − man + woman ≈ queen`

</div>
</div>

方向是從語料學來的：embedding 學到語意，也學到 **偏見**。

_Bolukbasi et al., 2016 · arXiv 1607.06520_

<!-- ASSET TODO: placeholder_projector_neighbors.png — projector.tensorflow.org，選「cat」，截 Nearest points 面板（含 neighbors 滑桿與 cosine/euclidean 切換）。 -->
<!-- ASSET TODO: placeholder_projector_tense.png — projector 3D 投影，時態類比 walking→walked || swimming→swam，兩條平行位移。 -->
<!-- ASSET TODO: placeholder_projector_royal.png — projector 3D 投影，性別／皇室類比 man→king || woman→queen，兩條平行位移。 -->

<!--
講者備忘：這是 Embedding 站的 debrief。左邊是學生剛玩過的最近鄰 recap，右邊兩張是站上沒有的新內容、教學重量在這裡：同一種語意變化（變過去式、加上皇室）在空間裡是同一個平移向量。可以現場帶一次 king 減 man 加 woman，讓學生猜結果落在哪。接著推一步：換個詞做同樣算術就會跑出刻板連結，這就是語料偏見。
自學備註：embedding 空間裡向量的方向也帶語意，從 man 到 king 的位移和從 woman 到 queen 幾乎平行，所以 king 減 man 加 woman 會落在 queen 附近。既然方向是從語料學來的，語料裡的偏見也一起被學進向量。Bolukbasi 等人 2016 年的論文示範了同樣的類比算術會得到帶刻板印象的結果，提醒我們 embedding 好的壞的一起學。
-->

---

# 文字，就這樣變成數字 _Loop 0 小結_

<div class="caps">
<div class="cap">
<span class="cap-emoji">✂️</span>
<div class="cap-label"><span class="cap-title">切詞成塊</span></div>
<div class="cap-div"></div>
<div class="cap-text">一句話先切成 subword，才有能處理的單位。</div>
</div>
<div class="cap">
<span class="cap-emoji">🔢</span>
<div class="cap-label"><span class="cap-title">編號無意</span></div>
<div class="cap-div"></div>
<div class="cap-text">one-hot 只給編號，字和字之間距離都一樣。</div>
</div>
<div class="cap">
<span class="cap-emoji">🧭</span>
<div class="cap-label"><span class="cap-title w5">距離即語意</span></div>
<div class="cap-div"></div>
<div class="cap-text">embedding 讓語意相近的字自然靠在一起。</div>
</div>
<div class="cap">
<span class="cap-emoji">⚖️</span>
<div class="cap-label"><span class="cap-title">偏見殘留</span></div>
<div class="cap-div"></div>
<div class="cap-text">語料裡的偏見，也一起被學進向量。</div>
</div>
</div>

<!--
講者備忘：四個膠囊對到 Loop 0 的四個節拍：斷詞、one-hot、embedding 距離、bias。這頁刻意不放 lime，把唯一的強調留給下一頁的橋接問句。快速帶過，當作進 Loop 1 前的整理。
自學備註：回顧整個 Loop 0。文字先被 tokenizer 切成 subword，成為能處理的單位；one-hot 只是給編號，看不出語意；embedding 把語意壓成位置，讓距離和方向都有意義；但語料裡的偏見也一起被學進向量。四步走完，一句話就變成了一排排有語意的數字。
-->

---

<!-- _class: statement -->

<!-- 呼吸拍：Loop 0→1 cliffhanger，故意懸念收尾，不加視覺 -->

# 現在，每個字都是一排數字了

那……**就能餵給上一堂的 MLP 了嗎?**

<!--
講者備忘：這是 cliffhanger，故意不回答。丟出問句就停，讓懸念帶進 Loop 1。學生若搶答「可以」，先不評論，下一個 Loop 會讓他們自己撞到順序的牆。
自學備註：每個字現在都是一排數字了，看起來就能直接餵給上一堂學過的 MLP。真的可以嗎? 這個開放問題正是 Loop 1 的起點，答案留到下一節揭曉。
-->
