import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";

import type { SmsProvider, SmsSendResult } from "./sms.provider.js";

@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger("ConsoleSmsProvider");

  async sendVerificationCode(
    phone: string,
    code: string,
    expiresMinutes: number,
  ): Promise<SmsSendResult> {
    if (process.env.NODE_ENV === "production") {
      throw new ServiceUnavailableException({
        code: "SMS_PROVIDER_NOT_CONFIGURED",
        message: "A production SMS provider has not been configured.",
      });
    }
    this.logger.log(
      `[DEV] SMS to ${phone.slice(0, 3)}****${phone.slice(-4)}: code=${code}, expires=${expiresMinutes}min`,
    );
    return {
      messageId: `console-${Date.now()}`,
      success: true,
    };
  }
}
