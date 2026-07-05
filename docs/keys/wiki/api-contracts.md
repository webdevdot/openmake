# API contracts

Base: `http(s)://<host>:8080/api/v1`. Errors: `{error:{code,message}}` — no
internals. Resource responses are enveloped (`{org}`, `{files}`, …);
register/login/refresh are flat. Auth: `Authorization: Bearer <access JWT>`
(HS256, iss=openmake, 15m). Refresh: httpOnly `om_refresh` cookie
(path=/api/v1/auth) or body `{refreshToken}`. Rate limits: 5/min on
register+login, 200/min global. Non-member resource access → 404.

## REST

| Method+Path | Notes |
|---|---|
| POST /auth/register {email,password≥10,name} | 201 → {user, accessToken, refreshToken} + cookie; creates personal org+project |
| POST /auth/login {email,password} | same shape |
| POST /auth/refresh | cookie or body → rotated pair; reuse of revoked → 401 + revoke-all |
| POST /auth/logout | revokes token, clears cookie → {ok} |
| GET /auth/me | {user} |
| GET /orgs · POST /orgs · GET/PATCH/DELETE /orgs/:id | PATCH admin+, DELETE owner |
| GET/POST /orgs/:id/members · PATCH/DELETE /orgs/:id/members/:userId | admin+; cannot demote last owner |
| GET/POST /orgs/:id/projects · GET/PATCH/DELETE /projects/:id | write = editor+ |
| GET/POST /projects/:id/files · GET/PATCH/DELETE /files/:id | {file(s)}; soft delete; write = editor+ |
| GET /files/:id/snapshot | application/octet-stream — full merged Yjs state |
| GET/POST/PATCH/DELETE skills·agents·workflows under /orgs/:id | builtIn skills global + immutable |
| PUT/GET/DELETE /orgs/:id/providers/:provider | PUT {apiKey,baseUrl?} admin+; GET → {provider,hasKey,baseUrl} — never key material |
| GET /files/:id/components · GET /files/:id/components/:nodeId/context | context = DesignContext + attachments + code versions |
| POST /files/:id/components/:nodeId/attachments | ≥1 of skillId/agentId/workflowId |
| POST /ai/workflows/:id/run {fileId,nodeId,request,framework?} | editor+; decrypts org provider key; persists conversation |
| POST /orgs/:id/api-keys {name,scopes[]} | admin+; plaintext om_ key returned ONCE |
| GET/DELETE /orgs/:id/api-keys(/:keyId) | masked list; revoke |
| POST/GET/PATCH/DELETE /files/:id/comments(/:commentId) | member; PATCH resolves |
| GET /healthz | {status:'ok', db:'up'} |

## WebSocket /sync/:fileId?token=<accessJWT>

y-protocols binary framing (varint type: 0=sync, 1=awareness). Server checks
JWT → file→org → ≥VIEWER, else closes 1008. Bidirectional SyncStep1/2, update
broadcast excluding sender, awareness relay, Postgres persistence + compaction.

## MCP — POST/GET/DELETE /mcp

Auth: `Authorization: Bearer om_…` (ApiKey, sha256 lookup, revocation/expiry
checked). Scope mcp:read = read tools only (writes rejected); mcp:write = all.
Stateless streamable-HTTP transport per request. 19 tools: list_files,
read_document, read_node, create_node, update_node, delete_node, move_node,
create_component, create_instance, get_component_context, attach_intelligence,
list_skills, list_agents, list_workflows, run_workflow, generate_code,
save_generated_code, get_generated_code, search_components. Tool errors return
isError:true, never transport failures.

## CLI (`packages/cli`)

`openmake new <name>` · `openmake export-json <file>` ·
`openmake codegen <file> <nodeId> --framework REACT --out <dir>`
