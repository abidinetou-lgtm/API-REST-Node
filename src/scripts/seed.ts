import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import { sendInvitation } from "../services/user-token.service.js";

async function seedSuperAdmin() {
  if (!env.SUPER_ADMIN_EMAIL) {
    throw new Error("SUPER_ADMIN_EMAIL is not set");
  }

  const email = env.SUPER_ADMIN_EMAIL.toLowerCase();
  const superAdmin = await prisma.user.findFirst({ where: { role: "SUPER_ADMIN" } });

  if (superAdmin) {
    // Invitation never accepted (email lost or link expired): send a new one
    if (!superAdmin.passwordHash) {
      await sendInvitation(superAdmin);
      console.log(`Super admin invitation sent again to ${superAdmin.email}`);
      return;
    }

    console.log(`Super admin already exists (${superAdmin.email}), nothing to do`);
    return;
  }

  const existingUser = await prisma.user.findUnique({ where: { email } });
  if (existingUser) {
    throw new Error(`${email} is already used by another account`);
  }

  const user = await prisma.user.create({
    data: { email, name: "Super Admin", role: "SUPER_ADMIN" },
  });

  await sendInvitation(user);
  console.log(`Super admin created, invitation sent to ${email}`);
}

seedSuperAdmin()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
