import * as restate from "@restatedev/restate-sdk";
import { PrismaClient } from "@prisma/client";
import z from "zod";
import {
  depositRequest,
  DepositConfirmation,
  DepositRequestSchema,
  DepositStatus,
} from "../schemas/depositRequest.schema";

import {emitDepositUpdate} from "../socket/emitter";

export type DepositRequest = z.infer<typeof DepositRequestSchema>;

const prisma = new PrismaClient();

/* -------------------------------------------------------------------------- */
/*                              RESPONSE TYPES                                 */
/* -------------------------------------------------------------------------- */

type WorkflowResponse = {
  success: boolean;
  status: string;
  data?: any;
  message?: string;
  errors?: any;
};

/* -------------------------------------------------------------------------- */
/*                                DB HELPERS                                   */
/* -------------------------------------------------------------------------- */

async function updateDepositStatus(
  userId: number,
  transactionId: string,
  status: DepositStatus,
  reason?: string
) {
  try {
    console.log("📝 Updating deposit status:", {
      userId,
      transactionId,
      status,
      reason,
    });

    const data: any = {
      status,
      updated_at: new Date(),
    };

    if (reason) data.reason = reason;

    const result = await prisma.deposits.updateMany({
      where: {
        our_transaction_id: transactionId,
        user_id: userId,
      },
      data,
    });


    const updatedDeposit = await prisma.deposits.findFirst({
      where: {
        our_transaction_id: transactionId,
        user_id: userId,
      },
    });

    if (updatedDeposit) {
      emitDepositUpdate(transactionId, updatedDeposit);
    }


    return { success: true, count: result.count };
  } catch (error) {
    console.error("❌ Error updating deposit status:", error);
    throw error;
  }
}

