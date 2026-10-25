---
layout: post
title: "Receiver-Conditioned Latent Communication gives 94% CacheBack"
title_prefix: "Receiver-Conditioned Latent Communication gives"
title_accent: "94% CacheBack"
date: 2026-10-23
categories: [general]
authors:
  - name: "Maximillian Rossi"
  - name: "Prajwal Raghunath"
  - name: "Haoqing Xuan"
  - name: "Yusen Zhang"
  - name: "Eugene Wu"
excerpt: "CacheBack uses the receiver’s query to select which sender positions to communicate."
slug: cacheback
published: false
noindex: true
article_class: cacheback-article
custom_body: true
math: false
post_css:
  - /files/css/blog/cacheback.css
post_js:
  - /files/js/blog/cacheback/question-trace.js
  - /files/js/blog/cacheback/article.js
  - /files/js/blog/cacheback/figures.js
  - /files/js/blog/cacheback/communication.js
---

<div class="cb-reading-progress" aria-hidden="true"><span id="cb-reading-progress"></span></div>
<div id="article"></div>

<div class="cb-prose">
<nav aria-label="Research resources" class="cb-resources"><a href="https://arxiv.org/pdf/2609.32046">Paper ↗</a><a href="https://github.com/maxr0ssi/rclc">Code ↗</a><a href="https://agentcacheback.github.io">Project ↗</a><a href="https://huggingface.co/papers/2609.32046">HF paper ↗</a></nav>
<p data-edit-id="text-5" style="font-size:21px">Recently, frontier models have made progress on a range of open research problems, often with hundreds or thousands of agents working together.</p>
<p data-edit-id="text-120" style="color:#476e80;font-size:21px">So it seems like having lots of agents work on a task is a pretty good idea.</p>
<p data-edit-id="text-121" style="font-size:21px">Multi-agent systems can distribute information and work across models to run in parallel, manage context limits, and divide tasks into specialized steps.</p>
<p data-edit-id="text-107">On a smaller scale, agents can answer a question across several articles. Each agent reads a different article, then sends a summary to a receiver that combines the summaries into an answer. The receiver’s answer depends on the evidence those summaries contain.</p>
<p data-edit-id="text-105">The dominant form of communication between these agents is text, generated one token at a time. LatentMAS instead sends the sender’s KV cache. But combining full caches at the receiver reassembles the contexts we divided across agents, defeating the context-management purpose of delegation.</p>
<p data-edit-id="text-106">We separate two decisions: what information to send, and how to represent it. To decide what to send, we start with what the receiver needs. CacheBack uses a receiver query to select which positions in the sender’s sequence to send, limiting how much context reaches the receiver. In our experiments, that query is the task question.</p>
<p data-edit-id="text-6"><span style="color:#476e80">At 16× compression, we remove about 94% of sender positions from the message.</span> With Qwen3-8B on FanOutQA, the 4× setting reaches 55.3% strict accuracy, compared with 40.7% for same-size text communication. Median task-completion latency falls from 612 to 192 seconds.</p>
</div>





{% include blog/cacheback/hero.html %}


<nav aria-label="Article contents" class="contents cb-prose"><span>In this article</span><a href="#bottleneck">Limiting context at the receiver</a><a href="#method">Receiver-conditioned selection</a><a href="#results">Accuracy and latency</a><a href="#outlook">Adaptive queries</a><a href="#coding">A Django fix</a></nav>


<section class="cb-prose" id="bottleneck"><p class="section-index" data-edit-id="text-7">01</p><h2 data-edit-id="text-8">Limiting context at the receiver</h2>
<p data-edit-id="text-16">Each sender may have enough context to read its own articles. The receiver, however, has to combine their messages. If those messages contain the full KV caches, it receives a position for every input token and latent step from every sender. In our Qwen3-8B FanOutQA setup, the combined caches leave too little context for the receiver to generate an answer on every task. We call this <strong>context re-expansion</strong>.</p>
<p data-edit-id="text-13">We could reduce the size of those caches. Quantization uses fewer bytes for each key and value. <a href="https://openreview.net/forum?id=F7rUng23nw">KVComm</a> sends fewer layers. Both reduce the amount of data sent, but retain every position in the layers being transferred. The receiver still needs room in its context window for all those positions.</p>
<p data-edit-id="text-18">A <strong>position budget</strong> limits how many positions each sender can include in its message. To stay within that budget, the sender must select which positions to keep.</p>
</section>


{% include blog/cacheback/communication.html %}


