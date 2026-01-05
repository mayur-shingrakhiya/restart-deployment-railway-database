// ================= TYPES =================

export type AccountTypes = "mt4" | "mt5" | "wallet";

export type DepositStatus = "pending" | "success" | "failed" | "cancelled";

// Deposit Request Type
export interface depositRequest {
  transaction_id: string;
  user_id: number;
  amount: number;
  account_type: AccountTypes;
  account_number: string;
  gateway: string;
}

// Deposit Confirmation Type
export interface DepositConfirmation {
  approved: boolean;
  approvedAt: number;
  reason?: string;
  statusType?: "failed" | "cancelled";
}


import { z } from "zod";

// ================= ZOD SCHEMA =================

export const DepositRequestSchema = z.object({
  transaction_id: z
    .string()
    .regex(/^\d+$/, "Transaction ID must be numeric")
    .min(1, "Transaction ID is required"),

  user_id: z
    .number()
    .int()
    .positive("User ID must be positive"),

  // amount: z
  //   .number()
  //   .positive("Amount must be greater than 0"),

  // account_type: z.enum(["mt4", "mt5", "wallet"]),

  // account_number: z
  //   .string()
  //   .regex(/^\d+$/, "Account number must be numeric")
  //   .min(1, "Account number is required"),

  // gateway: z
  //   .string()
  //   .min(2, "Gateway is required"),
});