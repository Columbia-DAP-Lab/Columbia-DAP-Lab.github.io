---
layout: post
color: '#0c6a99'
title: "What Matters for Question Answering Agents over Massive Data Lakes?"
date: 2026-09-10
categories: [general]
tags: [agents, benchmarks, data-lakes]
authors:
  - name: "Austin Senna Wijaya"
  - name: "Jiaxiang Liu"
  - name: "Haonan Wang"
  - name: "Eugene Wu"
    url: "https://www.cs.columbia.edu/~ewu/"
excerpt: "Question answering agents get worse as data lakes get bigger, and careful ablation is needed to measure each bottleneck."
slug: "sana-qa-agents-over-data-lakes"
---

<style>
  /* Component names, colored to match the figures. */
  .c-plan    { color: #1f5fc4; font-weight: 700; }
  .c-search  { color: #3f7a2e; font-weight: 700; }
  .c-analyze { color: #61519f; font-weight: 700; }

  /* The scale carousel's caption carries the per-case description, so it gets
     body-text treatment and a floor height to stop the slide jumping. */
  #fig-scale-progression .blog-carousel-caption {
    text-align: left;
    font-size: 0.97em;
    line-height: 1.6;
    color: #2f3740;
    background: #f7f9fa;
    border-left: 3px solid #0c6a99;
    border-radius: 0 6px 6px 0;
    padding: 0.9em 1.1em;
    margin-top: 1.1em;
    min-height: 11.1em;
  }
  #fig-scale-progression .blog-carousel-caption ol {
    margin: 0.45rem 0 0.55rem;
    padding-left: 1.6rem;
  }
  #fig-scale-progression .blog-carousel-caption li { margin-bottom: 0.2rem; }
  #fig-scale-progression .blog-carousel-caption .cap-note { display: block; margin-top: 0.65rem; }
  @media (max-width: 768px) {
    #fig-scale-progression .blog-carousel-caption { min-height: 0; }
  }

  /* Tighter list rhythm: lists hug their lead-in line instead of floating. */
  .post-body p  { margin-bottom: 0.85rem; }
  .post-body ul,
  .post-body ol { margin-bottom: 0.85rem; padding-left: 1.35rem; }
  .post-body li { margin-bottom: 0.25rem; }
  .post-body li:last-child { margin-bottom: 0; }
  .post-body p + ul,
  .post-body p + ol { margin-top: -0.4rem; }

  /* The driving question, set apart from the prose. */
  .post-body blockquote {
    text-align: center;
    font-style: italic;
    font-size: 1.12rem;
    line-height: 1.5;
    color: #1b2b3a;
    background: #f4f8fb;
    border: 1px solid #dde7ee;
    border-left: 1px solid #dde7ee;
    border-radius: 10px;
    padding: 1.1rem 1.5rem;
    margin: 1.5rem auto 1.8rem;
    max-width: 54rem;
  }
  .post-body blockquote p { margin: 0; }

  /* Closing call to action. */
  .post-body .cta {
    background: linear-gradient(180deg, #f4f7fd 0%, #eef2fb 100%);
    border: 1px solid #dde4f2;
    border-radius: 12px;
    padding: 1.9rem 1.6rem 1.7rem;
    margin: 2.2rem 0 1rem;
    text-align: center;
  }
  .post-body .cta-eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.78rem;
    font-weight: 700;
    color: #012169;
    margin-bottom: 0.7rem;
  }
  .post-body .cta-lead {
    font-size: 1.12rem;
    line-height: 1.5;
    color: #20272e;
    max-width: 46rem;
    margin: 0 auto 1.3rem;
  }
  .post-body .cta-actions {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.7rem;
  }
  .post-body .cta-btn {
    display: inline-block;
    background: #012169;
    color: #fff;
    font-weight: 700;
    font-size: 0.97rem;
    text-decoration: none;
    padding: 0.7rem 1.25rem;
    border-radius: 7px;
    transition: background 0.15s ease;
  }
  .post-body .cta-btn:hover,
  .post-body .cta-btn:focus {
    background: #0c6a99;
    color: #fff;
    text-decoration: none;
  }

  /* Figure captions. The layout gives .post-body img a 1em bottom margin,
     so pull the caption back up against its figure. */
  .post-body .caption {
    text-align: center;
    color: #667;
    font-size: 0.88em;
    line-height: 1.45;
    margin: -0.5em auto 2.2em;
    max-width: 85%;
  }
</style>

On [**LakeQA**](https://openreview.net/forum?id=gWoEOFW0CR), our benchmark for question answering over massive data lakes, Opus 4.5 gets 46% of the questions correct and GPT 5.2 gets 18%. But these numbers tell you almost nothing about *why* they failed. In this post, we talk about how scale affects difficulty, and how careful ablation can pinpoint the bottlenecks where question answering needs to improve.

Question-answering (QA) agents are agents designed to answer questions based on retrieved knowledge. They answer questions by <span class="c-plan">planning</span> subquestions, where each subquestion may require the agent to <span class="c-search">search</span> a knowledge base for relevant sources and <span class="c-analyze">analyze</span> those sources to extract facts. As an example, we start out with a simple question:

> "Which supplier caused the most delivery delays in our Midwest locations last quarter?"

### Complexity appears as we scale

{% include blog-carousel.html
   id="fig-scale-progression"
   files="case1_simple_qa.png,case2_multihop_qa.gif,case3_datalake_qa.gif,case4_lakeqa.gif"
   captions="On the smallest scale, if you give it the deliveries dataset and the Midwest filters Indiana and Illinois, then all the agent has to do is run the correct SQL to compute the results.|If you did not provide the definition of Midwest locations, then the agent has to plan out 2 subquestions:<ol type='i'><li>find out which states count as Midwest, run SQL to resolve them to Indiana and Illinois</li><li>use those states to find which suppliers had the most delays by generating more analysis queries</li></ol>There&rsquo;s a lot of progress on this type of text-to-SQL, and accuracy on benchmarks like <a href='https://spider2-sql.github.io/'>Spider 2.0</a> Snow is over 90%.|If our data lake has 1k+ sources, then an agent cannot fit all those sources into context. So it first has to search for the relevant sources before running SQL on it to get the same filters.<span class='cap-note'>Recent work like <a href='https://arxiv.org/abs/2506.06541'>KramaBench</a> provides 1.7K sources and the current best implementation under Sonnet 3.7 reaches only 56% accuracy on that benchmark.</span>|In LakeQA we scale this to the extreme, and errors cascade easily: a failure at any step feeds the next one, so a single accuracy score conflates all of them.<span class='cap-note'>Read on below for what that costs and how we pull the causes apart.</span>"
   alts="Case 1, simple QA: the deliveries table is given and the agent runs one SQL query to get Hartwell Supply Co.|Case 2, multi-hop QA, animated in three steps: the agent first plans the subquestion resolving Midwest to Indiana and Illinois with SQL, then adds the second subquestion finding the supplier with the most delays, and finally a Spider 2.0 Snow leaderboard appears showing how much progress text-to-SQL has made.|Case 3, data lake QA, animated in three steps: with 1k+ table sources the agent first plans a subquestion that runs a BM25 or vector search before analysis, then adds the second subquestion, and finally a KramaBench leaderboard appears showing the best implementation reaching only 56 percent accuracy.|Case 4, LakeQA: the agent plans over 40M heterogeneous data sources, scoring 46 percent for Opus 4.5 and 18 percent for GPT 5.2; red crosses then mark failed search and analysis steps, showing that errors cascade easily and the score conflates the failures." %}

From the carousel above, we can observe that in general, tasks are more difficult as we scale the data lake, increase the steps required to answer the question, and increase the sources required. In **LakeQA**, our ICML 2026 work, we scale this to the extreme by building a 10TB data lake of 40M files, where each task in the benchmark has about 13 reasoning steps and 7 required sources.

In LakeQA, even the best models fall well short, but we cannot isolate the root causes or see where we need more progress. Scale degrades the quality of <span class="c-plan">planning</span>, <span class="c-search">search</span>, and <span class="c-analyze">analysis</span>, and a failure at any step can cascade. As a result, an improvement to the retrieval system may look bad even if it retrieved the right sources, because the agent failed at planning by missing an important step. As such, we need an evaluation framework to control each bottleneck independently.

## SANA: an evaluation framework for question-answering agents

SANA is an evaluation framework that isolates the contribution of each component by keeping the other components at oracle. Specifically, for <span class="c-plan">planning</span>, it gives you the right subquestions to answer the question. Then, within each subquestion, <span class="c-search">search</span> always retrieves the required sources relevant to the query, and <span class="c-analyze">analysis</span> always extracts the correct fact from those sources.

### Intent-based ablation

SANA does intent-based ablation. An agent's intent does not necessarily result in the right answer, as the implementation could be a bottleneck. For instance, even if the agent intended the right query for a source, the relevant sources might not appear from a search tool, as they get pushed out of the top-k by the scale of the lake.

However, if we restrict the data lake to the gold datasets required to answer the question, then the retrieved sources will always be relevant; hence if the agent had the right intent in its query, it will always get the right results.

{% include blog-carousel.html
   id="fig-search-modes"
   files="search_standard.png,search_oracle.png"
   alts="Standard search: the query runs over the full 40 million document lake and the needed source falls below the top-k cutoff, so it is not in the results.|Oracle search: the same query runs over the gold data lake and always retrieves the needed source." %}

We can use SANA to answer 2 questions: (i) **how big a component's bottleneck is**: by taking the oracle implementation as an upper bound, and making a naive implementation like BM25 for search, the difference in accuracy acts as a proxy for how big a component's bottleneck is. (ii) **how good a component's implementation is**: you can also judge how good your implementation of a component is by calculating how far it is from the oracle and how much better than naive it is.

## Experiments &amp; results

Now that we have a framework, we can carefully control the mixture of components to run ablations. The findings we talk about in this post are on a 10k-document subset of LakeQA, mainly evaluated on accuracy with gpt-5-mini. With that in place, we ran 2 modes of ablation:

- **Per-component ablation** ablates one component while keeping the other two at oracle. For instance on <span class="c-search">search</span>: keeping <span class="c-plan">plan</span> and <span class="c-analyze">analyze</span> at oracle, we change the search modes around, from the naive BM25, to the standard hybrid search, to oracle. Here, standard means an off-the-shelf implementation, standing in for whatever your implementation is.
- **End-to-end mode ablation** ablates all three axes as one mode: for instance, naive all the way, or standard all the way.

{% include blog-carousel.html
   id="fig-ablation-modes"
   files="fig5_per_component_ablation.gif,fig7_end_to_end_ablation.gif"
   alts="Animation of the per-component ablation. Plan and analyze stay at oracle while the search column steps from BM25, to hybrid search, to oracle.|Animation of the end-to-end mode ablation. The box moves across whole rows: naive for every component, then standard for every component, then oracle for every component." %}

### Finding 1: Data analysis and search are major bottlenecks

From per-component ablation, we found that <span class="c-search">search</span> and <span class="c-analyze">analysis</span> are big bottlenecks. The difference between naive and oracle is 9.6% for <span class="c-plan">planning</span>, 13.3% for <span class="c-search">search</span>, and 18.5% for <span class="c-analyze">analysis</span>. Planning looks like a smaller bottleneck than it is: agents deviate from 44% of their own plans, so a better planner often doesn't get executed.

{% include blog-image.html file="results_per_component.png" alt="Dumbbell chart of accuracy by component on LakeQA with gpt-5-mini. Planning runs from 66.7 naive to 76.3 oracle, plus 9.6. Search runs from 63.0 naive and 61.5 standard to 76.3 oracle, plus 13.3. Data analysis runs from 57.8 standard to 76.3 oracle, plus 18.5. A callout notes that 44 percent of plans are ignored." %}

<div class="caption">The y-axis is accuracy and the x-axis is the component. Hollow dots are naive, shaded dots are standard, and solid dots are oracle.</div>

### Finding 2: We are still far away from oracle

From end-to-end mode ablation, we found that we are still far away from oracle. We can see that standard is only slightly better than naive (1.5%), and there is still a huge gap between standard and oracle (18.5%). So there are still improvements that can be made to the implementations.

{% include blog-image.html file="results_end_to_end.png" alt="Bar chart of end-to-end accuracy on LakeQA with gpt-5-mini. Naive scores 56.3, standard scores 57.8 which is only a small improvement, and oracle scores 76.3, leaving a huge gap." %}

<div class="caption">The y-axis is accuracy and the x-axis is the mode.</div>

## Takeaways &amp; try it out

1. **Careful measurement is important.** Isolation is necessary, as end-to-end scoring can conflate the contribution of each improvement.
2. **Bottlenecks are non-generalizable.** They are specific to the tasks, benchmark, scale, and models. For instance, LakeQA is bottlenecked by <span class="c-analyze">analysis</span> and <span class="c-search">search</span>, while KramaBench is only bottlenecked by <span class="c-analyze">analysis</span> (the gaps between naive and oracle are 3.6% for planning, 6.0% for search, and 14.5% for analysis).

We open-sourced SANA so you can:

- Identify bottlenecks in any question-answering benchmark.
- Evaluate the effectiveness of your tools for <span class="c-plan">planning</span>, <span class="c-search">search</span>, and <span class="c-analyze">analysis</span> in question answering.

<div class="cta">
  <div class="cta-eyebrow">Collaborate with us</div>
  <p class="cta-lead">Interested in using SANA, measuring the bottlenecks in your own QA benchmark, or working with us on the next set of problems?</p>
  <div class="cta-actions">
    <a class="cta-btn" href="https://arxiv.org/abs/2606.13904">Read the paper &rarr;</a>
    <a class="cta-btn" href="https://github.com/sana-ablation/sana-framework">Get the code &rarr;</a>
    <a class="cta-btn" href="mailto:asw2215@columbia.edu">Reach out at asw2215@columbia.edu &rarr;</a>
  </div>
</div>
