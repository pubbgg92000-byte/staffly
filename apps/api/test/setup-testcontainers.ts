/**
 * Vitest globalSetup for integration tests.
 *
 * Testcontainers auto-detects the Docker socket from DOCKER_HOST / the default
 * unix socket — but it does NOT read the Docker CLI *context*. On machines
 * running Colima (or any non-Docker-Desktop runtime) the default
 * `/var/run/docker.sock` can be missing or a dead symlink, which makes
 * Testcontainers fail with "Could not find a working container runtime
 * strategy".
 *
 * This setup transparently points Testcontainers at a discovered Colima socket
 * when DOCKER_HOST is unset and the default socket is unusable, so the plain
 * `pnpm test:integration` works without per-invocation env vars. On CI /
 * Docker-Desktop where the default socket works, it is a no-op.
 */
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function socketUsable(p: string): boolean {
  try {
    return existsSync(p) && statSync(p).isSocket();
  } catch {
    return false;
  }
}

export default function setup(): void {
  if (process.env.DOCKER_HOST) return; // explicit override wins

  const defaultSock = "/var/run/docker.sock";
  if (socketUsable(defaultSock)) return; // Docker Desktop / CI — nothing to do

  const colima = path.join(homedir(), ".colima", "default", "docker.sock");
  if (socketUsable(colima)) {
    process.env.DOCKER_HOST = `unix://${colima}`;
    // Ryuk (the reaper) tries to bind-mount the socket, which Colima's mount
    // layer rejects; disable it — each CI/run tears down its own containers.
    process.env.TESTCONTAINERS_RYUK_DISABLED = "true";
    process.env.TESTCONTAINERS_DOCKER_SOCKET_OVERRIDE = colima;
  }
}
