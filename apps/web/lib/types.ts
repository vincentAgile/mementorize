export interface Quote {
  id: string;
  text: string;
  author: string | null;
  source: string | null;
  userId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateQuoteInput {
  text: string;
  author?: string;
  source?: string;
}

export interface AuthUser {
  id: string;
  email: string;
}

export interface Credentials {
  email: string;
  password: string;
}
