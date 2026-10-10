# Database Strategy & PostgreSQL Production Migration Guide

## 1. Overview

The Shared Event Kit Booking System uses **Prisma ORM** as its data access and object-relational abstraction layer.

- **Local Development & Fast CI:** SQLite (`prisma/schema.prisma`, `dev.db`) is used for zero-configuration, zero-dependency, self-contained local development and deterministic automated testing.
- **Production Deployment:** PostgreSQL (`prisma/schema.postgresql.prisma`) is verified and provided as the target production database engine.

---

## 2. Technical Differences: SQLite vs. PostgreSQL

| Feature / Behavior | Local Development (SQLite) | Production (PostgreSQL) | Application Impact & Mitigation |
| :--- | :--- | :--- | :--- |
| **Connection Protocol** | `file:./dev.db` | `postgresql://user:pass@host:5432/db?schema=public` | Configured via `DATABASE_URL` environment variable. |
| **Enum Representation** | Stored as `TEXT`. Prisma Client provides strict TypeScript enums. | Stored as native database types (`CREATE TYPE ... AS ENUM`). | Code accesses enums via `@prisma/client`; behavior is identical in application code. |
| **DateTime Storage** | ISO-8601 string representation (`TEXT`) in UTC. | Native `TIMESTAMP(3)` with timezone support. | All backend queries use JavaScript `Date` / UTC `Instant`; no localized strings stored. |
| **Concurrency Locking** | SQLite applies database-level write locks (`BEGIN IMMEDIATE`). Concurrent overlapping writes are serialized or raise `SQLITE_BUSY`. | PostgreSQL uses MVCC with row-level locks (`SELECT ... FOR UPDATE`), advisory locks, and transaction isolation (`READ COMMITTED` / `SERIALIZABLE`). | Concurrency safety for bookings is enforced at both the transactional query layer and booking reservation serialization logic. |
| **JSON Fields** | Stringified JSON text (`TEXT`) for arrays like `riskReasons`, `affectedItemIds`. | Stringified JSON text or `JsonB`. | Stored as standard JSON text; parsing and validation handled uniformly in domain layer via Zod/TypeScript. |
| **Foreign Key Enforcement**| Enabled in Prisma SQLite via PRAGMA `foreign_keys = ON`. | Native engine-level constraint enforcement. | Prisma enforces relational integrity in both environments. |

---

## 3. Verified PostgreSQL Production Schema

The PostgreSQL production schema is stored in `backend/prisma/schema.postgresql.prisma`. It has been validated using:
```bash
npx prisma validate --schema=prisma/schema.postgresql.prisma
```
Output:
```text
The schema at prisma\schema.postgresql.prisma is valid 🚀
```

---

## 4. Production Migration Steps

To deploy this backend with PostgreSQL in staging/production:

1. **Provision PostgreSQL Database:**
   - Ensure a PostgreSQL instance (v14+) is running.
   - Create an empty database: `createdb event_kit_prod`

2. **Configure Environment:**
   Update your production `.env`:
   ```env
   NODE_ENV=production
   PORT=4000
   DATABASE_URL="postgresql://kit_admin:secure_password@prod-db.internal:5432/event_kit_prod?schema=public"
   JWT_SECRET="<generate_secure_random_64_character_secret>"
   CORS_ORIGIN="https://eventkit.campus.edu"
   ```

3. **Deploy Schema Migrations:**
   Copy the PostgreSQL schema and run Prisma migrations:
   ```bash
   cp prisma/schema.postgresql.prisma prisma/schema.prisma
   npx prisma migrate dev --name init_postgresql_schema
   # For production container deployment:
   # npx prisma migrate deploy
   ```

4. **Generate Prisma Client:**
   ```bash
   npx prisma generate
   ```

5. **Seed Initial System Records:**
   ```bash
   npm run seed
   ```
