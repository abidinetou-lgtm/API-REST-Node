import request, { type Response } from "supertest";
import { vi } from "vitest";
import { app } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import type { Role } from "../src/generated/prisma/enums.js";

export const PASSWORD = "Str0ngPassw0rd";

export const api = () => request(app);

let passwordHash: Promise<string> | undefined;
let counter = 0;

type UserOptions = {
  role?: Role;
  email?: string;
  isActive?: boolean;
  pending?: boolean;
};

export async function createUser(options: UserOptions = {}) {
  counter += 1;
  passwordHash ??= hashPassword(PASSWORD);

  return prisma.user.create({
    data: {
      email: options.email ?? `user${counter}@example.com`,
      name: `User ${counter}`,
      role: options.role ?? "USER",
      isActive: options.isActive ?? true,
      passwordHash: options.pending ? null : await passwordHash,
    },
  });
}

export function refreshCookie(res: Response) {
  const cookies = [res.headers["set-cookie"] ?? []].flat();
  const cookie = cookies.find((value) => value.startsWith("refresh_token="));
  return cookie?.split(";")[0];
}

export async function login(email: string, password = PASSWORD) {
  const res = await api().post("/auth/login").send({ email, password });
  return { res, token: res.body.accessToken as string, cookie: refreshCookie(res) };
}

export async function loginAs(role: Role) {
  const user = await createUser({ role });
  const session = await login(user.email);
  return { user, ...session };
}

export function bearer(token: string) {
  return { Authorization: `Bearer ${token}` };
}

// Reads the token from the last email printed for this address
export function emailToken(email: string) {
  const printed = vi
    .mocked(console.log)
    .mock.calls.map((args) => String(args[0]))
    .filter((text) => text.includes(`Email to ${email}`));

  return printed.at(-1)?.match(/token=([A-Za-z0-9_-]+)/)?.[1];
}
