declare module "speakeasy" {
  export function generateSecret(opts?: {
    name?: string;
    issuer?: string;
    length?: number;
  }): {
    ascii: string;
    hex: string;
    base32: string;
    otpauth_url?: string;
  };
  export const totp: {
    verify(opts: {
      secret: string;
      encoding: "base32" | "ascii" | "hex";
      token: string;
      window?: number;
    }): boolean;
    (opts: { secret: string; encoding: string }): string;
  };
}
