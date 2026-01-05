// src/index.ts
import * as restate from "@restatedev/restate-sdk";
import { useronboardingFlow } from "./workflows/userOnboarding.workflow";
import { kycService } from "./services/kycService";
import { startSocketServer } from "./socket.server";
import { depositFlow  } from "./workflows/deposit.workflow";
import { brokerageScheduler } from "./services/brokerage-scheduler.services"
// import './cron-scheduler';
startSocketServer();
console.log("🚀 Server starting with scheduler:", process.argv.includes("--scheduler"));


restate.serve({
  services: [
    brokerageScheduler,
    depositFlow,
    kycService,
    useronboardingFlow
  ],
  port: 9080,
  
});