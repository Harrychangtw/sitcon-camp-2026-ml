<!-- _class: divider -->
<!-- footer: Transformer -->

![bg cover](../assets/bg/divider-04.png)

<!-- ⏱ Loop 3：42 min · hands-on 20（PE/residual 可壓縮，共 −10）-->

<!-- 呼吸拍：Loop 3 進場，問句（能不能讓每個字直接看到所有字）烘在 divider-04.png 藝術裡，沒有 h1；直接回應 Loop 2 收在 RNN 的那道健忘牆。 -->

<!--
講者備忘：先把問題丟出來，讓學生停在「有沒有別條路」的懸念上，別急著給答案，
attention 這個詞留到下一張才揭曉。
自學備註：RNN 靠記憶一站一站往後傳，傳到句子後面就淡了。這裡問的是能不能換個
路子：讓每個字繞過接力，直接看到句子裡所有字。
-->

---

# 換個想法 _不用一站一站傳_

![h:1040](../../figures/rnn_vs_attention.png)

###### 左：RNN 記憶一站一站傳，越傳越淡；右：每個字直接連到所有字

與其接力傳記憶，不如讓每個字直接看所有字，這就是 **attention**。

<!--
講者備忘：一句話講完就好，不要展開任何數學。重點是把「直接連線」取代「逐站
接力」這個畫面種進學生腦裡；用左右對照把上一個 loop 的健忘牆視覺化回收掉。
自學備註：RNN 的記憶沿時間軸一格一格往後搬，越搬越稀薄。attention 換掉這個
接力：句子裡每個字都拉一條線直接看到其他所有字，要參考誰就直接看誰，不必等
記憶慢慢傳過來。這就是 Transformer 的核心想法。
-->

---

# 換你動手 _Transformer 站・attention 連線_

<div class="station">
<div class="st">
<h4>你要動的旋鈕</h4>

點一個字，看它的 **attention** 連到哪些字。

</div>
<div class="st">
<h4>試試看</h4>

- 點句子裡的代名詞，看它連到誰
- 換一句有指代的句子，再點一次
- 換不同的字，看連線怎麼跳

</div>
<div class="st">
<h4>你應該會看到</h4>

相關的字被直接連上，沒有逐站傳遞。

</div>
</div>

<div class="checkpoint">檢核點：我點一個字，就看到它直接連到相關的字</div>

<span class="chip">🛠 講師畫面／各組電腦已開好（URL 開站後補）</span>

<!-- STATION SPEC: Transformer 站：點選任一 token，畫出它到所有 token 的 attention 權重連線（權重以線粗細或不透明度呈現）；同一站另備 PE on/off、residual on/off 兩組開關與一條 loss 曲線（見後兩張）。此站 12 min、hands-on 10。 -->

<!--
講者備忘：開站後就閉嘴，讓學生自己點字玩約 10 分鐘。巡場時提示他們看一件事：
沒有任何「逐站傳遞」在發生，每個字是直接連到相關的字。用代名詞的例子最有感。
自學備註：在 Transformer 站點一個字，畫面會畫出它的 attention 連到哪些字。多換
幾個字，觀察連線怎麼跳；相關的字通常會被直接連上，而不是繞一大圈接力過來。
-->

---

# attention 的盲點 _下一道牆_

![h:960](../../figures/attention_orderblind.png)

###### 圖：把同一堆字打散重排，attention 算出來一模一樣

它對**順序**無感，_就像 Loop 1 的詞袋牆：「故事」和「事故」看起來一樣。_

<!--
講者備忘：先肯定 attention 補好了健忘（每個字都看得到所有字），再翻面點出它的
盲點，帶出下一道牆。可以讓學生先猜：把句子重排，輸出會不會變。
自學備註：attention 只在意「哪些字彼此相關」，不在意「字排在第幾個」。所以把
同一堆字打散重排，它算出來的結果一模一樣。這其實是 Loop 1 詞袋牆在更高一層的
翻版，也是接下來 positional embedding 要補的洞。
-->

---

# 補丁一：把順序塞回去 _Positional Embedding_

![h:900](../../figures/pe_stripes.png)

###### 圖：每個字的「詞資訊」加上「第幾個」，一起丟進 attention

attention 分不出誰前誰後，補一塊 **positional embedding** 把「第幾個」塞回去。

_動手：關掉 PE、打亂順序，看輸出變不變。_

<!-- 可壓縮 -->

<!-- STATION SPEC: Transformer 站：PE on/off 開關 + 順序打亂鈕；PE 開時打亂順序輸出會變，PE 關時打亂輸出不變。 -->

<!--
講者備忘：這是可壓縮段的第一塊，時間夠才鋪。重點放在「補一塊把位置塞回去」的
直覺，全程不碰公式。動手驗證讓「順序真的被塞回去了」變成學生自己看到的事。
自學備註：attention 看得到所有字，卻分不出誰在前、誰在後。positional embedding
補的就是這塊：把「第幾個」這個位置資訊塞回每個字裡。PE 開著把順序打亂、輸出
會跟著變；PE 關掉再打亂、輸出卻不變，證明順序資訊真的被塞回去了。
-->

