import * as restate from "@restatedev/restate-sdk";
import { userRequest, userRequestSchema } from "../schemas/userRequest.schema"
import { z } from "zod";
import { Prisma, PrismaClient } from "@prisma/client";
import { depositGateway, withdrawGateway } from "../utils/helpers";
import { kycService } from "../services/kycService";
const KYC_DELAY_MS = 1 * 60 * 1000;
import { emitNotification } from "../socket/emitter";

import { generateWalletId } from "../utils/helpers";

export type UserRequest = z.infer<typeof userRequestSchema>;

const prisma = new PrismaClient();

export const useronboardingFlow = restate.workflow({
  name: "useronboarding",
  handlers: {
    run: async (ctx: restate.WorkflowContext, user: userRequest) => {
      // user registration validation
      try {
        const validatedUser = userRequestSchema.parse(user);

        try {

          // 1. user create
          const newUser = await prisma.users.create({
            data: validatedUser,
          });

          // 2. Wallet create
          const wallet = await prisma.wallets.create({
            data: {
              user_id: newUser.id,
              wallet_number: generateWalletId(newUser.id),
              balance: 0,
              status: "active",
            },
          });

          // 3. create account
          const accounts = await prisma.accounts.create({
            data: {
              user_id: newUser.id,
              account_number: Math.floor(1000000 + Math.random() * 9000000),
              account_type: "mt4",
              balance: 0,
              status: "active"
            }
          });

          // 3. create account
          const payment_gateway = await prisma.payment_gateway.create({
            data: {
              user_id: newUser.id,
              deposit_gateway: depositGateway().join(','),
              withdrawal_gateway: withdrawGateway().join(','),
            }
          });

          // User successfully created - NOW send KYC reminder
          ctx.serviceSendClient(kycService).remindKyc(
            {
              email: newUser.email,
              name: user.firstName
            },
            restate.rpc.sendOpts({
              delay: { milliseconds: KYC_DELAY_MS }
            })

          );
          // Emit notification
          emitNotification({
            title: "New User",
            message: `${newUser.email} registered`,
          });
          return {
            success: true,
            message: "User registered successfully",
          };

        } catch (error) {
          // Database error handling
          if (
            error &&
            typeof error === "object" &&
            "code" in error &&
            error.code === "P2002"
          ) {
            return {
              success: false,
              message: `User with this email already exists`,
              errors: [],
            };
          }

          return {
            success: false,
            message: "Database error",
            errors: error,
          };
        }

      } catch (error) {
        // Validation error
        if (error instanceof z.ZodError) {
          const errorResponse = {
            success: false,
            message: "Validation failed from restate workflow",
            errors: error.issues.map(err => ({
              field: err.path.join('.'),
              message: err.message
            }))
          };

          console.log("Error Response:", JSON.stringify(errorResponse, null, 2));
          return errorResponse;
        }
        throw error;
      }
    },
  },
});