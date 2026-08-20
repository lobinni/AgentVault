import { db } from "@/db";
import { sql } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  // If database is configured, check connection
  if (db) {
    try {
      await db.execute(sql`select 1`);
      return Response.json({ ok: true, database: true });
    } catch {
      return Response.json({ ok: false, database: false }, { status: 500 });
    }
  }
  
  // AgentVault works without database (blockchain-only)
  return Response.json({ ok: true, database: false });
}
