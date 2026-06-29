# Remote Connection + Remote Server Plan

## Worktree

Implementation work is isolated in a separate Git worktree and branch:

```txt
/home/shashank/personal/archimedes-feat-remote-connection-support
feat/remote-connection-support
```

## Context

The goal is to design first-class remote connection support for the Windows Tauri app, with a specific focus on a VS Code Server-like model: when a user connects to WSL or an SSH host, Archimedes can install/start a small remote-side server and communicate with it from the local native app.

This document intentionally answers the hardest architecture questions first. Smaller UI and implementation questions are left until the remote-server model is clear.

## Current app understanding

- The app is a Tauri 2 desktop app with a React/Vite frontend.
- The Rust backend is currently minimal: `src-tauri/src/lib.rs` initializes Tauri and `tauri-plugin-opener` only.
- Current Tauri permissions are limited to `opener:default` in `src-tauri/capabilities/default.json`.
- `src/lib/storage.ts` centralizes browser-side persistence through `AppStorage`; connection profiles can reuse this pattern.
- The current frontend talks directly to local LLM providers, especially Ollama at `http://localhost:11434`.
- Remote-server support should be introduced as a connection/runtime layer first, not embedded directly inside provider classes.

## Hardest questions answered first

### 1. What does the VS Code Server actually do?

VS Code Remote keeps the UI local and moves machine-specific work to a server process on the target machine.

Conceptually, the flow is:

1. The local app connects to a target through SSH, WSL, a container bridge, or another transport.
2. It detects the target OS, CPU architecture, shell, home directory, and existing server install state.
3. It checks whether a server binary/package matching the local client build is already installed.
4. If missing or outdated, it installs the matching server under the remote user's home directory.
5. It starts the remote server as the remote user.
6. It opens a private channel to that server through the authenticated transport.
7. The local UI sends high-level requests to the remote server instead of trying to do all remote work via one-off shell commands.

The important pattern is not "run a public server on the remote machine." The pattern is:

- user-scoped install;
- versioned by client build;
- started on demand;
- reachable only through SSH/WSL/tunnel;
- owned by the local app's connection lifecycle;
- powerful enough to perform remote operations consistently.

### 2. Should Archimedes use this model?

Recommended answer: yes, but only after separating two layers:

1. **Transport/probe layer** — enough to detect WSL/SSH, authenticate, install, start, stop, and check health.
2. **Remote capability layer** — actual remote operations such as command execution, file access, project indexing, provider access, or agent runtime.

For this application, a remote server is justified if Archimedes eventually needs any of these:

- persistent remote session state;
- consistent behavior across WSL and SSH;
- streaming command execution;
- remote workspace or file access;
- remote project context for an agent;
- remote tool execution;
- remote LLM/provider discovery or access;
- long-running operations independent of a single shell command.

A remote server is not necessary if the only goal is to test connectivity or run a fixed command once. However, since the requested direction is explicitly VS Code Server-like, the plan should design the server foundation now and keep the first capability set intentionally small.

### 3. What should the Archimedes remote server be?

Recommended answer: a standalone Rust binary, for example:

```txt
archimedes-remote-server
```

Why a Rust binary:

- The native app already has a Rust/Tauri backend.
- A Rust server can be shipped as a single binary without requiring Node/Python on the remote host.
- It can be built per target OS/architecture.
- It can share protocol types with the Tauri backend if structured as a Cargo workspace.
- It can support HTTP/WebSocket or JSON-RPC cleanly.
- It gives a better security and packaging story than uploading scripts.

Initial target matrix:

```txt
linux-x64      required first for WSL and common SSH hosts
linux-arm64    likely next if remote hosts include ARM machines
macos-arm64    later, only if SSH-to-macOS matters
macos-x64      later
windows-x64    later, only if SSH-to-Windows matters
```

The first implementation should prioritize WSL Linux x64 and SSH Linux x64.

### 4. Where is the server installed remotely?

Recommended install layout:

```txt
~/.archimedes-server/
  bin/
    <server-version>/
      <platform>/
        archimedes-remote-server
        manifest.json
  logs/
    archimedes-remote-server-YYYYMMDD.log
  tmp/
  sessions/
```

Example:

```txt
~/.archimedes-server/bin/0.1.0/linux-x64/archimedes-remote-server
```

Rules:

