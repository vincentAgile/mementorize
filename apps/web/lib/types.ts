export interface Quote {
  id: string;
  text: string;
  author: string | null;
  source: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuoteInput {
  text: string;
  author?: string;
  source?: string;
}