<section class="cb-prose" id="method"><p class="section-index" data-edit-id="text-22">02</p><h2 data-edit-id="text-23">Receiver-conditioned selection</h2>
<p data-edit-id="text-26">Good communication is a form of compression. When I mention attention, I don’t send the full <em>Attention Is All You Need</em> paper. A few words are enough to refer to something we both understand, leaving us to focus on what I want to add.</p>
<p data-edit-id="text-109">Language models have a similar starting point. The receiver brings knowledge from pretraining and context from its own task. The sender needs to communicate the <strong>residual</strong>: the additional evidence the receiver needs beyond what it already knows. That evidence may occupy only a small part of the article, allowing us to compress the message substantially while preserving what the receiver needs to answer.</p>
<p data-edit-id="text-110">Take the example below. We have two questions about the logistics of collecting a building pass. Each agent reads a different document: the booking confirmation, a notice changing the collection desk, or the ID requirements. The agents pass messages along a chain to a receiver that answers the question.</p>
<p data-edit-id="text-111">One question asks where to go and what identification to bring. The other asks whether a driving licence is accepted. Each grid shows the document read by one agent, with one cell per token. The highlighted cells show which positions the agent selected to include in its message. Switching between the questions shows how that selection changes while the documents stay the same.</p>
</section>


{% include blog/cacheback/question-explorer.html %}


<div class="cb-prose method-continued">
<aside class="sidenote"><b>SnapKV.</b> Li et al., “SnapKV: LLM knows what you are looking for before generation,” NeurIPS 2024. <a href="https://proceedings.neurips.cc/paper_files/paper/2024/hash/28ab418242603e0f7323e54185d19bde-Abstract-Conference.html">Paper ↗</a></aside><p data-edit-id="text-27">The selections shown above come from CacheBack, which compresses the sender’s state using the receiver’s query. After processing its documents, the sender processes the query against its existing KV cache. Attention from the query tokens provides a signal for scoring earlier positions, without processing the documents again. CacheBack combines these attention weights into a score for each position and selects the highest-scoring spans within the message budget.</p></div>


{% include blog/cacheback/method-figure.html %}


<div class="cb-prose method-explanation"><h3 data-edit-id="text-35">Mean query attention and CacheBack’s correction</h3>
<p data-edit-id="text-112">Communication is a query-aware compression problem: the evidence a sender needs to transmit depends on what the receiver is asking. We build on <a href="https://proceedings.neurips.cc/paper_files/paper/2024/hash/28ab418242603e0f7323e54185d19bde-Abstract-Conference.html">SnapKV</a>, which uses an observation window of final prompt tokens to select cached positions for the model’s own continuation. We replace that observation window with the receiver’s query. Our starting score is <strong>mean query attention</strong>: the attention each sender position receives, averaged across the query tokens.</p>
<p data-edit-id="text-36">But different parts of the query may need evidence from different positions. A position receiving strong attention from the tokens asking about identification may receive little from those asking about the collection desk. Averaging across the whole query can dilute that strong attention and rank the position below one receiving modest attention from every token.</p>
<p data-edit-id="text-37">In the example below, Position A receives strong attention from one query token, while Position B receives weaker attention from all four. Averaging ranks B higher.</p>
<p data-edit-id="text-113">CacheBack applies a correction to mean query attention, increasing the score when attention is concentrated in particular query tokens. When every query token pays equal attention, the score stays unchanged. Here, the correction puts A ahead of B.</p>
<p data-edit-id="text-101">Switch between the two methods to compare their rankings, or adjust A’s attention weights to see how the scores change.</p>
<figure aria-label="Illustration of query attention and position selection" class="attention-figure" id="attention-example">
<div class="figure-kicker"><span>Attention → score</span></div>
<div class="attention-example-grid"><div class="attention-input"><table class="attention-matrix"><thead><tr><th scope="col">Query token</th><th scope="col">Position A</th><th scope="col">Position B</th></tr></thead><tbody><tr><th scope="row">q₁</th><td class="attention-strong">0.40</td><td class="attention-even">0.12</td></tr><tr><th scope="row">q₂</th><td class="attention-zero">0.00</td><td class="attention-even">0.12</td></tr><tr><th scope="row">q₃</th><td class="attention-zero">0.00</td><td class="attention-even">0.12</td></tr><tr><th scope="row">q₄</th><td class="attention-zero">0.00</td><td class="attention-even">0.12</td></tr></tbody></table><div class="attention-sliders"><p>Adjust A’s weights</p><label><span>q₁</span><input aria-label="Attention from query token 1 to position A" data-attention-weight="0" max="0.5" min="0" step="0.01" type="range" value="0.40"/></label><label><span>q₂</span><input aria-label="Attention from query token 2 to position A" data-attention-weight="1" max="0.5" min="0" step="0.01" type="range" value="0"/></label><label><span>q₃</span><input aria-label="Attention from query token 3 to position A" data-attention-weight="2" max="0.5" min="0" step="0.01" type="range" value="0"/></label><label><span>q₄</span><input aria-label="Attention from query token 4 to position A" data-attention-weight="3" max="0.5" min="0" step="0.01" type="range" value="0"/></label><button id="attention-reset" type="button">Reset</button></div></div>
<div class="attention-output"><div aria-label="Position scoring method" class="attention-mode" role="group"><button aria-pressed="true" class="selected-control" data-attention-mode="mean">Mean query attention</button><button aria-pressed="false" data-attention-mode="cacheback">CacheBack</button></div><p class="attention-rule" id="attention-rule">Score = Q</p>
<div class="attention-score" data-attention-position="a"><div class="attention-score-label"><span>Position A</span><strong id="attention-score-a">0.10</strong></div><div class="attention-score-track"><span id="attention-bar-a" style="width:6.25%"></span></div><p>Q = 0.10 · C = 4</p></div>
<div class="attention-score is-selected" data-attention-position="b"><div class="attention-score-label"><span>Position B</span><strong id="attention-score-b">0.12</strong></div><div class="attention-score-track"><span id="attention-bar-b" style="width:7.5%"></span></div><p>Q = 0.12 · C = 1</p></div>
<div class="attention-axis"><span>0</span><span>Score</span><span>2</span></div><p aria-live="polite" class="attention-winner" id="attention-winner">Higher score: Position B</p></div></div>
<p aria-live="polite" class="attention-explanation" id="attention-explanation">Averaging over four query tokens reduces A’s 0.40 weight to Q = 0.10. B’s Q = 0.12 is higher.</p>
<figcaption data-edit-id="text-92"><span class="figure-number">Figure 5.</span> Illustrative weights · one head · no pooling.</figcaption></figure>
<h3 data-edit-id="text-40">State representation</h3>
<p data-edit-id="text-41">After selecting positions, we send their input vectors and let the receiver rebuild its KV cache. This takes fewer bytes per position than sending the full cache; the <a href="https://arxiv.org/html/2609.32046v1#A3.SS3">paper describes the encoding options</a>.</p>
</div>