- Install under the remote user's home directory.
- Never require `sudo`.
- Use versioned directories so upgrades are side-by-side and safe.
- Keep a small number of older versions for rollback/troubleshooting.
- Write logs under `~/.archimedes-server/logs`.
- Store per-session ephemeral files under `tmp/` or `sessions/`.
- Do not store session auth tokens persistently.

### 5. How does the local app install it over SSH?

Recommended SSH bootstrap flow:

1. User selects an SSH profile, preferably an existing SSH config alias.
2. Local Tauri backend probes connectivity:

   ```bash
   ssh -o BatchMode=yes -o ConnectTimeout=5 <host> 'uname -sm; command -v sh; printf %s "$HOME"'
   ```

3. Backend maps OS/CPU to a supported artifact:

   ```txt
   Linux x86_64 -> linux-x64
   Linux aarch64 -> linux-arm64
   ```

4. Backend checks current install:

   ```bash
   ssh <host> '~/.archimedes-server/bin/<version>/<platform>/archimedes-remote-server --version'
   ```

5. If missing/mismatched, backend creates directories:

   ```bash
   ssh <host> 'mkdir -p ~/.archimedes-server/bin/<version>/<platform> ~/.archimedes-server/logs ~/.archimedes-server/tmp'
   ```

6. Backend uploads the binary using one of:

   - `scp`;
   - `sftp`;
   - `ssh <host> 'cat > remote-file'` with local stdin.

7. Backend sets permissions:

   ```bash
   ssh <host> 'chmod 700 ~/.archimedes-server/bin/<version>/<platform>/archimedes-remote-server'
   ```

8. Backend verifies checksum:

   ```bash
   ssh <host> 'sha256sum ~/.archimedes-server/bin/<version>/<platform>/archimedes-remote-server'
   ```

9. Backend starts the server with a session token and a loopback bind address.

The first implementation should use the system `ssh` binary rather than embedding a Rust SSH library. Reasons:

- It reuses the user's existing `~/.ssh/config`, known hosts, agent, keys, jump hosts, and enterprise settings.
- It avoids implementing host-key prompts and authentication UX inside the app.
- It matches user expectations from VS Code Remote SSH.

A Rust SSH crate can be evaluated later if the app needs deep native SSH control.

### 6. How does installation work for WSL?

Recommended WSL bootstrap flow:

1. Local backend lists distros:

   ```powershell
   wsl.exe --list --verbose
   ```

2. User selects a distro.
3. Backend probes OS/CPU:

   ```powershell
   wsl.exe -d <distro> -- uname -sm
   ```

4. Backend resolves the WSL home directory:

   ```powershell
   wsl.exe -d <distro> -- sh -lc 'printf %s "$HOME"'
   ```

5. Backend installs the same Linux artifact under:

   ```txt
   ~/.archimedes-server/bin/<version>/<platform>/
   ```

6. Backend starts the server using `wsl.exe -d <distro> -- ...`.

Binary copy options, in order of preference:

1. Use `wsl.exe` with stdin redirection to write bytes inside the distro.
2. Copy to a Windows temp file, translate the path with `wslpath`, then copy inside WSL.
3. Use `\\wsl$\<distro>\...` only if reliable enough in packaged Windows builds.

WSL and SSH should converge after bootstrap: both should produce a running `archimedes-remote-server` with a URL/channel that the local app can call.

### 7. How does the local app communicate with the server?

Recommended answer: HTTP JSON for request/response plus WebSocket later for streaming, always over a private local-only channel.

For SSH:

1. Remote server binds to `127.0.0.1:<remotePort>` on the remote host.
2. Local backend creates a local port forward:

   ```bash
   ssh -N -L 127.0.0.1:<localPort>:127.0.0.1:<remotePort> <host>
   ```

3. Local backend talks to:

   ```txt
   http://127.0.0.1:<localPort>
   ```

4. Frontend should not own this tunnel directly; the Tauri backend should own it and expose typed commands/events.

For WSL:

Option A — use Windows-to-WSL localhost forwarding:

```txt
remote server in WSL: 127.0.0.1:<remotePort>
local backend calls:  127.0.0.1:<remotePort>
```

Option B — query WSL IP and connect to it:

```bash
wsl.exe -d <distro> -- hostname -I
```

Option C — stdio JSON-RPC over `wsl.exe`.

