import type { CreateQuoteInput, Quote } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export async function getQuotes(): Promise<Quote[]> {
  const res = await fetch(`${API_URL}/quotes`, { cache: 'no-store' });
  if (!res.ok) {
    throw new Error(`Failed to fetch quotes (${res.status})`);
  }
  return res.json();
}

export async function createQuote(input: CreateQuoteInput): Promise<Quote> {
  const res = await fetch(`${API_URL}/quotes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    throw new Error(`Failed to create quote (${res.status})`);
  }
  return res.json();
}
