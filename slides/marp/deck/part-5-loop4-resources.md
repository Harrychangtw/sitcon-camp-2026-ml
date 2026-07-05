---
marp: true
theme: camp-dark
paginate: true
footer: 架構即樂高
---

<!-- footer: 架構即樂高 -->

# 三個架構，其實是三個假設 _MLP → RNN → Transformer_

<div class="capsule">

👜 MLP _沒有順序假設_ 句子只是一袋字。

</div>

<div class="capsule">

🔗 RNN _假設順序有意義_ 用記憶一路帶著走。

</div>

<div class="capsule">

👀 Transformer _假設每個字直接互看_ 再補上位置與捷徑。

</div>

<!--
Loop 4 沒有分節頁，是刻意留白的：這一段是整堂的收尾，直接從上一段接進來，
要不要補一張 divider 留給 Harry 決定。

自學備註：三個架構其實是三個對「語言」下的賭注。MLP 沒有順序假設，
把句子當成一袋字，「狗咬人」和「人咬狗」在它眼中是同一袋，
順序資訊在進模型前就消失了。RNN 賭順序有意義，用一個記憶狀態把前面的字
一路帶到後面，但帶得越遠、記憶越淡。Transformer 賭每個字都該直接互看，
用 attention 讓任意兩個字直接連線，再補上位置編碼把順序加回來、
用殘差連接讓深層網路撐得住。

講者備忘：從上到下把三個盒子當成一條線唸過去，整堂課就濃縮在這三個盒子裡。
-->

---

# 零件拼起來，就是大模型 _銜接第三堂_

記憶、直接互看、位置、捷徑。

_這些就是你剛剛親手看過的零件。_

下一堂，我們拿它來**玩**：LoRA、生成、RL。

<!--
自學備註：這一頁的四個關鍵詞就是這堂課親手看過的四個零件：
記憶（RNN）、直接互看（attention）、位置（positional encoding）、捷徑（residual）。
真正在用的大型語言模型，就是把這些同樣的零件疊得更深、規模放得更大而已，
沒有第五種魔法。

講者備忘：唸完四個零件後停一拍，再把「玩」這個 lime 字丟出去，
帶到第三堂：拿這些零件去做 LoRA 微調、文字生成、RL。
-->

---

<!-- footer: Resources -->

# 帶回家的東西 _Resources_

- Next-token 預測的直覺：Brilliant `brilliant.org`
- 點得到的 attention：**Transformer Explainer** `poloclub.github.io/transformer-explainer/`
- 詞向量偏見的原始論文：Bolukbasi et al., 2016 `arXiv:1607.06520`

<!--
自學備註：
- Brilliant（brilliant.org）用互動小遊戲把 next-token 預測的直覺建起來，
  接續 Loop 2 玩過的接字遊戲。
- Transformer Explainer（poloclub.github.io/transformer-explainer/）
  是 Loop 3 那一站的參考視覺化，attention 每一條線都點得到，
  回家值得慢慢重看一次。
- 詞向量偏見的原始論文完整標題是「Man is to Computer Programmer as Woman is
  to Homemaker? Debiasing Word Embeddings」，作者 Bolukbasi, Chang, Zou,
  Saligrama, Kalai，NeurIPS 2016，arXiv:1607.06520，
  就是 Loop 0 講 embedding 偏見時引用的原始來源。
-->
