import bcrypt from 'bcryptjs';
import prisma from '../db/prisma.js';
import { Role, ItemType, KitItemState } from '@prisma/client';

export async function seedDatabase() {
  console.log('Seeding database with initial kit and demo accounts...');

  // 1. Clear existing records safely
  await prisma.auditLog.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.warning.deleteMany();
  await prisma.disruption.deleteMany();
  await prisma.inspectionRecord.deleteMany();
  await prisma.handoverRecord.deleteMany();
  await prisma.booking.deleteMany();
  await prisma.kitItem.deleteMany();
  await prisma.kit.deleteMany();
  await prisma.user.deleteMany();
  await prisma.club.deleteMany();

  // 2. Hash default non-production demo passwords
  const salt = await bcrypt.genSalt(10);
  const coordinatorPassword = await bcrypt.hash('Coordinator123!', salt);
  const clubPassword = await bcrypt.hash('ClubPass123!', salt);

  // 3. Create Coordinator Account
  const coordinator = await prisma.user.create({
    data: {
      email: 'coordinator@campus.edu',
      name: 'Event Operations Coordinator',
      role: Role.COORDINATOR,
      passwordHash: coordinatorPassword,
    },
  });
  console.log(`Created Coordinator (ADMIN): ${coordinator.email}`);

  // 4. Create Clubs
  const club1 = await prisma.club.create({
    data: {
      name: 'Robotics Club',
      code: 'ROBOTICS',
      contactEmail: 'robotics@campus.edu',
    },
  });

  const club2 = await prisma.club.create({
    data: {
      name: 'Drama Society',
      code: 'DRAMA',
      contactEmail: 'drama@campus.edu',
    },
  });
  console.log(`Created Clubs: ${club1.name} (${club1.code}), ${club2.name} (${club2.code})`);

  // 5. Create Club Member Accounts (USER role)
  const userClub1 = await prisma.user.create({
    data: {
      email: 'robotics_lead@campus.edu',
      name: 'Alex Rivera (Robotics Lead)',
      role: Role.CLUB_MEMBER,
      clubId: club1.id,
      passwordHash: clubPassword,
    },
  });

  const userClub2 = await prisma.user.create({
    data: {
      email: 'drama_lead@campus.edu',
      name: 'Jordan Hayes (Drama Lead)',
      role: Role.CLUB_MEMBER,
      clubId: club2.id,
      passwordHash: clubPassword,
    },
  });
  console.log(`Created Club Users (USER): ${userClub1.email}, ${userClub2.email}`);

  // 6. Create or retrieve Initial Kit
  let kit = await prisma.kit.findFirst({
    where: { name: 'Campus Production Event Kit' },
  });

  if (!kit) {
    kit = await prisma.kit.create({
      data: {
        name: 'Campus Production Event Kit',
        description: 'Physical event kit containing 1 Camera, 1 Microphone, and 1 Tripod.',
      },
    });
  }

  // 7. Create or retrieve Exactly the Three Required Items
  let camera = await prisma.kitItem.findUnique({ where: { serialNumber: 'CAM-SONY-4K-01' } });
  if (!camera) {
    camera = await prisma.kitItem.create({
      data: {
        kitId: kit.id,
        type: ItemType.CAMERA,
        serialNumber: 'CAM-SONY-4K-01',
        state: KitItemState.AVAILABLE,
        conditionNote: 'Sony Alpha 4K Body + 24-70mm Lens. Clean sensor and battery verified.',
      },
    });
  } else {
    camera = await prisma.kitItem.update({
      where: { id: camera.id },
      data: { kitId: kit.id, state: KitItemState.AVAILABLE },
    });
  }

  let mic = await prisma.kitItem.findUnique({ where: { serialNumber: 'MIC-RODE-PRO-01' } });
  if (!mic) {
    mic = await prisma.kitItem.create({
      data: {
        kitId: kit.id,
        type: ItemType.MIC,
        serialNumber: 'MIC-RODE-PRO-01',
        state: KitItemState.AVAILABLE,
        conditionNote: 'Rode Wireless Pro Dual Kit. Both transmitters tested and paired.',
      },
    });
  } else {
    mic = await prisma.kitItem.update({
      where: { id: mic.id },
      data: { kitId: kit.id, state: KitItemState.AVAILABLE },
    });
  }

  let tripod = await prisma.kitItem.findUnique({ where: { serialNumber: 'TRI-MANFROTTO-01' } });
  if (!tripod) {
    tripod = await prisma.kitItem.create({
      data: {
        kitId: kit.id,
        type: ItemType.TRIPOD,
        serialNumber: 'TRI-MANFROTTO-01',
        state: KitItemState.AVAILABLE,
        conditionNote: 'Manfrotto Video Fluid Monopod & Tripod Base. Quick-release plate secured.',
      },
    });
  } else {
    tripod = await prisma.kitItem.update({
      where: { id: tripod.id },
      data: { kitId: kit.id, state: KitItemState.AVAILABLE },
    });
  }

  console.log(`Created Kit: ${kit.name} with items:`);
  console.log(` - Camera: [${camera.id}] ${camera.serialNumber} (${camera.state})`);
  console.log(` - Mic: [${mic.id}] ${mic.serialNumber} (${mic.state})`);
  console.log(` - Tripod: [${tripod.id}] ${tripod.serialNumber} (${tripod.state})`);

  // Record audit log entry
  await prisma.auditLog.create({
    data: {
      actorId: coordinator.id,
      actorRole: coordinator.role,
      action: 'SYSTEM_INITIALIZATION',
      entityType: 'KIT',
      entityId: kit.id,
      details: JSON.stringify({
        initializedItems: [camera.serialNumber, mic.serialNumber, tripod.serialNumber],
        seededClubs: [club1.code, club2.code],
      }),
    },
  });

  console.log('Seeding completed successfully!');
  return { kit, coordinator, club1, club2, userClub1, userClub2, items: [camera, mic, tripod] };
}

if (process.argv[1]?.endsWith('seed.ts') || process.argv[1]?.endsWith('seed.js')) {
  seedDatabase()
    .then(async () => {
      await prisma.$disconnect();
      process.exit(0);
    })
    .catch(async (e) => {
      console.error('Seeding error:', e);
      await prisma.$disconnect();
      process.exit(1);
    });
}
