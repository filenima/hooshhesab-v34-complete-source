import { io } from "/home/z/my-project/node_modules/socket.io-client/build/esm/index.js";

// Test 1: direct to 3034
const direct = io("http://localhost:3034/", { transports: ["polling"], reconnection: false, timeout: 6000 });
const t1 = setTimeout(() => { console.log("DIRECT: TIMEOUT"); test2(); }, 9000);
direct.on("connect", () => { console.log("DIRECT: CONNECTED sid=" + direct.id); clearTimeout(t1); direct.disconnect(); test2(); });
direct.on("connect_error", (e) => { console.log("DIRECT: ERROR: " + e.message); clearTimeout(t1); test2(); });

function test2() {
  // Test 2: via gateway with XTransformPort
  const gw = io("http://localhost:3000/?XTransformPort=3034", { transports: ["polling"], reconnection: false, timeout: 6000 });
  const t2 = setTimeout(() => { console.log("GATEWAY: TIMEOUT"); process.exit(1); }, 9000);
  gw.on("connect", () => { console.log("GATEWAY: CONNECTED sid=" + gw.id); clearTimeout(t2); process.exit(0); });
  gw.on("connect_error", (e) => { console.log("GATEWAY: ERROR: " + e.message); clearTimeout(t2); process.exit(1); });
}
