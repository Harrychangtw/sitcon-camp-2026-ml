---
marp: true
theme: camp-dark
paginate: true
footer: Cover
---

<!-- _class: cover -->

<!--
封面：文字（課名、講者、日期）全部畫在 Affinity 母片 assets/bg/cover.png 裡，
投影片面保持空白。這頁只驗證 cover 母片的掛載與 placeholder。
-->

---

<!-- _class: toc -->
<!-- footer: Outline -->

<!--
大綱：同 cover，文字在 assets/bg/toc.png 裡，投影片面留空。
-->

---

<!-- _class: divider -->
<!-- footer: 文字怎麼變數字 -->

## Section 01.

# 電腦怎麼「讀」文字？

<!--
分節頁：Affinity 滿版底圖 + Marp 疊上灰色 kicker 與白色問句。
講者備忘寫在這種註解裡，不上投影片。
-->

---

# 詞是怎麼變成數字的 _Tokenizer 與 Embedding_

模型看不到文字，只看得到數字。

第一步，先把句子**切成 token**，再把每個 token 變成一串數字。

_這一頁是 title + body 原型：一個想法、幾行短句。_

<!--
workhorse 原型。連接性的解釋放這裡：為什麼要先切再編碼、
和上一頁的問句怎麼接。投影片面保持極簡。
-->

---

# 兩行標題的情況：這一行故意寫得很長，用來驗證標題帶的高度上限

內文從固定的位置開始，不會被標題推下去。

---

# 你應該注意的三件事 _List 原型_

- 中文和英文的切法**不一樣**
- 常見詞是一顆 token，罕見詞會被切碎
- token 數量就是你付的錢

<!--
清單原型：每點一行、關鍵字優先。lime 一頁最多出現在一個重點上。
-->

---

# 有順序 vs. 沒順序 _Contrast pair 原型_

<div class="cols">
<div>

### 詞袋 MLP

把整句**攪在一起**再看。

_「狗咬人」和「人咬狗」長一樣。_

</div>
<div>

### RNN

一個字一個字**照順序**讀。

_讀到後面，還記得前面。_

</div>
</div>

<!--
對比原型：先看差異、再給定義。兩欄各自維持白灰兩層。
-->

---

# 讓模型接下一個字 _Code 原型_

```python
tokens = tokenizer.encode("今天天氣真")
logits = model(tokens)          # 每個候選字一個分數
next_id = logits.argmax()      # 挑分數最高的
```

輸出的不是答案，是**每個字的機率**。

<!--
code 原型：Fira Code、負字距。指令、設定、token 序列都用這個。
-->

---

# 每個詞都是空間裡的一個點 _Figure 原型_

![h:1150](../../figures/word_embedding.png)

###### 圖：詞向量把「意思相近」變成「距離相近」

<!--
figure 原型:圖直接來自 slides/figures/（深色、透明底、on-palette）。
圖說用 h6。
-->

---

# 換你動手 _Tokenizer 探索站_

丟三句話進去，觀察它怎麼切：

- 一句全中文、一句全英文、一句混著寫
- 找一個會被**切碎**的詞

<span class="chip">🛠 apps/course2 · Tokenizer 站</span>

<!--
station hand-off 原型：教學發生在工具裡，投影片只負責把問題丟出去。
帶學生開站後就閉嘴，讓他們玩。
-->

---

# 帶回家的東西 _Resources_

- 課程互動站：<code>camp.sitcon.org/ml</code>
- 今天的投影片與程式碼：<code>github.com/sitcon-tw</code>
- 想更深入：**3Blue1Brown 的 Transformer 系列**

<!--
resources 原型：連結優先，每條一行。
-->

---

# 可選的膠囊 _Capsule（非預設）_

<div class="capsule">

💡 **殘差連接** _Residual_ 讓深層網路記得原本的輸入。

</div>

<div class="capsule">

📏 位置編碼 _Positional Encoding_ 把「第幾個字」加回向量裡。

</div>

<!--
capsule 是可用元件、不是骨架：只有內容真的需要卡片時才用。
-->
