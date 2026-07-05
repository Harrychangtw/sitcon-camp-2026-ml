<!-- _class: divider -->
<!-- footer: 架構即樂高 -->
<!-- ⏱ Loop 4：10 min · 收尾 -->

![bg cover](../assets/bg/divider-05.png)

<!-- 分節文字（Section 05. + 問句「這些零件，能拼出什麼?」）都烘在 divider-05.png 裡。 -->

---

<!-- footer: 架構即樂高 -->

# 三個架構，其實是三個假設 _MLP → RNN → Transformer_

![h:640](../../figures/three_arch_glyphs.png)

<div class="cols3">
<div>

### MLP

沒有順序假設，句子只是一袋字。

</div>
<div>

### RNN

假設順序有意義，用記憶一路帶著走。

</div>
<div>

### Transformer

假設每個字直接互看，再補上位置與捷徑。

</div>
</div>

<!--
Loop 4（Section 05）由 divider-05 分節頁帶進來，是整堂的收尾，從上一段接下去。

自學備註：三個架構其實是三個對「語言」下的賭注。MLP 沒有順序假設，
把句子當成一袋字，「狗咬人」和「人咬狗」在它眼中是同一袋，
順序資訊在進模型前就消失了。RNN 賭順序有意義，用一個記憶狀態把前面的字
一路帶到後面，但帶得越遠、記憶越淡。Transformer 賭每個字都該直接互看，
用 attention 讓任意兩個字直接連線，再補上位置編碼把順序加回來、
用殘差連接讓深層網路撐得住。

講者備忘：照著上面的圖從左唸到右，一袋字 → 記憶接力 → 直接互看，
整堂課就濃縮在這一條線裡；三個盒子 = 三個假設，先不點 lime，把亮點留給下一頁。
-->

---

<!-- _class: statement -->
<!-- 呼吸拍：final CTA，收尾亮點，不加視覺 -->

# 零件拼起來，就是大模型 _銜接第三堂_

記憶、直接互看、位置、捷徑，

這些零件拼起來，就是你正在用的大模型。

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

<div class="cols">
<div>

### 延伸互動

![h:300](../../figures/placeholder_brilliant_nexttoken.png)

Brilliant · next-token 直覺 · `brilliant.org`

![h:300](../../figures/placeholder_transformer_explainer.png)

Transformer Explainer · 點得到的 attention · `poloclub.github.io/transformer-explainer/`

</div>
<div>

### 相關文獻

[Man is to Computer Programmer as Woman is to Homemaker? Debiasing Word Embeddings](https://arxiv.org/abs/1607.06520)

_Bolukbasi, Chang, Zou, Saligrama, Kalai · NeurIPS 2016 · arXiv:1607.06520_

</div>
</div>

<!-- ASSET TODO: placeholder_brilliant_nexttoken.png — brilliant.org 截圖：next-token 互動課，模型逐字接龍、候選字機率條的畫面 -->
<!-- ASSET TODO: placeholder_transformer_explainer.png — poloclub.github.io/transformer-explainer 截圖：attention 視圖，滑鼠停在一個 token 上，顯示它連到其他字的線 -->

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
