// Argon2id: memory-hard, salted per hash (the salt is stored inside the hash string).
// A fast hash such as SHA-256 would let a leaked table be brute-forced on a GPU.
import argon2 from 'argon2';

export const argon2Hasher = {
  hash: (password) => argon2.hash(password, { type: argon2.argon2id }),
  verify: (hash, password) => argon2.verify(hash, password),
};