<section class="cb-prose" id="results"><p class="section-index" data-edit-id="text-65">03</p><h2 data-edit-id="text-66">Accuracy and task-completion latency</h2>
<aside class="sidenote"><b>FanOutQA.</b> Zhu et al., ACL 2024. <a href="https://aclanthology.org/2024.acl-short.2/">Paper ↗</a><br/><br/><b>LongBench v2.</b> Bai et al., ACL 2025. <a href="https://aclanthology.org/2025.acl-long.183/">Paper ↗</a></aside><p data-edit-id="text-68">Both methods receive the same receiver query. Text senders use it to generate a message; CacheBack uses it to select sender positions. We compare the two on <strong>FanOutQA</strong>, with parallel fan-in from senders reading different Wikipedia pages, and <strong>LongBench v2 Easy</strong>, with a sequential chain reading successive parts of a document.</p>
<p data-edit-id="text-71">With Qwen3-8B on FanOutQA, 4× compression gives <strong>55.3% strict accuracy</strong> and a median task-completion latency of <strong>192 seconds</strong>. Same-size text communication gives <strong>40.7%</strong> and <strong>612 seconds</strong>. The plots show the other compression ratios too. Each model family in Figure 1 uses the compression ratio listed in the table.</p></section>


{% include blog/cacheback/results-figure.html %}


<div class="cb-prose query-comparison">
<p data-edit-id="text-67">Selection depends on the receiver’s query. Replacing it with an unrelated question reduced the evidence retained in the message and halved answer accuracy. The sender computation, message budget, and receiver’s actual task question stayed the same.</p>
<figure style="margin:0 0 32px">
<table aria-describedby="query-comparison-caption" style="width:100%;border-collapse:collapse;font-family:var(--sans);font-size:14px;text-align:left">
<thead><tr><th scope="col" style="padding:10px 8px;border-bottom:1px solid var(--rule)">Query used for selection</th><th scope="col" style="padding:10px 8px;border-bottom:1px solid var(--rule)">Message recall</th><th scope="col" style="padding:10px 8px;border-bottom:1px solid var(--rule)">Strict accuracy</th></tr></thead>
<tbody><tr data-edit-id="text-115"><th scope="row" style="padding:10px 8px;font-weight:400">Task question</th><td style="padding:10px 8px">91%</td><td style="padding:10px 8px">46%</td></tr><tr data-edit-id="text-116"><th scope="row" style="padding:10px 8px;font-weight:400">Unrelated question</th><td style="padding:10px 8px">65%</td><td style="padding:10px 8px">23%</td></tr></tbody>
</table>
<figcaption data-edit-id="text-117" id="query-comparison-caption">Qwen3-8B · FanOutQA · 16× compression. Only the query used for selection changes. Message recall counts the fraction of reference-answer groups found in the selected source text.</figcaption>
</figure></div>


