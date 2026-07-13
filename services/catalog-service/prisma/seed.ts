import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Fixed UUIDs so docs/example requests (and the order-service walkthrough)
// can reference stable product ids after a fresh seed.
const CATEGORIES = [
  { id: 'c1000000-0000-4000-8000-000000000001', name: 'Electronics', slug: 'electronics' },
  { id: 'c1000000-0000-4000-8000-000000000002', name: 'Apparel', slug: 'apparel' },
  { id: 'c1000000-0000-4000-8000-000000000003', name: 'Books', slug: 'books' },
];

const PRODUCTS = [
  { id: 'a1000000-0000-4000-8000-000000000001', name: 'Wireless Headphones', slug: 'wireless-headphones', priceCents: 12999, stock: 120, categoryId: CATEGORIES[0].id, description: 'Over-ear Bluetooth headphones with 40h battery life.' },
  { id: 'a1000000-0000-4000-8000-000000000002', name: 'Mechanical Keyboard', slug: 'mechanical-keyboard', priceCents: 8999, stock: 75, categoryId: CATEGORIES[0].id, description: 'Hot-swappable switches, RGB, USB-C.' },
  { id: 'a1000000-0000-4000-8000-000000000003', name: '4K Webcam', slug: '4k-webcam', priceCents: 15999, stock: 40, categoryId: CATEGORIES[0].id, description: '4K30 webcam with auto light correction.' },
  { id: 'a1000000-0000-4000-8000-000000000004', name: 'USB-C Hub', slug: 'usb-c-hub', priceCents: 4999, stock: 200, categoryId: CATEGORIES[0].id, description: '8-in-1 hub with HDMI, PD, SD card reader.' },
  { id: 'a1000000-0000-4000-8000-000000000005', name: 'Graphic Tee', slug: 'graphic-tee', priceCents: 2499, stock: 300, categoryId: CATEGORIES[1].id, description: '100% organic cotton, unisex fit.' },
  { id: 'a1000000-0000-4000-8000-000000000006', name: 'Hoodie', slug: 'hoodie', priceCents: 5499, stock: 150, categoryId: CATEGORIES[1].id, description: 'Heavyweight fleece hoodie.' },
  { id: 'a1000000-0000-4000-8000-000000000007', name: 'Running Socks (3-pack)', slug: 'running-socks-3-pack', priceCents: 1499, stock: 500, categoryId: CATEGORIES[1].id, description: 'Moisture-wicking, cushioned sole.' },
  { id: 'a1000000-0000-4000-8000-000000000008', name: 'Designing Data-Intensive Applications', slug: 'designing-data-intensive-applications', priceCents: 4599, stock: 60, categoryId: CATEGORIES[2].id, description: 'Martin Kleppmann. The big ideas behind reliable, scalable systems.' },
  { id: 'a1000000-0000-4000-8000-000000000009', name: 'Domain-Driven Design', slug: 'domain-driven-design', priceCents: 5299, stock: 45, categoryId: CATEGORIES[2].id, description: 'Eric Evans. Tackling complexity in the heart of software.' },
  { id: 'a1000000-0000-4000-8000-000000000010', name: 'Out-of-Stock Collector Book', slug: 'out-of-stock-collector-book', priceCents: 9999, stock: 0, categoryId: CATEGORIES[2].id, description: 'Used to exercise insufficient-stock order rejection.' },
];

async function main(): Promise<void> {
  for (const category of CATEGORIES) {
    await prisma.category.upsert({ where: { id: category.id }, update: {}, create: category });
  }
  for (const product of PRODUCTS) {
    await prisma.product.upsert({ where: { id: product.id }, update: {}, create: product });
  }
  console.log(`Seeded ${CATEGORIES.length} categories and ${PRODUCTS.length} products`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
