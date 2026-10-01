import { db } from "../../lib/db";

async function main() {
  try {
    const v = await db.widgetView.create({
      data: { widget: "plan-quiz", host: "direct", referrer: null },
    });
    console.log("DB CREATE OK:", v.id);
    const count = await db.widgetView.count();
    console.log("COUNT:", count);
  } catch (e) {
    console.log("DB ERROR:", e instanceof Error ? e.message.slice(0, 300) : e);
  }
}
main();
