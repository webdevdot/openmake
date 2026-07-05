# Data model (Prisma, PostgreSQL 16 + pgvector)

21 models, 23 tables (snake_case @@map). Source of truth:
`packages/database/prisma/schema.prisma`.

## Identity & tenancy

- **User** (email unique, argon2id passwordHash, role USER/ADMIN)
- **RefreshToken** (sha256 tokenHash, expiresAt, revokedAt — rotation +
  reuse-detection: reuse of a revoked token revokes all of the user's tokens)
- **Organization** → **OrgMember** (role OWNER/ADMIN/EDITOR/VIEWER,
  unique [orgId,userId]) — registration creates a personal org + project
- **Project** (org-scoped) → **File** (soft delete via deletedAt)

## Document storage (Yjs)

- **DocUpdate** (fileId, seq autoincrement unique per file, update bytes) —
  append-only Yjs update log
- **DocSnapshot** (fileId, upToSeq, state bytes) — compaction target;
  compact() deletes updates ≤ upToSeq in the same transaction

## Component intelligence (the AI-first subsystem)

- **Component** (fileId+nodeId unique, metadata Json) — published components
- **ComponentEmbedding** (vector(1536), raw-SQL managed) — semantic search
- **Skill** (systemPrompt, outputSchema, builtIn flag; 5 seeded built-ins:
  ui-designer, react-engineer, accessibility-reviewer, code-reviewer,
  documentation-writer)
- **Agent** (provider OPENAI/ANTHROPIC/GOOGLE/LOCAL, model, m2m skills)
- **Workflow** (definition Json: ordered steps [{agentId, instructions}])
- **ComponentAttachment** (component ↔ skill/agent/workflow + prompts Json;
  at-least-one enforced in repository layer)
- **GeneratedCode** (component, framework enum ×9, code, version
  auto-increment per component+framework)

## AI & access

- **AiProvider** (org+provider unique, encryptedKey = AES-256-GCM via
  MASTER_ENCRYPTION_KEY, baseUrl for LOCAL)
- **AiConversation** / **AiMessage** (role SYSTEM/USER/ASSISTANT/TOOL)
- **ApiKey** (om_ prefix plaintext returned once; sha256 keyHash stored;
  scopes e.g. mcp:read/mcp:write; expiry + revocation)
- **Comment** (file, optional nodeId anchor, threads via parentId)
- **AuditLog** (append-only; auth events, file create/delete, provider set,
  api-key lifecycle, workflow runs)
