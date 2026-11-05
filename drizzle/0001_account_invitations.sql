ALTER TABLE users ADD COLUMN phone TEXT NOT NULL DEFAULT '';
--> statement-breakpoint
CREATE TABLE invitations (
  hash TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL UNIQUE REFERENCES users(id),
  createdBy TEXT NOT NULL REFERENCES users(id),
  createdAt TEXT NOT NULL,
  expiresAt INTEGER NOT NULL,
  usedAt TEXT,
  delivery TEXT NOT NULL DEFAULT 'pending' CHECK(delivery IN ('pending','accepted','failed')),
  providerId TEXT
);
