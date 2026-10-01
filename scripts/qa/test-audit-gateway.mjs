import { io } from "/home/z/my-project/node_modules/socket.io-client/build/esm/index.js";

// شبیه‌سازی دقیق رفتار مرورگر: اتصال نسبی از طریق گیت‌وی (پورت 81)
const gw = io("http://localhost:81/?XTransformPort=3034", { transports: ["websocket", "polling"], reconnection: false, timeout: 8000 });
const t = setTimeout(() => { console.log("GATEWAY-81: TIMEOUT"); process.exit(1); }, 12000);
gw.on("connect", () => {
  console.log("GATEWAY-81: CONNECTED sid=" + gw.id + " (websocket upgrade: n/a)");
  clearTimeout(t);
  gw.disconnect();
  process.exit(0);
});
gw.on("connect_error", (e) => { console.log("GATEWAY-81: ERROR: " + e.message); clearTimeout(t); process.exit(1); });
