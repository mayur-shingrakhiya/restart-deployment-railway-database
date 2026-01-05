import * as restate from "@restatedev/restate-sdk";
import {sendNotification} from "../utils/helpers";
/**
 * Telegram config
 * (Better to keep token in ENV)
 */
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!;
const TELEGRAM_API_URL = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
const TELEGRAM_ID = process.env.TELEGRAM_ID;

export const kycService = restate.service({
    name: "kycService",

    handlers: {
        remindKyc: async (
            ctx,
            payload: {
                email: string;
                name: string;
            }
        ) => {
            const { email, name } = payload;

            ctx.console.info(`📨 Sending KYC reminder to email=${email}`);

            const message = `
👋 Hello ${name},

⏰ *KYC Reminder*

Please complete your KYC to continue using our services.

👉 Email Id: ${email}

If you have already completed KYC, please ignore this message.
`;

            try {
                const response = await fetch(TELEGRAM_API_URL, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        chat_id: TELEGRAM_ID,
                        text: message,
                        parse_mode: "Markdown",
                    }),
                });

                if (!response.ok) {
                    const errorText = await response.text();
                    ctx.console.error("❌ Telegram API error:", errorText);
                    throw new Error("Telegram message failed");
                }

                sendNotification("notification", {
                    title: "New Message",
                    message: "KYC Notification 🎉",
                });

                ctx.console.info("✅ Telegram KYC reminder sent successfully");

               
                return { success: true };
            } catch (error) {
                ctx.console.error("❌ Failed to send Telegram KYC reminder", error);
                throw error;
            }
        },
    },
});
