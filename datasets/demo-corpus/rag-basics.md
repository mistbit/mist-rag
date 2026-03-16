# RAG Basics

Retrieval-augmented generation is useful when the model needs access to information that is too specific, too recent, or too large to fit into the prompt every time.

The retrieval step works best when documents are cleaned before indexing. Headings, paragraphs, and metadata usually matter more than decorative formatting.

Chunking is a tradeoff. Bigger chunks preserve context but can reduce retrieval precision. Smaller chunks improve precision but may fragment the evidence needed to answer a question.

Overlap exists to reduce the damage caused by hard boundaries. It is not free: more overlap means more tokens, more embeddings, and more duplicate context in the final prompt.

