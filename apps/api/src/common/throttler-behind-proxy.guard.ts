import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

/**
 * Rate-limit key resolver for requests arriving behind Cloudflare Tunnel →
 * Caddy. By the time a request reaches the API the TCP peer is loopback
 * (Caddy), so `req.ip` alone would bucket every visitor together.
 *
 * Cloudflare sets `CF-Connecting-IP` to the real client at the edge, and Caddy
 * forwards it; the app also enables Express `trust proxy` so `req.ip` resolves
 * the forwarded chain. We prefer `CF-Connecting-IP` (canonical at the edge),
 * then fall back to the resolved `req.ip`. Without this the limiter is either
 * useless (one shared bucket) or harmful (one abuser blocks everyone).
 */
@Injectable()
export class ThrottlerBehindProxyGuard extends ThrottlerGuard {
  protected override async getTracker(
    req: Record<string, unknown>,
  ): Promise<string> {
    const headers = (req.headers ?? {}) as Record<string, unknown>;
    const cf = headers["cf-connecting-ip"];
    if (typeof cf === "string" && cf.length > 0) return cf;
    const ips = req.ips as string[] | undefined;
    if (ips && ips.length > 0) return ips[0]!;
    return (req.ip as string | undefined) ?? "unknown";
  }
}
