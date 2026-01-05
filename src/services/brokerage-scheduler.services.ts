// src/services/brokerage-scheduler.services.ts
// ✅ CONFIG-BASED SCHEDULER (No self-scheduling logic needed!)

import * as restate from "@restatedev/restate-sdk";
import { prisma } from "../db/prisma";
import { tradingPairs } from "../config/constants";
import { processLoginUser, updateMultipleWallet, createPkMastRecords } from '../utils/helpers';
import { Decimal } from '@prisma/client/runtime/library';
import { logger } from './scheduler-logger.service';

type SchedulerStats = {
  lastExecutionAt: string;
  totalExecutions: number;
  isEnabled: boolean;  // Changed from isRunning
  currentJobId: number;
};

const STATS_KEY = "scheduler-stats";

export const brokerageScheduler = restate.object({
  name: "BrokerageScheduler",
  handlers: {
    // ✅ Main execution handler - Cron થી automatically trigger થશે
    execute: async (ctx: restate.ObjectContext) => {
      const now = new Date().toISOString();

      const stats = await ctx.get<SchedulerStats>(STATS_KEY) || {
        lastExecutionAt: "",
        totalExecutions: 0,
        isEnabled: true,  // Default enabled
        currentJobId: 0
      };

      const jobId = stats.currentJobId + 1;

      // Start job logging
      logger.startJobLogging(jobId);
      logger.info("=".repeat(100));
      logger.info(`✅ Brokerage Scheduler Execution Started | JobID: ${jobId} | Time: ${now}`);
      logger.info(`📅 Triggered by Restate Cron Schedule`);
      logger.info("=".repeat(100));

      // ✅ Check if scheduler is enabled (manual control)
      if (!stats.isEnabled) {
        logger.warn(`⏸️ Scheduler is disabled, skipping execution`);
        logger.finishJobLogging({
          status: 'COMPLETED',
          additionalData: { message: 'Scheduler disabled - execution skipped' }
        });
        
        return {
          success: true,
          executedAt: now,
          jobId: jobId,
          totalExecutions: stats.totalExecutions,
          message: "Scheduler is disabled",
          skipped: true
        };
      }

      // Update stats
      const updatedStats: SchedulerStats = {
        lastExecutionAt: now,
        totalExecutions: stats.totalExecutions + 1,
        isEnabled: true,
        currentJobId: jobId
      };
      ctx.set(STATS_KEY, updatedStats);

      let processedUsers = 0;
      let skippedUsers = 0;
      let totalTrades = 0;
      let totalAmount = 0;

      try {
        // Create PK Mast records
        logger.info(`\n0️⃣ Creating PK Mast records...`);
        try {
          await createPkMastRecords(jobId);
          logger.success('PK Mast records created successfully');
        } catch (err) {
          logger.error('Failed to create PK Mast records', err);
          throw err;
        }

        // Date range - ⚠️ DYNAMIC DATE (adjust as needed)
        const startDateTime = new Date('2025-12-31T00:00:00.000Z');
        const endDateTime = new Date('2025-12-31T23:59:59.999Z');
        const timestamp = new Date();

        logger.info(`📅 Date Range: ${startDateTime.toISOString()} to ${endDateTime.toISOString()}`);

        // Fetch users
        logger.info(`\n1️⃣ Fetching MT5 users...`);
        let loginUsers;
        try {
          loginUsers = await prisma.mt5_users.findMany({
            where: {
              Agent: { not: BigInt(0) },
              Group: { contains: 'real' }
            },
            select: { Login: true, Agent: true, Group: true }
          });
          logger.success(`Found ${loginUsers.length} users matching criteria`);
        } catch (err) {
          logger.error('Failed to fetch MT5 users', err);
          throw err;
        }

        if (loginUsers.length === 0) {
          logger.warn(`⚠️ No users found`);
          
          logger.finishJobLogging({
            status: 'COMPLETED',
            totalUsers: 0,
            processedUsers: 0,
            skippedUsers: 0
          });

          return {
            success: true,
            executedAt: now,
            jobId: jobId,
            totalExecutions: updatedStats.totalExecutions,
            message: "No users found to process"
          };
        }

        // Fetch distributions
        logger.info(`\n2️⃣ Fetching all distributions...`);
        let distributions;
        try {
          distributions = await prisma.distribution.findMany();
          logger.success(`Found ${distributions.length} distributions`);
        } catch (err) {
          logger.error('Failed to fetch distributions', err);
          throw err;
        }

        // Prepare trading pairs
        logger.info(`\n3️⃣ Preparing trading pairs...`);
        type TradingPairsKeys = keyof typeof tradingPairs;
        const tradingPairsRecord: Record<string, string[]> = {};

        (Object.keys(tradingPairs) as TradingPairsKeys[]).forEach(key => {
          tradingPairsRecord[key] = tradingPairs[key].split(',').map(p => p.trim());
        });
        logger.success(`Trading pairs prepared: ${Object.keys(tradingPairsRecord).join(', ')}`);

        logger.info(`\n4️⃣ Processing ${loginUsers.length} users...`);

        // Process users
        for (const user of loginUsers) {
          await ctx.sleep(60);
          const loginUser = user.Login;
          const groupName = user.Group ? user.Group.trim().replace(/\\\\/g, '\\').replace('real\\', '') : null;
          
          logger.info(`\n${'─'.repeat(80)}`);
          logger.info(`👤 Processing user: Login=${loginUser.toString()}, Group=${user.Group}`);
          
          if (!groupName) {
            logger.warn(`No valid group name - SKIPPED`, { 
              loginUser: loginUser.toString() 
            });
            skippedUsers++;
            continue;
          }

          const distribution = distributions.find(d => d.group === groupName);
          if (!distribution) {
            logger.warn(`No distribution found for group '${groupName}' - SKIPPED`, { 
              loginUser: loginUser.toString(), 
              groupName 
            });
            skippedUsers++;
            continue;
          }

          const distributionCols = [
            distribution.col1, distribution.col2, distribution.col3,
            distribution.col4, distribution.col5, distribution.col6,
            distribution.col7, distribution.col8, distribution.col9,
            distribution.col10, distribution.col11
          ];

          const percentages: string[] = [];
          let grpcount = 0;

          for (const col of distributionCols) {
            if (!col || col === 'NULL') break;
            const colStr = String(col).trim();
            if (colStr === '0' || colStr === '') break;
            percentages.push(colStr);
            grpcount++;
          }

          logger.info(`📈 Extracted percentages: [${percentages.join(', ')}], grpcount=${grpcount}`);

          if (grpcount === 0 || percentages.length === 0) {
            logger.warn(`No valid percentages found - SKIPPED`, { 
              loginUser: loginUser.toString() 
            });
            skippedUsers++;
            continue;
          }

          try {
            logger.info(`🚀 Calling processLoginUser...`);
            await processLoginUser(
              loginUser,
              grpcount,
              percentages,
              startDateTime,
              endDateTime,
              tradingPairsRecord,
              timestamp.getTime(),
              jobId
            );
            processedUsers++;
            logger.success(`User processed successfully`);
          } catch (err) {
            logger.error(`Error processing loginUser ${loginUser.toString()}`, err, { 
              loginUser: loginUser.toString(), 
              groupName, 
              grpcount 
            });
            skippedUsers++;
          }
        }

        logger.info(`\n5️⃣ Aggregating email amounts...`);
        
        let emailSumsFromTables;
        try {
          emailSumsFromTables = await prisma.brockrage_transaction_list.groupBy({
            by: ['email'],
            where: {
              job_id: jobId,
              email: {
                not: null,
                notIn: [''],
              },
            },
            _sum: {
              amount: true,
            },
          });
          logger.success(`Found ${emailSumsFromTables.length} unique emails with transactions`);
        } catch (err) {
          logger.error('Failed to aggregate email amounts', err);
          throw err;
        }

        const pkTranInsertData: any[] = [];
        const emailAmountSums: { [key: string]: number } = {};

        const allEmails = emailSumsFromTables.map(row => row.email).filter(Boolean) as string[];
        
        const ibUsersMap = new Map();
        if (allEmails.length > 0) {
          try {
            const ibUsers = await prisma.ib_users.findMany({
              where: { email: { in: allEmails } },
              select: { id: true, email: true }
            });
            ibUsers.forEach(user => {
              if (user.email) ibUsersMap.set(user.email, user.id);
            });
          } catch (err) {
            logger.error('Failed to fetch ib_users', err);
            throw err;
          }
        }

        const allIbIds = Array.from(ibUsersMap.values());
        const pkMastMap = new Map();
        if (allIbIds.length > 0) {
          try {
            const pkMasts = await prisma.brockrage_pk_mast.findMany({
              where: { ib_id: { in: allIbIds } },
              select: { ib_id: true, pk_id: true }
            });
            pkMasts.forEach(mast => pkMastMap.set(mast.ib_id, mast.pk_id));
          } catch (err) {
            logger.error('Failed to fetch pk_mast records', err);
            throw err;
          }
        }

        for (const row of emailSumsFromTables) {
          if (!row.email) continue;
          
          const email = row.email;
          const totalAmountDecimal = row._sum.amount ?? new Decimal(0);
          const totalAmountNum = totalAmountDecimal instanceof Decimal 
            ? parseFloat(totalAmountDecimal.toString()) 
            : totalAmountDecimal;
          
          emailAmountSums[email] = totalAmountNum;
          totalAmount += totalAmountNum;
          
          const ib_id = ibUsersMap.get(email);
          if (!ib_id) continue;
          
          const pk_id = pkMastMap.get(ib_id);
          if (!pk_id) continue;
          
          pkTranInsertData.push({
            pk_id: pk_id,
            ref_id: null,
            ib_id: ib_id,
            type: 'D',
            tran_from: String(jobId),
            tran_to: pk_id,
            amount: totalAmountNum,
            net_amount: totalAmountNum,
            balance: 0,
            transaction_time: new Date(),
            comment: null,
            ip: '127.0.0.1',
            tran_type: 'brokerage',
            our_transaction_id: null,
            created_at: new Date(),
            updated_at: new Date()
          });
        }

        logger.info(`\n6️⃣ Inserting PK transactions...`);
        
        const emailToTranId: { [key: string]: number } = {};
        let affectedRows = 0;

        if (pkTranInsertData.length > 0) {
          try {
            await prisma.brockrage_pk_tran.createMany({
              data: pkTranInsertData,
            });
            
            logger.success(`Inserted ${pkTranInsertData.length} records into brockrage_pk_tran`);

            const lastInsertedRecords = await prisma.brockrage_pk_tran.findMany({
              where: { tran_from: String(jobId) },
              orderBy: { id: 'desc' },
              take: pkTranInsertData.length,
              select: { id: true, ib_id: true },
            });

            const ibIdToEmailMap = new Map();
            ibUsersMap.forEach((id, email) => ibIdToEmailMap.set(id, email));

            lastInsertedRecords.forEach((record) => {
              const email = ibIdToEmailMap.get(record.ib_id);
              if (email) {
                emailToTranId[email] = record.id;
              }
            });

            logger.info(`\n7️⃣ Updating transaction list with trans_id...`);
            
            for (const [email, tranId] of Object.entries(emailToTranId)) {
              const result = await prisma.brockrage_transaction_list.updateMany({
                where: {
                  email: email,
                  job_id: jobId,
                },
                data: {
                  trans_id: tranId,
                },
              });
              affectedRows += result.count;
            }
            
            logger.success(`Updated ${affectedRows} rows in brockrage_transaction_list`);
          } catch (err) {
            logger.error('Failed during PK transaction insertion/update', err);
            throw err;
          }
        }

        logger.info(`\n8️⃣ Updating wallet balances...`);
        try {
          await updateMultipleWallet(jobId);
          logger.success('Wallet balances updated successfully');
        } catch (err) {
          logger.error('Failed to update wallet balances', err);
          throw err;
        }

        try {
          const tradeCount = await prisma.brockrage_transaction_list.count({
            where: { job_id: jobId }
          });
          totalTrades = tradeCount;
        } catch (err) {
          logger.error('Failed to count trades', err);
        }

        logger.info(`\n${'='.repeat(100)}`);
        logger.info(`📄 Brokerage processing complete`);
        logger.info(`📊 Summary:`);
        logger.info(`   - Job ID: ${jobId}`);
        logger.info(`   - Total users found: ${loginUsers.length}`);
        logger.info(`   - Users processed: ${processedUsers}`);
        logger.info(`   - Users skipped: ${skippedUsers}`);
        logger.info(`   - Total trades: ${totalTrades}`);
        logger.info(`   - Total amount: ${totalAmount.toFixed(4)}`);
        logger.info(`   - PK Tran records inserted: ${pkTranInsertData.length}`);
        logger.info(`   - Transaction list updated: ${affectedRows} rows`);
        logger.info(`${'='.repeat(100)}\n`);

        logger.finishJobLogging({
          status: 'COMPLETED',
          totalUsers: loginUsers.length,
          processedUsers,
          skippedUsers,
          totalTrades,
          totalAmount,
          additionalData: {
            pk_tran_inserted: pkTranInsertData.length,
            trans_id_updated: affectedRows,
            email_amount_sums: emailAmountSums
          }
        });

        // ✅ NO SCHEDULING CODE - Config file handles it!
        return {
          success: true,
          executedAt: now,
          jobId: jobId,
          totalExecutions: updatedStats.totalExecutions,
          usersProcessed: processedUsers,
          usersSkipped: skippedUsers,
          totalTrades,
          totalAmount,
          message: 'Data inserted successfully',
          job_status: 'Completed',
        };

      } catch (error) {
        logger.error(`❌ Fatal error in job execution`, error, { jobId });
        
        logger.finishJobLogging({
          status: 'FAILED',
          totalUsers: 0,
          processedUsers,
          skippedUsers,
          totalTrades,
          totalAmount
        });
        
        throw error;
      }
    },

    // ✅ Enable the scheduler
    enable: async (ctx: restate.ObjectContext) => {
      console.log("✅ Enabling scheduler...");
      const stats = await ctx.get<SchedulerStats>(STATS_KEY) || {
        lastExecutionAt: "",
        totalExecutions: 0,
        isEnabled: true,
        currentJobId: 0
      };
      
      stats.isEnabled = true;
      ctx.set(STATS_KEY, stats);

      return {
        success: true,
        message: "Scheduler enabled - will run on next cron trigger",
        currentTime: new Date().toISOString()
      };
    },

    // ✅ Disable the scheduler
    disable: async (ctx: restate.ObjectContext) => {
      console.log("⏸️ Disabling scheduler...");
      const stats = await ctx.get<SchedulerStats>(STATS_KEY);
      if (stats) {
        stats.isEnabled = false;
        ctx.set(STATS_KEY, stats);
      }
      return {
        success: true,
        message: "Scheduler disabled - will skip future cron triggers",
        currentTime: new Date().toISOString(),
        lastJobId: stats?.currentJobId || 0
      };
    },

    // ✅ Get status
    getStatus: restate.handlers.object.shared(
      async (ctx: restate.ObjectSharedContext) => {
        const stats = await ctx.get<SchedulerStats>(STATS_KEY);
        if (!stats) {
          return {
            message: "Scheduler has not been initialized yet",
            totalExecutions: 0,
            isEnabled: true,
            currentJobId: 0,
            currentTime: new Date().toISOString()
          };
        }
        return {
          lastExecutionAt: stats.lastExecutionAt,
          totalExecutions: stats.totalExecutions,
          isEnabled: stats.isEnabled,
          currentJobId: stats.currentJobId,
          status: stats.isEnabled ? "ENABLED" : "DISABLED",
          currentTime: new Date().toISOString(),
          note: "Scheduler runs via cron config: 0 * * * * (hourly)"
        };
      }
    ),

    // ✅ Reset scheduler
    reset: async (ctx: restate.ObjectContext) => {
      ctx.clearAll();
      return {
        success: true,
        message: "Scheduler stats reset successfully"
      };
    }
  },
});