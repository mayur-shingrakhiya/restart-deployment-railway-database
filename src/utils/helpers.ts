// src/utils/helpers.ts
import { io } from "../socket.server";
import { prisma } from "../db/prisma";
import { logger } from "../services/scheduler-logger.service";

/* -------------------- Interfaces -------------------- */

interface AgentData {
  Login: bigint;
  Group: string;
  Email: string;
}

interface DistributionResult {
  AgentLogin: bigint;
  AgentEmail: string;
}

interface NotificationPayload {
  userId?: string;
  title: string;
  message: string;
  data?: any;
}

/* -------------------- Socket -------------------- */

export function sendNotification(event: string, payload: NotificationPayload) {
  if (!io) return;
  io.emit(event, payload);
}

/* -------------------- Gateways -------------------- */

export function depositGateway() {
  return ["Wire", "LocalExchange", "BTC", "USDT", "ETH"];
}

export function withdrawGateway() {
  return ["LocalExchange", "BTC", "USDT", "ETH"];
}

/* -------------------- Wallet -------------------- */

export function generateWalletId(userId: number): string {
  const userPart = userId.toString().padStart(3, "0");
  const randomPart = Math.floor(10000000 + Math.random() * 90000000);
  return userPart + randomPart;
}

/* -------------------- PK Mast Creation -------------------- */

export async function createPkMastRecords(jobId?: number): Promise<void> {
  logger.info(`💼 createPkMastRecords START`);

  try {
    const ibUsersWithoutPkMast = await prisma.$queryRaw`
      SELECT u.id
      FROM ib_users u
      WHERE NOT EXISTS (
        SELECT 1
        FROM brockrage_pk_mast b
        WHERE b.ib_id = u.id
      )
    ` as Array<{ id: number }>;

    if (ibUsersWithoutPkMast.length === 0) {
      logger.info(`✅ All ib_users already have pk_mast records`);
      return;
    }

    logger.info(`🔨 Creating pk_mast records for ${ibUsersWithoutPkMast.length} users...`);

    const batchSize = 100;
    for (let i = 0; i < ibUsersWithoutPkMast.length; i += batchSize) {
      const batch = ibUsersWithoutPkMast.slice(i, i + batchSize);
      
      const insertData = batch.map(user => ({
        ib_id: user.id,
        pk_id: Math.random().toString(36).substring(2, 13).toUpperCase(),
        pk_balance: 0,
        currency: 'USD',
        ip: '127.0.0.1',
        created_at: new Date(),
        updated_at: new Date(),
      }));

      await prisma.brockrage_pk_mast.createMany({
        data: insertData,
        skipDuplicates: true,
      });
    }

    logger.success(`Created ${ibUsersWithoutPkMast.length} pk_mast records`);
  } catch (err) {
    logger.error(`createPkMastRecords ERROR`, err);
    throw err;
  }
}

/* -------------------- Wallet Balance Update -------------------- */

export async function updateMultipleWallet(jobId?: number): Promise<void> {
  logger.info(`💰 updateMultipleWallet START`);

  try {
    const walletsToUpdate = await prisma.brockrage_pk_tran.findMany({
      where: { tran_from: String(jobId) },
      select: { pk_id: true },
      distinct: ['pk_id'],
    });

    logger.info(`Found ${walletsToUpdate.length} wallets to update`);

    for (const wallet of walletsToUpdate) {
      try {
        await updateSingle(wallet.pk_id, jobId);
      } catch (err) {
        logger.error(`Failed to update wallet ${wallet.pk_id}`, err, { 
          wallet_id: wallet.pk_id 
        });
      }
    }

    logger.success(`updateMultipleWallet DONE - Updated ${walletsToUpdate.length} wallets`);
  } catch (err) {
    logger.error(`updateMultipleWallet ERROR`, err);
    throw err;
  }
}

export async function updateSingle(wallet_id: string, jobId?: number): Promise<void> {
  try {
    let balance = 0;

    const walletDetails = await prisma.brockrage_pk_tran.findMany({
      where: { pk_id: wallet_id },
      orderBy: { transaction_time: 'asc' },
    });

    const updates = [];
    for (const wallet of walletDetails) {
      if (wallet.type === "D") {
        balance = Math.round((balance + wallet.net_amount) * 100) / 100;
      } else {
        balance = Math.round((balance - wallet.net_amount) * 100) / 100;
      }
      
      updates.push(
        prisma.brockrage_pk_tran.update({
          where: { id: wallet.id },
          data: { balance: balance },
        })
      );
    }

    await Promise.all(updates);

    await prisma.brockrage_pk_mast.updateMany({
      where: { pk_id: wallet_id },
      data: { pk_balance: balance },
    });

  } catch (err) {
    logger.error(`updateSingle ERROR for wallet ${wallet_id}`, err, { wallet_id });
    throw err;
  }
}

/* -------------------- Agent Hierarchy -------------------- */

async function getAgentLoginsForMt5(
  login: bigint,
  logins: AgentData[] = [],
  jobId?: number
): Promise<AgentData[]> {
  
  if (!login || login === BigInt(0)) {
    return logins;
  }

  try {
    const agentData = await prisma.mt4_users.findFirst({
      where: { LOGIN: login },
      select: {
        LOGIN: true,
        AGENT_ACCOUNT: true,
        GROUP: true,
        EMAIL: true,
      },
    });

    if (!agentData) {
      return logins;
    }

    if (logins.some((l) => l.Login === agentData.LOGIN)) {
      return logins;
    }

    logins.push({
      Login: agentData.LOGIN,
      Group: agentData.GROUP ?? "",
      Email: agentData.EMAIL ?? "",
    });

    const agentAccountBigInt = BigInt(agentData.AGENT_ACCOUNT);
    
    if (agentAccountBigInt === agentData.LOGIN) {
      return logins;
    }

    return getAgentLoginsForMt5(agentAccountBigInt, logins, jobId);
  } catch (err) {
    // ✅ FIXED: Convert BigInt to string before logging
    logger.error(`getAgentLoginsForMt5 ERROR for login ${login.toString()}`, err, { 
      login: login.toString() 
    });
    throw err;
  }
}