<div class="cb-prose results-explanation"><h3 data-edit-id="text-76">Text generation and task-completion latency</h3>
<p data-edit-id="text-77">The marginal cost of communicating more information depends on how the message is produced. Autoregressive communication adds a sequential cost for every token sent: the sender must finish one decoding step before starting the next. CacheBack instead selects from a completed computation. Once positions have been scored, a larger message adds transfer and receiver prefill, which can process many positions together. The marginal cost of sending more evidence therefore shifts from sequential decoding to operations better suited to handling it in bulk.</p>
</div>


{% include blog/cacheback/marginal-figure.html %}


<div class="cb-prose results-explanation"><p data-edit-id="text-83">This benefit does not require a latent message. A sender could also select source passages and transmit them as text, avoiding the cost of generating a summary. Selecting what to send and choosing how to represent it are separate decisions.</p>
</div>


<div class="cb-prose results-explanation"><h3 data-edit-id="text-114">Accuracy as we compress</h3>
<p data-edit-id="text-45">The plot below shows Qwen3-8B on FanOutQA. Move the slider to see how sending fewer positions changes answer accuracy and task-completion latency. At 32× compression, accuracy remains above text communication. At 64×, it falls below text communication, with only a small further reduction in latency.</p></div>


{% include blog/cacheback/compression-explorer.html %}


<section class="cb-prose" id="outlook"><p class="section-index" data-edit-id="text-81">04</p><h2 data-edit-id="text-82">Adaptive queries</h2>
<p data-edit-id="text-85">One completed sender computation could supply several messages. Different receivers could ask for different evidence, or the same receiver could return for more detail. Each request would require processing the new query and selecting positions, without processing the source context again.</p>
<p data-edit-id="text-118">With several senders, the receiver could request additional evidence from the sources it needs. For a coding task, it might ask one sender for a function’s implementation and another for its callers. This would let the receiver spend more of its context budget on evidence needed as the task develops.</p>
</section>


<section class="cb-prose" id="coding"><p class="section-index" data-edit-id="text-47">05</p><h2 data-edit-id="text-48">A Django fix</h2>
<p data-edit-id="text-93">For the coding example, seven Qwen3-8B senders read different parts of a Django codebase. A receiver reads their messages and writes a patch.</p>
<p data-edit-id="text-49">Both runs produce the same one-line patch and pass all 88 tests. CacheBack takes <strong>25.66 seconds</strong> to produce the patch; text communication takes <strong>113.21 seconds</strong>.</p>
</section>


{% include blog/cacheback/coding-figure.html %}


<div class="cb-prose"><p data-edit-id="text-119">Communication is a query-aware compression problem. CacheBack shows that a simple selection rule can retain evidence the receiver needs while improving accuracy and task-completion latency over same-size text communication in our experiments. Choosing that evidence is a separate decision from representing it as text or continuous state. This gives us room to improve both: how agents request and select information, and how they transmit it.</p></div>


<div class="cb-prose contact-note"><p data-edit-id="text-104">The <a href="https://arxiv.org/abs/2609.32046">paper</a> has the full experiments and implementation details. You can reach us at <a href="mailto:mfr2178@columbia.edu">mfr2178@columbia.edu</a>.</p></div>


<footer class="cb-prose article-footer"><div class="footer-resources"><a href="https://arxiv.org/pdf/2609.32046">Paper ↗</a><a href="https://github.com/maxr0ssi/rclc">Code ↗</a><a href="https://agentcacheback.github.io">Project ↗</a><a href="https://huggingface.co/papers/2609.32046">HF paper ↗</a><a href="#article">Back to top ↑</a></div><div class="cite-block"><div class="cite-heading"><span>Cite this work</span><button id="copy-bibtex" type="button">Copy BibTeX</button></div><pre id="bibtex"><code>@misc{rossi2026cacheback,
  title         = {Receiver-Conditioned Latent Communication gives 94\% CacheBack},
  author        = {Rossi, Maximillian and Raghunath, Prajwal and Xuan, Haoqing and
                   Zhang, Yusen and Wu, Eugene},
  year          = {2026},
  eprint        = {2609.32046},
  archivePrefix = {arXiv},
  primaryClass  = {cs.AI},
  url           = {https://arxiv.org/abs/2609.32046}
}</code></pre></div><p class="fine-print" data-edit-id="text-88">An illustrated companion to <em>Receiver-Conditioned Latent Communication gives 94% CacheBack</em>. Research by Maximillian Rossi, Prajwal Raghunath, Haoqing Xuan, Yusen Zhang, and Eugene Wu.</p></footer>


<dialog aria-label="Enlarged result plot" id="plot-dialog"><button autofocus="" id="close-plot">Close ×</button><p data-edit-id="text-89">Swipe or scroll across the enlarged plot to read its labels.</p><div aria-label="Enlarged result plot; scroll horizontally" class="enlarged-plot" role="region" tabindex="0"><img alt="" id="dialog-plot"/></div></dialog>
