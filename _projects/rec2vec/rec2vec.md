---
title: "Rec2Vec"
subtitle: "Edit-Distance Supervision for Logical Product Retrieval"
date: 2026-02-09
authors:
  - name: "Matthew Toles"
  - name: "Shachaf Rispler"
  - name: "Eugene Wu"
avatar: rec2vec.png
tags:
  - "Dense Retrieval"
  - "Logical Reasoning"
  - "Product Search"
  - "Embeddings"
---
Dense retrievers struggle to handle logical constraints such as negation, conjunction, and disjunction in product search, particularly when relevance depends on a small number of attribute-level differences. 
In Rec2Vec, we address this limitation by supervising dense embeddings with attribute-level edit distance, defined as the minimum number of feature changes required for a product to satisfy a Boolean query. 
We build a large-scale training dataset from the ESCI corpus by constructing contrastive triplets consisting of a positive product, a hard negative that violates specific attributes, and an easy negative sampled at random. 
To enable fine-grained supervision, we use large language models to extract synthetic product features and generate natural-language Boolean queries, allowing the embedding space to reflect logical structure rather than pure semantic similarity.