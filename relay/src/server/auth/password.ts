import { hash, verify } from "@node-rs/argon2";

// Argon2id with OWASP-recommended parameters; salt is generated per hash (Q1).
const opts = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
export const hashPassword = (pw: string) => hash(pw, opts);
export const verifyPassword = (stored: string, pw: string) => verify(stored, pw).catch(() => false);
