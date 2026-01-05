import * as restate from "@restatedev/restate-sdk";

import { useronboardingFlow } from "./workflows/userOnboarding.workflow";
import { depositFlow } from "./workflows/deposit.workflow";
import { kycService } from "./services/kycService";
import { brokerageScheduler } from "./services/brokerage-scheduler.services";

const app = restate
  .endpoint()
  .bind(brokerageScheduler)
  .bind(depositFlow)
  .bind(kycService)
  .bind(useronboardingFlow);

export default app;
