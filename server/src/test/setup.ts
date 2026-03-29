import { execSync } from "child_process";

export async function setup() {
  execSync("npx prisma migrate deploy", {
    env: { ...process.env },
    cwd: process.cwd(),
    stdio: "inherit",
  });
}
