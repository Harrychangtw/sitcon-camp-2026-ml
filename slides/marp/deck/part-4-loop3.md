---
marp: true
theme: camp-dark
paginate: true
footer: Transformer
---

<!-- _class: divider -->
<!-- footer: Transformer -->

## Section 04.

# 能不能讓每個字，直接看到所有字?

<!--
講者備忘：這張是 Loop 3 的進場，直接回應上一個 loop 收在 RNN 的那道健忘牆。
先把問題丟出來，讓學生停在「有沒有別條路」的懸念上，別急著給答案；
attention 這個詞留到下一張才揭曉。
自學備註：RNN 靠記憶一站一站往後傳，傳到句子後面就淡了。這裡問的是
能不能換個路子：讓每個字繞過接力，直接看到句子裡所有字。
-->

---

# 不用一站一站傳 _解法切入_

RNN 的記憶，越傳越淡。

換個想法：每個字，直接看所有字。這就是 **attention**。

<!--
講者備忘：一句話講完就好，不要展開任何數學。重點是把「直接連線」取代
「逐站接力」這個畫面種進學生腦裡。
自學備註：RNN 的記憶沿著時間軸一格一格往後搬，越搬越稀薄。attention
換掉這個接力：句子裡每個字都拉一條線直接看到其他所有字，要參考誰就
直接看誰，不必等記憶慢慢傳過來。這就是 Transformer 的核心想法。
-->

---

# 換你動手 _Transformer 站・attention 連線_

點一個字，看它的 **attention** 連到哪些字：

- 換不同的字，看連線怎麼跳
- 注意：相關的字，是不是直接連上了?

<span class="chip">🛠 apps/course2 · Transformer 站</span>

<!-- 站截圖 TBD：Transformer 站 attention 連線視圖，放在下半版。 -->

<!--
講者備忘：開站後就閉嘴，讓學生自己點字玩。巡場時提示他們看一件事：
沒有任何「逐站傳遞」在發生，每個字是直接連到相關的字。
自學備註：在 Transformer 站點一個字，畫面會畫出它的 attention 連到哪些字。
多換幾個字，觀察連線怎麼跳；相關的字通常會被直接連上，而不是繞一大圈
接力過來。
-->

---

# attention 的盲點 _下一道牆_

健忘解決了：每個字都看得到所有字。

但它對**順序**無感。

_把句子打散重排，attention 算出來一模一樣。_

<!--
講者備忘：先肯定 attention 補好了健忘，再翻面點出它的盲點，帶出下一道牆。
可以讓學生先猜：把句子重排，輸出會不會變。
自學備註：attention 只在意「哪些字彼此相關」，不在意「字排在第幾個」。
所以把同一堆字打散重排，它算出來的結果一模一樣。這其實是 Loop 1 詞袋牆
在更高一層的翻版，也是接下來 positional embedding 要補的洞。
-->

---

# 補丁一：把順序塞回去 _Positional Embedding_

attention 分不出誰在前、誰在後。

補一塊 **positional embedding**：把「第幾個」塞回去。

_動手：關掉 PE、打亂順序，看輸出變不變。_

<!--
可壓縮：時間緊時，本張與下一張（residual）先砍（course-spec 明示可略）。
講者備忘：這是可壓縮段的第一塊，時間夠才鋪。重點放在「補一塊把位置塞回去」
的直覺，不要碰任何公式。
自學備註：attention 看得到所有字，卻分不出誰在前、誰在後。positional
embedding 補的就是這塊：把「第幾個」這個位置資訊塞回每個字裡。動手驗證時，
PE 開著把順序打亂、輸出會跟著變；PE 關掉再打亂、輸出卻不變，證明順序資訊
真的被塞回去了。
-->

---

# 補丁二：給資訊一條捷徑 _Residual Connection_

想更聰明就疊更深，但疊深之後 loss 亂跳。

補一條 **residual**：捷徑繞過層，訓練穩下來。

_動手：切 residual on/off，看 loss 穩不穩。_

<!--
可壓縮：時間緊時，本張與上一張（PE）一起砍（course-spec 明示可略）。
講者備忘：可壓縮段的第二塊，和 PE 那張同進退。重點是「疊深會壞、捷徑救回」
的因果，用站上的 loss 曲線當證據。
自學備註：想讓模型更聰明，直覺是把層疊更深，但疊深之後訓練變得不穩，
loss 亂跳。residual 補一條捷徑讓資訊繞過層，訓練就穩下來。站上的證據是
loss 曲線：關掉 residual 時 loss 亂跳，開起來就穩，深層也訓練得動。
-->

---

# attention 怎麼決定看誰 _Query · Key · Value_

<div class="capsule">

🔍 **Query** _我想找什麼_ 每個字發出的問題。

</div>

<div class="capsule">

🏷️ **Key** _每個字的標籤_ 拿 Query 來比對的那把鑰匙。

</div>

<div class="capsule">

📦 **Value** _內容_ 對得越上，越多讀這個字的內容。

</div>

<span class="chip">🛠 poloclub.github.io/transformer-explainer</span>

<!--
講者備忘：QKV 一定要留，砍掉的話 attention 到底怎麼決定看誰就沒解釋了。
保持直覺版比喻：Query 是問題、Key 是標籤（鑰匙）、Value 是內容，
全程不要寫任何公式。
自學備註：每個字都發出一個 Query（我想找什麼），也帶著一個 Key（自己的標籤）。
attention 拿一個字的 Query 去比對每個字的 Key，對得越上，就越多去讀那個字的
Value（內容）。到 transformer-explainer 上看一個字的 Query 被拿去跟每個字的
Key 比對，比對越合、分到的注意力越多。
-->

---

# Transformer 就是這幾塊拼起來 _Loop 3 回顧_

- **attention**：每個字直接看所有字，不必逐站傳記憶
- Positional Embedding：把「第幾個」塞回去
- Residual：捷徑繞過層，訓練穩
- Q / K / V：問題對上標籤，決定看誰

<!--
講者備忘：收束用，把整個 Loop 3 拼回一張圖：一個機制（attention）加三塊
補丁（PE、residual、QKV）。收尾一句話預告 Loop 4 會把 MLP → RNN →
Transformer 串成一條線。
自學備註：Transformer 不是憑空的魔法，而是這幾塊拼起來的：attention 讓每個
字直接看所有字、positional embedding 補回順序、residual 讓深層訓練得穩、
Q/K/V 決定注意力看誰。下一個 loop 會把這三種架構放在同一條演進線上看。
-->