Recommended WSL v1: try HTTP loopback first because it matches the SSH model. Keep stdio JSON-RPC as fallback if Windows/WSL networking is unreliable.

### 8. Why not bind the remote server to `0.0.0.0`?

Do not expose the remote server publicly.

The server should bind only to loopback because:

- SSH/WSL already provide the trusted transport boundary.
- A public bind creates unnecessary network attack surface.
- The server will eventually be powerful enough to run tools or access files.
- Enterprise environments may block or flag unexpected listening services.

The safe default is:

```txt
127.0.0.1 only + authenticated tunnel + per-session token
```

### 9. How should requests be authenticated?

Use a per-session bearer token even though the channel is private.

Startup flow:

1. Tauri backend generates a random high-entropy token.
2. Backend starts the remote server with the token supplied through one of:
   - environment variable;
   - protected temp file;
   - stdin bootstrap message.
3. Every request includes:

   ```http
   Authorization: Bearer <token>
   ```

4. Remote server rejects all requests without the token.
5. Token is never persisted and never printed in logs.

This protects against accidental same-user local access on the remote host and makes port/tunnel mistakes less dangerous.

### 10. What API should the first server expose?

Keep the protocol small, explicit, and versioned.

Initial endpoints:

```txt
GET  /health
POST /probe
GET  /logs/recent
POST /shutdown
```

Possible later endpoint:

```txt
POST /commands/run
```

`GET /health` returns:

```json
{
  "serverVersion": "0.1.0",
  "protocolVersion": 1,
  "platform": "linux-x64",
  "os": "linux",
  "arch": "x86_64",
  "user": "remote-user",
  "hostname": "remote-host",
  "uptimeMs": 12345,
  "capabilities": ["health", "probe", "logs", "shutdown"]
}
```

`POST /probe` runs a fixed diagnostic set, not arbitrary shell by default:

```json
{
  "checks": [
    { "name": "shell", "ok": true, "detail": "/bin/sh" },
    { "name": "homeWritable", "ok": true },
    { "name": "tmpWritable", "ok": true },
    { "name": "cwd", "ok": true, "detail": "/home/user" }
  ]
}
```

`POST /commands/run` should only be added if explicitly approved. If added, it must include:

- command + args as structured fields, not an opaque shell string where possible;
- working directory;
- timeout;
- environment allowlist;
- stdout/stderr limits;
- cancellation id;
- explicit user initiation from the UI.

### 11. How are versions and upgrades handled?

Use a client/server compatibility contract.

Recommended rules:

- The desktop app has a required remote server version or compatibility range.
- On connect, the backend checks `/health` or `--version`.
- If incompatible, install the required version side-by-side.
- Do not overwrite a running binary.
- Keep at most N old versions, for example 2 or 3.
- Verify checksums before executing uploaded binaries.
- Include a `manifest.json` next to each binary:

```json
{
  "serverVersion": "0.1.0",
  "protocolVersion": 1,
  "platform": "linux-x64",
  "sha256": "...",
  "builtAt": "..."
}
```

### 12. What owns lifecycle and cleanup?

The Tauri backend should own the lifecycle.

Local backend responsibilities:

- load connection profile;
- probe transport;
- install/update server;
- start server;
- create and monitor tunnel if SSH;
- poll `/health`;
- emit status updates to React;
- collect startup logs on failure;
- disconnect cleanly;
- clean up local tunnel processes;
- optionally request remote `/shutdown`.

Remote server responsibilities:

- start quickly;
- bind loopback only;
- authenticate every request;
- expose small versioned API;
- run supported operations;
- log startup/errors;
- gracefully exit on `/shutdown`;
- avoid daemonizing invisibly in v1.

### 13. What is the security boundary?

The remote server runs as the remote user. It can do what that user can do. Treat it as powerful.

Security constraints for the first server implementation:

- Never use `sudo` for install or startup.
- Bind only to `127.0.0.1`.
- Require bearer token for every request.
- Do not store SSH passwords, private keys, or session tokens in localStorage.
- Prefer SSH config, SSH agent, and OS keychain behavior.
- Do not expose arbitrary command execution by default.
- If command execution is added, require visible user initiation, timeouts, output limits, and cancellation.
- Redact tokens, API keys, environment variables, usernames/hostnames where appropriate in logs and analytics.
- Keep install directory user-owned and non-world-writable.
- Treat remote logs as potentially sensitive.

