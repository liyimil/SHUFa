export const SMS_PROVIDER = Symbol("SMS_PROVIDER");

export interface SmsSendResult {
  messageId: string;
  success: boolean;
}

export interface SmsProvider {
  sendVerificationCode(
    phone: string,
    code: string,
    expiresMinutes: number,
  ): Promise<SmsSendResult>;
}