/* -------------------- Main Processor -------------------- */

export async function processLoginUser(
  loginUser: bigint,
  grpcount: number,
  percentages: string[],
  startDateTime: Date,
  endDateTime: Date,
  tradingPairs: Record<string, string[]>,
  timestamp: number,
  jobId?: number
): Promise<void> {

  try {
    /* ---------- User Data ---------- */
    const userData = await prisma.mt5_users.findFirst({
      where: { Login: loginUser },
      select: {
        Agent: true,
        Group: true,
      },
    });

    if (!userData || !userData.Agent || !userData.Group) {
      // ✅ FIXED: Convert BigInt to string before logging
      logger.warn(`❌ Invalid MT5 user data for ${loginUser.toString()}`, { 
        loginUser: loginUser.toString() 
      });
      return;
    }

    const agentLogin = userData.Agent;
    const groupName = userData.Group.replace("real\\", "").trim();

    /* ---------- Agent Hierarchy ---------- */
    const agentLogins = await getAgentLoginsForMt5(agentLogin, [], jobId);

    if (!agentLogins.length) {
      // ✅ FIXED: Convert BigInt to string before logging
      logger.warn(`❌ No agent hierarchy found`, { 
        loginUser: loginUser.toString() 
      });
      return;
    }

    /* ---------- Distribution ---------- */
    const filteredAgents = agentLogins.slice(0, grpcount);
    const distributionResults: DistributionResult[] = [];

    filteredAgents.forEach((agent) => {
      distributionResults.push({
        AgentLogin: agent.Login,
        AgentEmail: agent.Email,
      });
    });

    const selectedPercentageRaw = percentages[distributionResults.length - 1] ?? percentages[percentages.length - 1];
    
    const selectedPercentages = String(selectedPercentageRaw)
      .split("/")
      .map((p) => parseFloat(p.trim()));

    /* ---------- Trades ---------- */
    const trades = await prisma.mt5_deals.findMany({
      where: {
        Login: loginUser,
        VolumeClosed: { gt: BigInt(0) },
        Time: {
          gt: startDateTime,
          lt: endDateTime,
        },
      },
    });

    if (!trades.length) {
      // ✅ FIXED: Convert BigInt to string before logging
      logger.warn(`⚠️ No trades found for login ${loginUser.toString()}`, { 
        loginUser: loginUser.toString() 
      });
      return;
    }

    // ✅ FIXED: Convert BigInt to string before logging
    logger.info(`✅ Found ${trades.length} trades for user ${loginUser.toString()}`);

    /* ---------- Distribution Config ---------- */
    const distributionData = await prisma.distribution.findFirst({
      where: { group: groupName },
    });

    if (!distributionData) {
      // ✅ FIXED: Convert BigInt to string before logging
      logger.warn(`❌ No distribution config for group ${groupName}`, { 
        loginUser: loginUser.toString(),
        groupName 
      });
      return;
    }

    /* ---------- Process Trades ---------- */
    let processedTrades = 0;
    const batchInserts = [];

    for (const trade of trades) {
      const ticketNo = Number(trade.PositionID);
      const lotSize = Number(trade.VolumeClosed) / 10000;
      const symbol = trade.Symbol ?? "";

      let category: string | null = null;

      for (const [key, pairs] of Object.entries(tradingPairs)) {
        if (pairs.some((p) => symbol.includes(p))) {
          category = key;
          break;
        }
      }

      if (!category) {
        continue;
      }

      const rate = Number((distributionData as any)[category]);
      if (!rate) {
        continue;
      }

      const totalAmount = +(rate * lotSize).toFixed(4);

      for (let i = 0; i < distributionResults.length; i++) {
        if (selectedPercentages[i] === undefined) continue;

        const percent = selectedPercentages[i];
        const amount = +((percent / 100) * totalAmount).toFixed(4);

        batchInserts.push({
          email: distributionResults[i].AgentEmail,
          job_id: BigInt(jobId || 0),
          ticket_no: BigInt(ticketNo),
          account_no_trader: loginUser,
          account_no_ib: distributionResults[i].AgentLogin,
          lot_size: lotSize,
          symbol,
          total_usd_to_distribute: totalAmount,
          percentage_to_distribute: percent,
          amount,
          created_at: new Date(timestamp),
          updated_at: new Date(timestamp),
        });
      }

      processedTrades++;
    }

    if (batchInserts.length > 0) {
      await prisma.brockrage_transaction_list.createMany({
        data: batchInserts,
      });
      // ✅ FIXED: Convert BigInt to string before logging
      logger.success(`Inserted ${batchInserts.length} transaction records for user ${loginUser.toString()}`);
    }

    // ✅ FIXED: Convert BigInt to string before logging
    logger.success(`processLoginUser DONE for ${loginUser.toString()} - Processed ${processedTrades} trades`);
  } catch (err) {
    // ✅ FIXED: Convert BigInt to string before logging
    logger.error(`processLoginUser ERROR for ${loginUser.toString()}`, err, { 
      loginUser: loginUser.toString() 
    });
    throw err;
  }
}