### 14. What happens when startup fails?

Startup failures should be first-class UX, not hidden in logs.

The local backend should classify failures:

- SSH authentication failed.
- Host key verification required/failed.
- Remote OS/architecture unsupported.
- Upload failed.
- Checksum mismatch.
- Permission denied writing install directory.
- Server process exited immediately.
- Port forward failed.
- Health check timed out.
- Token rejected.

The UI should show:

- connection phase;
- failed command summary;
- stderr snippet;
- suggested fix;
- link/button to copy diagnostics.

## Recommended architecture

```txt
React UI
  ↓ typed frontend service
src/lib/remote/remoteConnectionClient.ts
  ↓ Tauri invoke/events
Tauri Rust backend
  ├─ profile/status command handlers
  ├─ SshTransportManager
  ├─ WslTransportManager
  ├─ RemoteServerInstaller
  ├─ RemoteServerProcessManager
  ├─ RemoteServerHttpClient
  └─ status/event emitter
       ↓ ssh/wsl/tunnel
archimedes-remote-server on target
```

## Frontend plan

Add types in `src/types.ts`:

- `RemoteConnectionKind = 'local' | 'wsl' | 'ssh'`
- `RemoteConnectionProfile`
- `WslConnectionProfile`
- `SshConnectionProfile`
- `RemoteConnectionStatus`
- `RemoteServerStatus`
- `RemoteServerInstallState`
- `RemoteConnectionPhase`

Add services:

- `src/lib/remote/remoteConnectionClient.ts` — wraps Tauri `invoke` calls and event subscriptions.
- `src/lib/remote/remoteConnectionFactory.ts` — exposes a shared connection service.

Add hooks:

- `src/hooks/useRemoteConnections.ts` — profiles, connect/disconnect, status, errors.
- `src/hooks/useRemoteConnectionForm.ts` — form validation.

Add UI:

- `src/components/RemoteConnectionsPanel.tsx` — list profiles, add/edit/delete, connect/disconnect, show install/server status.

## Tauri backend plan

Add modules under `src-tauri/src/remote/`:

- `mod.rs` — command registration and shared exports.
- `models.rs` — serializable request/response structs.
- `ssh.rs` — SSH probe, upload, command execution, tunnel process.
- `wsl.rs` — WSL distro detection, WSL command execution, WSL server startup.
- `installer.rs` — platform detection, binary selection, checksum verification, remote install.
- `server.rs` — remote server session, health polling, shutdown.
- `ports.rs` — local free-port allocation.

Expose Tauri commands:

- `remote_list_wsl_distros() -> Vec<WslDistro>`
- `remote_test_profile(profile) -> RemoteConnectionTestResult`
- `remote_connect(profile) -> RemoteConnectResult`
- `remote_get_status(connection_id) -> RemoteConnectionStatus`
- `remote_run_probe(connection_id) -> RemoteProbeResult`
- `remote_get_logs(connection_id) -> RemoteLogResult`
- `remote_disconnect(connection_id) -> RemoteDisconnectResult`

Update `src-tauri/capabilities/default.json` for new command permissions.

## Remote server crate plan

Add a separate binary crate:

```txt
remote-server/
  Cargo.toml
  src/
    main.rs
    api.rs
    auth.rs
    health.rs
    probe.rs
    logs.rs
    shutdown.rs
```

Consider a Cargo workspace so protocol structs can be shared later:

```txt
crates/
  remote-protocol/
  remote-server/
src-tauri/
```

For v1, duplication of small structs is acceptable if workspace restructuring is too disruptive.

Candidate dependencies to evaluate:

- `axum` + `tokio` for HTTP and later WebSocket support;
- `serde`/`serde_json` for protocol;
- `tracing`/`tracing-subscriber` for logs;
- `anyhow` or structured error enums for server internals.

## Persistence plan

Use existing `AppStorage` style for non-secret profile data:

```txt
archimedes-agent.remoteConnections.v1
```

Store:

- profile id;
- display name;
- kind: WSL/SSH;
- WSL distro name; or
- SSH host alias / optional host fields;
- last selected profile id;
- non-sensitive preferences.

Do not store:

- passwords;
- private keys;
- session bearer tokens;
- passphrases.

## Implementation stages

### Stage 1 — Transport probes and profiles