---

# 補丁二：給資訊一條捷徑 _Residual Connection_

![h:900](../../figures/residual_skip.png)

###### 圖：捷徑繞過層；沒有它 loss 亂跳，有它就穩（示意圖）

疊深之後 loss 亂跳，補一條 **residual** 給資訊一條捷徑繞過層，訓練就穩。

_動手：切換 residual on/off，看 loss 穩不穩。_

<!-- 可壓縮 -->

<!-- STATION SPEC: Transformer 站：residual on/off 開關 + 訓練 loss 曲線；關掉時 loss 亂跳、開起來就穩。曲線可播放預算好的 loss 紀錄，瀏覽器不訓練。 -->

<!--
講者備忘：可壓縮段的第二塊，和 PE 那張同進退。重點是「疊深會壞、捷徑救回」的
因果，用站上的 loss 曲線當證據。圖裡的曲線是示意圖，別報數字。
自學備註：想讓模型更聰明，直覺是把層疊更深，但疊深之後訓練變得不穩，loss 亂跳。
residual 補一條捷徑讓資訊繞過層，訓練就穩下來。站上的證據是 loss 曲線：關掉
residual 時 loss 亂跳，開起來就穩，深層也訓練得動。
-->

---

# attention 怎麼決定看誰 _Query · Key · Value_

![h:900](../../figures/qkv_diagram.png)

###### 🔍 Query 我想找什麼　🏷️ Key 每個字的標籤　📦 Value 那個字的內容

一個字的問題對上哪把鑰匙，就多讀那個字的 **內容**。

<span class="chip">🛠 poloclub.github.io/transformer-explainer</span>

<!-- ASSET TODO: placeholder_transformer_explainer.png：poloclub.github.io/transformer-explainer，滑鼠停在一個 token 上顯示它連到其他字的 attention 線；此張以 qkv_diagram 為主視覺、chip 帶連結，未內嵌圖（避免溢出），開站時可改連 explainer 現場演示。 -->

<!--
講者備忘：QKV 一定要留，砍掉的話 attention 到底怎麼決定看誰就沒解釋了。保持
直覺版比喻：Query 是問題、Key 是標籤（鑰匙）、Value 是內容，全程不寫任何公式。
時間夠可直接開 transformer-explainer 現場點一個字給大家看。
自學備註：每個字都發出一個 Query（我想找什麼），也帶著一個 Key（自己的標籤）。
attention 拿一個字的 Query 去比對每個字的 Key，對得越上，就越多去讀那個字的
Value（內容）。到 transformer-explainer 上看一個字的 Query 被拿去跟每個字的 Key
比對，比對越合、分到的注意力越多。
-->

---

# 拼起來，就是 Transformer _attention ＋ 三塊補丁_

<div class="caps">
<div class="cap">
<span class="cap-emoji">👀</span>
<div class="cap-label"><span class="cap-title">注意機制</span><span class="cap-sub">Attention</span></div>
<div class="cap-div"></div>
<div class="cap-text">每個字直接看所有字，不必逐站傳記憶。</div>
</div>
<div class="cap">
<span class="cap-emoji">📍</span>
<div class="cap-label"><span class="cap-title w5">位置編碼</span><span class="cap-sub sm">Positional Embedding</span></div>
<div class="cap-div"></div>
<div class="cap-text">把「第幾個」塞回去，補上順序。</div>
</div>
<div class="cap">
<span class="cap-emoji">🔗</span>
<div class="cap-label"><span class="cap-title w5">殘差連接</span><span class="cap-sub sm">Residual Connection</span></div>
<div class="cap-div"></div>
<div class="cap-text">給資訊一條捷徑繞過層，訓練更穩。</div>
</div>
<div class="cap">
<span class="cap-emoji">🔑</span>
<div class="cap-label"><span class="cap-title en">Q／K／V</span><span class="cap-sub sm">Query · Key · Value</span></div>
<div class="cap-div"></div>
<div class="cap-text">問題對上鑰匙，決定注意力看誰。</div>
</div>
</div>

<!--
講者備忘：收束用，把整個 Loop 3 拼回一張圖：一個機制（attention）加三塊補丁
（PE、residual、QKV）。收尾一句話預告 Loop 4：會把 MLP → RNN → Transformer
串成一條演進線，再帶到第三堂能拿這些零件玩什麼。
自學備註：Transformer 不是憑空的魔法，而是這幾塊拼起來的：attention 讓每個字
直接看所有字、positional embedding 補回順序、residual 讓深層訓練得穩、Q/K/V
決定注意力看誰。下一個 loop 會把這三種架構放在同一條演進線上看。
-->
