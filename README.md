# Shared Event Kit Booking System

A production-ready, full-stack, real-time web application for student clubs sharing a physical event production kit containing:
- **1 Camera** (Sony Alpha 4K)
- **1 Microphone** (Rode Wireless Pro Dual Kit)
- **1 Tripod** (Manfrotto Video Fluid Monopod & Tripod)

The system enforces strict whole-kit reservations, a mandatory 15-minute preparation buffer between bookings, item-by-item handover/return inspections, automated disruption detection, persistent warnings, recovery/replacement workflows, and real-time live synchronization.

---

## 1. System Architecture & Features

- **Whole-Kit Reservation (R1):** Bookings apply to the kit as an indivisible atomic unit. Concurrent requests are serialized via in-memory kit locks and database transactions to prevent double bookings.
- **15-Minute Buffer & Half-Open Intervals (R2):** Enforces half-open interval rules $[start, end)$ and a strict 15-minute gap between consecutive bookings. Cancelled bookings release their slot immediately.
- **Whole-Kit Checkout & Item Returns (R3):** Equipment handover requires all 3 items to be present and verified USABLE. Item-by-item returns support partial returns and individual inspection outcomes.
- **Disruptions & Warning Broadcast (R4):** Missing or damaged items persist a Disruption record, automatically transition subsequent bookings to `AT_RISK`, and persist warnings/notifications for affected clubs.
- **Coordinator Recovery & Replacement (R5):** Disrupted equipment can be recovered or replaced with a new unit; restored items require a passing inspection before kit availability is restored.
- **Real-Time Synchronization:** Live updates via Socket.IO for availability, booking status changes, and notifications.
- **Offline Reliability:** Notifications are persisted in the database before delivery; clients retrieve unread notifications upon reconnecting.

---

## 2. Prerequisites

- **Node.js:** v18.0.0 or higher (v20+ recommended)
- **npm:** v9.0.0 or higher
- **Operating System:** Windows 10 / 11 with PowerShell
- **Database (Local):** SQLite (preconfigured with Prisma; zero cloud setup required)

---

## 3. Quick Start (Windows PowerShell)

Follow these exact steps in Windows PowerShell to set up and run the system locally:

### Step 1: Open Terminal in Project Root
```powershell
cd E:\lld_pro
```

### Step 2: Install Dependencies
Install dependencies for both backend and frontend:
```powershell
# In project root
npm install --prefix backend
npm install --prefix frontend
```

### Step 3: Configure Environment Variables
Copy the `.env.example` file to create `.env` in the backend folder:
```powershell
Copy-Item .env.example backend\.env
```

The default local configuration in `backend/.env` is ready out-of-the-box:
```ini
PORT=4000
DATABASE_URL="file:./dev.db"
JWT_SECRET=super_secret_local_dev_jwt_key_change_in_production_123456
JWT_EXPIRES_IN=24h
NODE_ENV=development
CORS_ORIGIN=http://localhost:5173
```

### Step 4: Initialize the Database & Seed Demo Data
Synchronize the Prisma schema and seed the initial kit, clubs, and demo accounts:
```powershell
# Generate Prisma Client
npm run prisma:generate --prefix backend

# Push SQLite database schema
npm run prisma:push --prefix backend

# Seed initial kit and safe demo accounts
npm run seed --prefix backend
```

---

## 4. Starting the Application Locally

Run the backend and frontend in separate PowerShell terminal windows:

### Terminal 1 — Start the Backend Server:
```powershell
cd E:\lld_pro
npm run dev:backend
```
*The backend API and Socket.IO server will start at `http://localhost:4000`.*  
*Health check URL: `http://localhost:4000/health`*

### Terminal 2 — Start the Frontend Development Server:
```powershell
cd E:\lld_pro
npm run dev:frontend
```
*The Vite development server will start at `http://localhost:5173`.*

---

## 5. Accessing the Application & Demo Credentials

Open your browser and navigate to:

👉 **`http://localhost:5173`**


---

## 6. Running Automated Tests

To run the complete automated test suite (61 tests covering backend domain math, concurrency, RBAC, equipment workflows, e2e user journeys, and frontend UI):

### Run All Tests:
```powershell
npm test
```

### Run Backend Tests Only (56 tests):
```powershell
npm run test:backend
```

### Run Frontend Tests Only (5 tests):
```powershell
npm run test:frontend
```

---

## 7. Building for Production Verification

To verify TypeScript compilation and production builds without running a server:
```powershell
npm run build
```
This builds:
- Backend: compiles TypeScript via `tsc` to `backend/dist/`.
- Frontend: typechecks and bundles via `vite build` to `frontend/dist/`.

---

## 8. Common Local Troubleshooting Steps

### 1. Port 4000 or 5173 is already in use
If you receive `EADDRINUSE: address already in use :::4000`:
```powershell
# Find and terminate process using port 4000
Get-Process -Id (Get-NetTCPConnection -LocalPort 4000).OwningProcess | Stop-Process -Force
```

### 2. Database Reset
If you want to reset the database back to a clean state:
```powershell
npm run seed --prefix backend
```
The seed script will automatically clear previous bookings, logs, disruptions, and re-create the pristine kit and demo accounts.

### 3. Frontend proxy not reaching backend
Ensure the backend is running in Terminal 1 on port `4000` before logging into the frontend. The Vite frontend proxy in `frontend/vite.config.ts` forwards `/api` and `/socket.io` to `http://localhost:4000`.

---

## 9. Key Business Rules & Architectural Assumptions

1. **Atomic Whole-Kit:** Reservations reserve the complete kit (Camera + Mic + Tripod) for the entire duration. No individual item bookings exist.
2. **15-Minute Preparation Buffer:** Every reservation requires a minimum 15-minute buffer before the next reservation can begin. If Booking 1 ends at 15:00:
   - A booking starting at 15:15:00 is **allowed**.
   - A booking starting at 15:14:59 is **rejected**.
3. **Checkout Guard:** Coordinators can only complete handover if the camera, microphone, and tripod are all verified USABLE and present.
4. **Disruption Propagation:** If an item is returned damaged or missing, the next subsequent booking is flagged `AT_RISK` and a persistent in-app warning notification is sent to the club.
5. **Verified Restoration:** Recovered or replacement equipment must receive an explicit `PASS` inspection from a coordinator before kit availability is restored.