async function getDepositDetails(userId: number, transactionId: string) {
  try {
    console.log("🔍 Fetching deposit details:", { userId, transactionId });

    const deposit = await prisma.deposits.findFirst({
      where: {
        our_transaction_id: transactionId,
        user_id: userId,
      },
    });
    
    console.log("📄 Deposit found:", deposit);

    return deposit;
  } catch (error) {
    console.error("❌ Error fetching deposit details:", error);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*                             DEPOSIT WORKFLOW                                */
/* -------------------------------------------------------------------------- */

export const depositFlow = restate.workflow({
  name: "deposit",

  handlers: {
    /* =========================== MAIN WORKFLOW =========================== */

    run: async (
      ctx: restate.WorkflowContext,
      request: depositRequest
    ): Promise<WorkflowResponse> => {
      try {
        console.log("🚀 Workflow started with request:", request);

        // Step 0: Validate input
        const validatedDeposit = DepositRequestSchema.parse(request);
        console.log("✅ Validation passed:", validatedDeposit);

        // Set workflow state
        ctx.set("status", "pending");
        ctx.set("userId", validatedDeposit.user_id);
        ctx.set("transactionId", validatedDeposit.transaction_id);

        console.log("🔵 Workflow state set, waiting for confirmation...");

        /* ---------------- STEP 1: WAIT FOR DECISION ---------------- */
        const confirmation = await ctx.promise<DepositConfirmation>(
          "depositRequestConfirmed"
        );

        console.log("🟢 Confirmation received:", confirmation);

        /* ---------------- STEP 2: PROCESS DECISION ---------------- */
        if (confirmation.approved) {
          console.log("✅ Processing approval...");

          // Approve deposit
          const updateResult = await ctx.run("approve-deposit", async () => {
            console.log("💾 Running approve-deposit step...");
            return await updateDepositStatus(
              validatedDeposit.user_id,
              validatedDeposit.transaction_id,
              "success"
            );
          });

          console.log("✅ Approval step completed:", updateResult);

          ctx.set("status", "success");

          const response = {
            success: true,
            status: "completed",
            data: {
              approved: true,
              depositStatus: "success",
              transactionId: validatedDeposit.transaction_id,
              userId: validatedDeposit.user_id,
              approvedAt: confirmation.approvedAt,
              reason: confirmation.reason,
            },
            message: "Deposit approved successfully",
          };

          console.log("✅ Workflow completed successfully:", response);

          return response;
        }

        console.log("❌ Processing rejection/cancellation...");

        // Reject or Cancel deposit
        const finalStatus: DepositStatus =
          confirmation.statusType === "cancelled" ? "cancelled" : "failed";

        console.log(`🔴 Final status will be: ${finalStatus}`);

        const updateResult = await ctx.run("reject-deposit", async () => {
          console.log("💾 Running reject-deposit step...");
          return await updateDepositStatus(
            validatedDeposit.user_id,
            validatedDeposit.transaction_id,
            finalStatus,
            confirmation.reason
          );
        });

        console.log("✅ Rejection step completed:", updateResult);

        ctx.set("status", finalStatus);

        const response = {
          success: false,
          status: "completed",
          data: {
            approved: false,
            depositStatus: finalStatus,
            transactionId: validatedDeposit.transaction_id,
            userId: validatedDeposit.user_id,
            reason: confirmation.reason,
            rejectedAt: confirmation.approvedAt,
          },
          message: `Deposit ${finalStatus}`,
        };

        console.log("✅ Workflow completed:", response);

        return response;
      } catch (error: any) {
        // Validation or unexpected errors
        console.error("❌ Workflow error:", error);

        return {
          success: false,
          status: "error",
          message: error.message || "Something went wrong, please try again",
          errors: error.errors || error,
        };
      }
    },

    /* =========================== SIGNALS =========================== */

    approveDeposit: async (
      ctx: restate.WorkflowSharedContext,
      data?: { reason?: string }
    ) => {
      try {
        console.log("✅ approveDeposit signal received:", data);

        await ctx
          .promise<DepositConfirmation>("depositRequestConfirmed")
          .resolve({
            approved: true,
            approvedAt: Date.now(),
            reason: data?.reason || "Approved by admin",
          });

        console.log("✅ Promise resolved for approval");

        return {
          success: true,
          message: "Deposit approval signal sent",
        };
      } catch (error: any) {
        console.error("❌ Error in approveDeposit:", error);
        return {
          success: false,
          message: "Failed to approve deposit",
          errors: error.message,
        };
      }
    },

    rejectDeposit: async (
      ctx: restate.WorkflowSharedContext,
      data: { reason: string }
    ) => {
      try {
        console.log("❌ rejectDeposit signal received:", data);

        await ctx
          .promise<DepositConfirmation>("depositRequestConfirmed")
          .resolve({
            approved: false,
            approvedAt: Date.now(),
            reason: data.reason,
            statusType: "failed",
          });

        console.log("✅ Promise resolved for rejection");

        return {
          success: true,
          message: "Deposit rejection signal sent",
        };
      } catch (error: any) {
        console.error("❌ Error in rejectDeposit:", error);
        return {
          success: false,
          message: "Failed to reject deposit",
          errors: error.message,
        };
      }
    },

    cancelDeposit: async (
      ctx: restate.WorkflowSharedContext,
      data: { reason: string }
    ) => {
      try {
        console.log("🔴 cancelDeposit signal received:", data);

        await ctx
          .promise<DepositConfirmation>("depositRequestConfirmed")
          .resolve({
            approved: false,
            approvedAt: Date.now(),
            reason: data.reason,
            statusType: "cancelled",
          });

        console.log("✅ Promise resolved for cancellation");

        return {
          success: true,
          message: "Deposit cancellation signal sent",
        };
      } catch (error: any) {
        console.error("❌ Error in cancelDeposit:", error);
        return {
          success: false,
          message: "Failed to cancel deposit",
          errors: error.message,
        };
      }
    },

    /* =========================== QUERY =========================== */

    getStatus: async (ctx: restate.WorkflowSharedContext) => {
      try {
        console.log("📊 getStatus called");

        const status = (await ctx.get<string>("status")) || "pending";
        const userId = await ctx.get<number>("userId");
        const transactionId = await ctx.get<string>("transactionId");

        console.log("📊 Workflow state:", { status, userId, transactionId });

        let depositDetails = null;

        if (userId && transactionId) {
          depositDetails = await getDepositDetails(userId, transactionId);
        }

        return {
          success: true,
          data: {
            workflowStatus: status,
            depositDetails,
          },
        };
      } catch (error: any) {
        console.error("❌ Error in getStatus:", error);
        return {
          success: false,
          message: "Failed to fetch status",
          errors: error.message,
        };
      }
    },
  },
});