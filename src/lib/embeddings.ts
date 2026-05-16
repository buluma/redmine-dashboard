import { getOllamaClient } from "./ollama";
import { prisma } from "./db";
import { trackFailure } from "./telemetry";

export interface EmbeddedIssue {
  issueId: string;
  embedding: number[];
  model: string;
}

export async function generateEmbedding(text: string): Promise<{ embedding: number[]; model: string }> {
  const client = getOllamaClient();
  const result = await client.generateEmbeddings([text]);
  return {
    embedding: result.embeddings[0],
    model: result.model,
  };
}

export async function getEmbeddingForIssue(issueId: string): Promise<EmbeddedIssue | null> {
  const stored = await prisma.issueEmbedding.findUnique({
    where: { issueId },
  });

  if (!stored) {
    return null;
  }

  return {
    issueId: stored.issueId,
    embedding: JSON.parse(stored.embedding),
    model: stored.model,
  };
}

export async function upsertEmbeddingForIssue(
  issueId: string,
  text: string
): Promise<EmbeddedIssue> {
  const { embedding, model } = await generateEmbedding(text);

  const stored = await prisma.issueEmbedding.upsert({
    where: { issueId },
    update: {
      embedding: JSON.stringify(embedding),
      model,
    },
    create: {
      issueId,
      embedding: JSON.stringify(embedding),
      model,
    },
  });

  return {
    issueId: stored.issueId,
    embedding,
    model: stored.model,
  };
}

export async function findSimilarIssues(
  queryEmbedding: number[],
  limit: number = 10,
  excludeIssueId?: string
): Promise<Array<{ issueId: string; similarity: number }>> {
  // Get all embeddings from database
  const embeddings = await prisma.issueEmbedding.findMany({
    where: excludeIssueId ? { issueId: { not: excludeIssueId } } : undefined,
  });

  // Calculate cosine similarity
  const similarities = embeddings.map((stored) => {
    const embedding = JSON.parse(stored.embedding);
    const similarity = cosineSimilarity(queryEmbedding, embedding);
    return { issueId: stored.issueId, similarity };
  });

  // Sort by similarity (descending) and return top results
  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);

  if (denominator === 0) {
    return 0;
  }

  return dotProduct / denominator;
}

export async function semanticSearch(
  query: string,
  limit: number = 10,
  excludeIssueId?: string
): Promise<Array<{ issueId: string; similarity: number }>> {
  const { embedding } = await generateEmbedding(query);
  return findSimilarIssues(embedding, limit, excludeIssueId);
}

export async function rebuildAllEmbeddings(issues: Array<{ id: string; subject: string; description?: string | null }>): Promise<number> {
  let count = 0;
  
  for (const issue of issues) {
    const text = `${issue.subject}\n${issue.description || ""}`;
    try {
      await upsertEmbeddingForIssue(issue.id, text);
      count++;
    } catch (error) {
      trackFailure({ event: "embeddings.issue.failed", error, metricName: "embedding_issue_failed", metricTags: { issue_type: "issue" } });
    }
  }
  
  return count;
}