- Add profile types and storage.
- Add WSL distro listing command.
- Add SSH profile test using system `ssh`.
- Add settings UI for profiles and status.
- No remote server install yet, unless needed for vertical-slice testing.

### Stage 2 — Remote server binary

- Add `archimedes-remote-server` binary crate.
- Implement `/health`, `/probe`, `/logs/recent`, `/shutdown`.
- Add token auth.
- Add loopback-only binding.
- Add basic file logging.
- Add local manual run docs.

### Stage 3 — WSL server bootstrap

- Detect WSL distro OS/arch.
- Copy Linux server binary into WSL install path.
- Verify permissions/checksum.
- Start server inside WSL.
- Connect to `/health`.
- Show server status in UI.

### Stage 4 — SSH server bootstrap

- Detect SSH remote OS/arch.
- Upload binary.
- Verify checksum/chmod.
- Start remote server.
- Open SSH local port forward.
- Connect to `/health`.
- Disconnect cleanly.

### Stage 5 — Minimal remote capabilities

- Add fixed diagnostic probe.
- Add recent log retrieval.
- Decide whether arbitrary user-initiated command execution is allowed.
- Add cancellation/timeouts if commands are added.

## Files to modify

- `package.json` — possible scripts for building/copying remote server artifacts.
- `src/types.ts` — remote profile/status/server types.
- `src/lib/storage.ts` — persist remote connection profiles.
- `src/lib/remote/*` — frontend remote client/factory.
- `src/hooks/useRemoteConnections.ts` — connection state orchestration.
- `src/components/RemoteConnectionsPanel.tsx` — UI.
- `src-tauri/Cargo.toml` — backend dependencies/workspace changes.
- `src-tauri/src/lib.rs` — register remote Tauri commands.
- `src-tauri/src/remote/*` — SSH/WSL/install/session management.
- `src-tauri/capabilities/default.json` — command permissions.
- `remote-server/Cargo.toml` and `remote-server/src/*` — standalone remote server.
- `docs/` — prerequisites, security model, troubleshooting.

## Reuse

- Reuse the Tauri backend entry point in `src-tauri/src/lib.rs`.
- Reuse `AppStorage` patterns from `src/lib/storage.ts` for profile persistence.
- Reuse the user's existing SSH setup through the system `ssh` binary.
- Reuse the same remote server binary for WSL and SSH Linux targets where possible.

## Verification

### WSL

- Detect installed distros.
- Detect OS/architecture.
- Install server in the correct WSL home directory.
- Verify checksum and permissions.
- Start server and call `/health`.
- Run `/probe`.
- Fetch logs.
- Shutdown and reconnect.
- Handle missing WSL/unavailable distro gracefully.

### SSH

- Connect using SSH config alias.
- Handle host key/auth failures clearly.
- Detect OS/architecture.
- Upload and verify server binary.
- Start server on remote loopback.
- Create local tunnel.
- Call `/health` and `/probe`.
- Fetch logs.
- Disconnect and clean up tunnel.

### Security

- Verify server binds loopback only.
- Verify bearer token is required.
- Verify token is not logged or persisted.
- Verify install/start does not use sudo.
- Verify logs do not include secrets.
- Verify arbitrary command execution is absent unless explicitly enabled.

### Packaging

- Verify desktop build can locate bundled remote server artifact.
- Verify Windows installer still builds.
- Verify unsupported platform message is clear.
- Verify remote server version compatibility behavior.

## Open questions for the user

1. Is the remote server model now explicitly in scope for this feature, or should we only design it now and implement probes first?
2. Which target should be implemented first: WSL, SSH Linux, or both in the same milestone?
3. Should SSH profiles be limited to existing `~/.ssh/config` aliases for v1, or should the UI also collect host/user/port?
4. Should the first remote server expose only fixed diagnostics, or should it expose arbitrary user-initiated command execution?
5. Is the long-term goal remote file/workspace access, remote agent/runtime execution, remote LLM/provider access, or all of these?
6. Should remote server binaries be bundled with the app, downloaded from GitHub/releases, or both?
7. What remote platforms/architectures should be supported first beyond WSL/Linux x64?
8. Are there security constraints such as no binary upload, no background processes, audit logging, proxy-only networking, or enterprise SSH restrictions?
9. Do you want this to closely follow VS Code Remote SSH behavior, or only borrow the high-level server/bootstrap architecture?
