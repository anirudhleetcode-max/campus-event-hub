/**
 * Demo seed. Creates a realistic, self-consistent dataset whose dates are
 * relative to "now" so there are always upcoming, ongoing and completed events.
 *
 * All seeded payments use mode = DEMO and ids prefixed "demo_" — they never
 * touched a payment gateway and cannot be refunded through Razorpay.
 *
 * Run: npm run db:seed   (refuses to run when APP_ENV=production unless SEED_FORCE=1)
 */
import { PrismaClient, type CertificateType, type EventMode, type EventStatus, type Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";

const db = new PrismaClient();

if (process.env.APP_ENV === "production" && process.env.SEED_FORCE !== "1") {
  console.error("Refusing to seed demo data in production. Set SEED_FORCE=1 to override.");
  process.exit(1);
}

export const DEMO_PASSWORD = "Demo@1234";
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";
const code = (n = 8) => Array.from(randomBytes(n), (b) => ALPHABET[b % ALPHABET.length]).join("");
const token = () => randomBytes(24).toString("base64url");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const now = Date.now();
const at = (ms: number) => new Date(now + ms);

// Deterministic pseudo-random for stable demo data
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)]!;

const FIRST = ["Aarav", "Diya", "Vihaan", "Ananya", "Arjun", "Isha", "Kabir", "Meera", "Rohan", "Saanvi", "Aditya", "Priya", "Karthik", "Nisha", "Rahul", "Sneha", "Farhan", "Zara", "Dev", "Tara", "Nikhil", "Pooja", "Siddharth", "Lakshmi", "Varun", "Aisha", "Manav", "Riya", "Yash", "Kavya", "Omkar", "Neha", "Harsh", "Divya", "Aniket", "Shreya", "Tanvi", "Rehan", "Ira", "Kunal"];
const LAST = ["Sharma", "Iyer", "Patel", "Reddy", "Nair", "Gupta", "Khan", "Menon", "Das", "Joshi", "Rao", "Singh", "Kulkarni", "Bose", "Pillai", "Mehta"];

async function reset() {
  // Order matters for FK constraints.
  await db.$transaction([
    db.reminderLog.deleteMany(), db.feedback.deleteMany(), db.certificate.deleteMany(), db.certificateTemplate.deleteMany(),
    db.attendance.deleteMany(), db.payment.deleteMany(), db.paymentWebhook.deleteMany(), db.registrationAnswer.deleteMany(),
    db.registration.deleteMany(), db.eventQuestion.deleteMany(), db.eventSpeaker.deleteMany(), db.eventVolunteer.deleteMany(),
    db.announcement.deleteMany(), db.event.deleteMany(), db.venue.deleteMany(), db.eventCategory.deleteMany(),
    db.notification.deleteMany(), db.auditLog.deleteMany(), db.session.deleteMany(), db.passwordResetToken.deleteMany(),
    db.systemSetting.deleteMany(), db.user.deleteMany(), db.department.deleteMany(), db.subscription.deleteMany(),
    db.college.deleteMany(), db.emailLog.deleteMany(), db.rateLimit.deleteMany(),
  ]);
}

async function main() {
  console.log("Seeding demo data…");
  await reset();
  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  const categories = await Promise.all(
    [
      ["Technical", "technical", "#3b4fd8"], ["Hackathon", "hackathon", "#7c3aed"], ["Workshop", "workshop", "#0891b2"],
      ["Cultural", "cultural", "#db2777"], ["Sports", "sports", "#16a34a"], ["Seminar", "seminar", "#ea580c"],
      ["Management", "management", "#ca8a04"], ["Literary", "literary", "#9333ea"],
    ].map(([name, slug, color]) => db.eventCategory.create({ data: { name: name!, slug: slug!, color: color! } })),
  );
  const cat = Object.fromEntries(categories.map((c) => [c.slug, c]));

  const northfield = await db.college.create({
    data: {
      name: "Northfield Institute of Technology", shortName: "NIT Northfield", slug: "northfield-institute", city: "Bengaluru", state: "Karnataka",
      website: "https://northfield.example.edu", contactEmail: "events@northfield.example.edu", requireEventApproval: true,
      signatoryName: "Dr. Meenakshi Rao", signatoryTitle: "Dean of Student Affairs",
      subscription: { create: { plan: "PRO", status: "ACTIVE", eventLimit: null, currentPeriodEnd: at(180 * DAY) } },
    },
  });
  const riverside = await db.college.create({
    data: {
      name: "Riverside College of Arts & Science", shortName: "Riverside", slug: "riverside-college", city: "Pune", state: "Maharashtra",
      website: "https://riverside.example.edu", contactEmail: "culture@riverside.example.edu", requireEventApproval: false,
      signatoryName: "Prof. Anil Deshmukh", signatoryTitle: "Principal",
      subscription: { create: { plan: "FREE", status: "ACTIVE", eventLimit: 25 } },
    },
  });

  const deptSpecs: [string, string, string][] = [
    [northfield.id, "Computer Science & Engineering", "CSE"], [northfield.id, "Electronics & Communication", "ECE"],
    [northfield.id, "Mechanical Engineering", "MECH"], [northfield.id, "Civil Engineering", "CIVIL"], [northfield.id, "Management Studies", "MBA"],
    [riverside.id, "Arts & Humanities", "ARTS"], [riverside.id, "Commerce", "COMM"], [riverside.id, "Life Sciences", "BIO"],
  ];
  const depts = await Promise.all(deptSpecs.map(([collegeId, name, c]) => db.department.create({ data: { collegeId, name, code: c } })));
  const nDepts = depts.filter((d) => d.collegeId === northfield.id);
  const rDepts = depts.filter((d) => d.collegeId === riverside.id);

  const mkUser = (data: Omit<Prisma.UserUncheckedCreateInput, "passwordHash">) => db.user.create({ data: { ...data, passwordHash, lastLoginAt: at(-rand() * 5 * DAY) } });
  const superAdmin = await mkUser({ name: "Platform Admin", email: "super@demo.campushub.app", role: "SUPER_ADMIN" });
  const nAdmin = await mkUser({ name: "Kavitha Raman", email: "admin@northfield.demo", role: "COLLEGE_ADMIN", collegeId: northfield.id });
  const organizer = await mkUser({ name: "Rohit Verma", email: "organizer@northfield.demo", role: "EVENT_ORGANIZER", collegeId: northfield.id, departmentId: nDepts[0]!.id });
  const faculty = await mkUser({ name: "Dr. Sunil Kapoor", email: "faculty@northfield.demo", role: "FACULTY_COORDINATOR", collegeId: northfield.id, departmentId: nDepts[0]!.id });
  const student = await mkUser({
    name: "Ananya Iyer", email: "student@northfield.demo", role: "STUDENT", collegeId: northfield.id, departmentId: nDepts[0]!.id,
    year: 3, studentId: "NIT21CS042", phone: "+91 98450 12345", interests: ["ai", "hackathons", "music"],
  });
  const rAdmin = await mkUser({ name: "Farah Sheikh", email: "admin@riverside.demo", role: "COLLEGE_ADMIN", collegeId: riverside.id });
  const rOrganizer = await mkUser({ name: "Neel Joshi", email: "organizer@riverside.demo", role: "EVENT_ORGANIZER", collegeId: riverside.id, departmentId: rDepts[0]!.id });
  await mkUser({ name: "Suspended Student", email: "suspended@northfield.demo", role: "STUDENT", collegeId: northfield.id, status: "SUSPENDED" });

  const students = [student];
  for (let i = 0; i < 64; i++) {
    const n = i < 44;
    const dept = pick(n ? nDepts : rDepts);
    const name = `${FIRST[i % FIRST.length]} ${pick(LAST)}`;
    students.push(
      await db.user.create({
        data: {
          name, email: `student${i + 1}@${n ? "northfield" : "riverside"}.demo`, passwordHash, role: "STUDENT",
          collegeId: n ? northfield.id : riverside.id, departmentId: dept.id, year: 1 + Math.floor(rand() * 4),
          studentId: `${n ? "NIT" : "RCA"}2${Math.floor(rand() * 4)}${dept.code}${String(100 + i)}`, phone: `+91 9${Math.floor(100000000 + rand() * 899999999)}`,
          createdAt: at(-(20 + rand() * 150) * DAY),
        },
      }),
    );
  }
  const volunteer = students[5]!;

  await db.certificateTemplate.createMany({
    data: [
      { collegeId: northfield.id, name: "Northfield participation", type: "PARTICIPATION", heading: "Certificate of Participation", body: "has actively participated in {{event}} organised by {{college}} on {{date}}.", accentColor: "#3b4fd8", isDefault: true },
      { collegeId: northfield.id, name: "Northfield winner", type: "WINNER", heading: "Certificate of Excellence", body: "has secured {{position}} in {{event}} organised by {{college}} on {{date}}.", accentColor: "#b45309", isDefault: true },
      { collegeId: riverside.id, name: "Riverside participation", type: "PARTICIPATION", heading: "Certificate of Participation", body: "has participated in {{event}} hosted by {{college}} on {{date}}.", accentColor: "#be185d", isDefault: true },
    ],
  });

  type Spec = {
    title: string; summary: string; category: string; college: typeof northfield; organizerId: string; dept?: string; mode?: EventMode;
    status: EventStatus; start: number; durationH: number; deadline?: number; opens?: number; capacity: number; fee: number;
    venue?: string; fill: number; tags: string[]; description: string;
  };
  const specs: Spec[] = [
    { title: "HackNorth 2026", summary: "A 24-hour hackathon to build products that matter — mentors, prizes and pizza included.", category: "hackathon", college: northfield, organizerId: organizer.id, dept: "CSE", status: "REGISTRATION_OPEN", start: 12 * DAY, durationH: 24, capacity: 120, fee: 29900, venue: "Innovation Centre, Block C", fill: 0.55, tags: ["hackathon", "coding", "ai"], description: "HackNorth is Northfield's flagship 24-hour hackathon. Form a team of up to four, pick a track (Campus Life, Climate, FinTech or Open Innovation) and ship a working prototype by morning.\n\nMentors from industry will be on the floor all night, and the top three teams win cash prizes and internship interviews with our partner companies." },
    { title: "Building with LLMs: Hands-on AI Workshop", summary: "Learn prompt design, retrieval and tool use by building a campus assistant in three hours.", category: "workshop", college: northfield, organizerId: organizer.id, dept: "CSE", status: "REGISTRATION_OPEN", start: 5 * DAY, durationH: 3, capacity: 60, fee: 0, venue: "Seminar Hall 2", fill: 0.9, tags: ["ai", "llm", "workshop"], description: "A practical, laptop-required workshop. We'll start from a blank project and build a campus Q&A assistant step by step: prompt design, retrieval over documents, calling tools, and evaluating responses.\n\nBasic Python is recommended. Seats are limited to keep the session hands-on." },
    { title: "Rhythm — Annual Cultural Fest", summary: "Two days of music, dance, drama and food stalls. Open to all colleges.", category: "cultural", college: northfield, organizerId: organizer.id, status: "REGISTRATION_OPEN", start: 25 * DAY, durationH: 34, capacity: 500, fee: 15000, venue: "Main Amphitheatre", fill: 0.28, tags: ["music", "dance", "fest"], description: "Rhythm is back! Battle of bands, solo and group dance, street play, stand-up comedy and a food court run by student clubs.\n\nYour pass includes entry to all events on both days and the closing night concert." },
    { title: "Robotics Expo & Line-Follower Challenge", summary: "Showcase your bots and race them on our line-follower track — live now.", category: "technical", college: northfield, organizerId: organizer.id, dept: "ECE", status: "ONGOING", start: -2 * HOUR, durationH: 8, deadline: -1 * DAY, capacity: 80, fee: 0, venue: "Robotics Lab & Quad", fill: 0.7, tags: ["robotics", "hardware"], description: "Student teams exhibit robots built over the semester, followed by the line-follower speed challenge. Judges from the ECE department will score design, reliability and speed." },
    { title: "Startup Pitch Night", summary: "Ten student startups pitch to angel investors. Networking dinner follows.", category: "management", college: northfield, organizerId: organizer.id, dept: "MBA", status: "COMPLETED", start: -10 * DAY, durationH: 4, capacity: 150, fee: 9900, venue: "Auditorium", fill: 0.72, tags: ["startups", "entrepreneurship"], description: "Ten shortlisted student startups get five minutes each to pitch to a panel of angel investors, followed by Q&A and a networking dinner." },
    { title: "Data Science Bootcamp", summary: "A weekend bootcamp covering pandas, visualisation and model evaluation.", category: "workshop", college: northfield, organizerId: organizer.id, dept: "CSE", status: "COMPLETED", start: -40 * DAY, durationH: 16, capacity: 90, fee: 0, venue: "Computer Centre", fill: 0.85, tags: ["data", "python"], description: "An intensive two-day bootcamp for beginners: data wrangling with pandas, visual storytelling, and evaluating machine-learning models." },
    { title: "Inter-College Football League", summary: "Eight colleges, one trophy. Register your team before the draw.", category: "sports", college: riverside, organizerId: rOrganizer.id, status: "REGISTRATION_CLOSED", start: 6 * DAY, durationH: 10, deadline: -1 * DAY, capacity: 40, fee: 50000, venue: "Riverside Sports Ground", fill: 0.9, tags: ["football", "sports"], description: "A one-day knockout tournament between eight colleges. Team registration is per captain." },
    { title: "Poetry Slam: Voices", summary: "An open-mic evening of spoken word in English, Hindi and Marathi.", category: "literary", college: riverside, organizerId: rOrganizer.id, status: "REGISTRATION_OPEN", start: 9 * DAY, durationH: 3, capacity: 70, fee: 0, venue: "Riverside Library Lawn", fill: 0.4, tags: ["poetry", "open-mic"], description: "Bring your words. Five-minute slots, judged by faculty from the Department of Languages." },
    { title: "Cloud Computing Seminar", summary: "Industry talk on scaling campus apps on serverless platforms.", category: "seminar", college: northfield, organizerId: organizer.id, dept: "CSE", status: "DRAFT", start: 30 * DAY, durationH: 2, capacity: 200, fee: 0, venue: "Seminar Hall 1", fill: 0, tags: ["cloud"], description: "An industry expert walks through designing, deploying and monitoring serverless applications, with a live demo." },
    { title: "Campus Photography Walk", summary: "Golden-hour photo walk around campus with a mentor from the Photo Club.", category: "cultural", college: northfield, organizerId: organizer.id, status: "PENDING_APPROVAL", start: 15 * DAY, durationH: 3, capacity: 30, fee: 0, venue: "Main Gate", fill: 0, tags: ["photography"], description: "A relaxed golden-hour walk with composition tips. Any camera — including phones — is welcome." },
    { title: "National Debate Championship", summary: "Parliamentary debate for undergraduate teams.", category: "literary", college: northfield, organizerId: organizer.id, status: "CANCELLED", start: 8 * DAY, durationH: 8, capacity: 64, fee: 20000, venue: "Auditorium", fill: 0, tags: ["debate"], description: "Asian Parliamentary format debate championship." },
    { title: "Circuit Design Workshop", summary: "From breadboard to PCB: design your first circuit board.", category: "workshop", college: northfield, organizerId: organizer.id, dept: "ECE", mode: "HYBRID", status: "REGISTRATION_OPEN", start: 18 * DAY, durationH: 5, capacity: 45, fee: 19900, venue: "ECE Lab 3", fill: 0.2, tags: ["electronics", "pcb"], description: "Design a simple PCB in KiCad, then watch it fabricated live. Remote participants can follow along online." },
    { title: "Marathon for a Cause", summary: "5K and 10K runs supporting the city's animal shelter.", category: "sports", college: riverside, organizerId: rOrganizer.id, status: "REGISTRATION_OPEN", start: 20 * DAY, durationH: 4, capacity: 300, fee: 25000, venue: "Riverside Main Gate", fill: 0.33, tags: ["running", "charity"], description: "Run 5K or 10K. All proceeds go to the city animal shelter. Includes T-shirt and medal." },
  ];

  const events: { id: string; spec: Spec; startsAt: Date; endsAt: Date }[] = [];
  for (const s of specs) {
    const startsAt = at(s.start);
    const endsAt = new Date(startsAt.getTime() + s.durationH * HOUR);
    const deadline = s.deadline !== undefined ? at(s.deadline) : new Date(startsAt.getTime() - 12 * HOUR);
    const dept = s.dept ? depts.find((d) => d.code === s.dept && d.collegeId === s.college.id) : undefined;
    const slug = `${s.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 50)}-${code(5).toLowerCase()}`;
    const venue = s.venue ? await db.venue.upsert({ where: { collegeId_name: { collegeId: s.college.id, name: s.venue } }, create: { collegeId: s.college.id, name: s.venue, city: s.college.city }, update: {} }) : null;
    const published = !["DRAFT", "PENDING_APPROVAL"].includes(s.status);
    const e = await db.event.create({
      data: {
        slug, title: s.title, summary: s.summary, description: s.description, categoryId: cat[s.category]!.id, collegeId: s.college.id,
        departmentId: dept?.id, organizerId: s.organizerId, mode: s.mode ?? "IN_PERSON", status: s.status, startsAt, endsAt,
        registrationOpensAt: new Date(Math.min(now - 30 * DAY, startsAt.getTime() - 45 * DAY)), registrationDeadline: deadline,
        venueId: venue?.id, venueName: s.venue, venueAddress: s.venue ? `${s.college.name} campus` : null, city: s.college.city,
        latitude: s.college.id === northfield.id ? 12.9716 : 18.5204, longitude: s.college.id === northfield.id ? 77.5946 : 73.8567,
        onlineUrl: s.mode === "HYBRID" ? "https://meet.example.com/circuit-design" : null,
        capacity: s.capacity, feeAmount: s.fee, eligibility: "Open to all enrolled undergraduate and postgraduate students with a valid college ID.",
        requiredFields: s.fee > 0 ? ["phone", "studentId"] : ["studentId"],
        rules: "Carry your college ID card.\nThe QR pass must be shown at the entrance.\nThe organizers' decision is final.",
        terms: "By registering you agree to follow the college code of conduct.",
        refundPolicy: s.fee > 0 ? "Full refund if cancelled 48 hours before the event. No refunds after that." : null,
        schedule: [
          { time: "Opening", title: "Registration & welcome" },
          { time: "Main", title: "Main programme" },
          { time: "Close", title: "Closing & awards" },
        ],
        faqs: [
          { question: "Is there on-spot registration?", answer: "Only if seats remain. We recommend registering online." },
          { question: "Do I need to print my pass?", answer: "No — show the QR pass on your phone." },
        ],
        tags: s.tags, publishedAt: published ? at(-30 * DAY) : null,
        cancelledAt: s.status === "CANCELLED" ? at(-2 * DAY) : null, cancelReason: s.status === "CANCELLED" ? "Venue unavailable due to university examinations." : null,
        approvedById: published && s.college.id === northfield.id ? nAdmin.id : null,
        createdAt: at(-(45 + rand() * 20) * DAY),
        questions:
          s.category === "hackathon"
            ? { create: [
                { label: "Team name", type: "TEXT", required: true, position: 0 },
                { label: "Preferred track", type: "SELECT", options: ["Campus Life", "Climate", "FinTech", "Open Innovation"], required: true, position: 1 },
                { label: "T-shirt size", type: "SELECT", options: ["S", "M", "L", "XL"], required: false, position: 2 },
              ] }
            : { create: [{ label: "What do you hope to learn or experience?", type: "TEXTAREA", required: false, position: 0 }] },
        speakers: {
          create: [
            { name: "Priya Natarajan", title: "Principal Engineer", organization: "Nimbus Labs", role: "SPEAKER", position: 0, bio: "Builds large-scale platforms and mentors student developers." },
            { name: "Arvind Menon", title: "Founder", organization: "LaunchPad Ventures", role: "JUDGE", position: 1, bio: "Angel investor and startup mentor." },
          ],
        },
      },
    });
    events.push({ id: e.id, spec: s, startsAt, endsAt });
  }

  const byTitle = (t: string) => events.find((e) => e.spec.title.startsWith(t))!;
  // Staff assignments
  await db.eventVolunteer.createMany({
    data: [
      { eventId: byTitle("HackNorth").id, userId: faculty.id, role: "FACULTY_COORDINATOR", canScan: true },
      { eventId: byTitle("Robotics").id, userId: faculty.id, role: "FACULTY_COORDINATOR", canScan: true },
      { eventId: byTitle("Startup").id, userId: faculty.id, role: "FACULTY_COORDINATOR", canScan: false },
      { eventId: byTitle("Robotics").id, userId: volunteer.id, role: "VOLUNTEER", canScan: true },
      { eventId: byTitle("Startup").id, userId: volunteer.id, role: "VOLUNTEER", canScan: true },
    ],
  });

  // Registrations, payments, attendance, feedback, certificates
  let regCount = 0;
  for (const ev of events) {
    const { spec } = ev;
    if (spec.fill === 0) continue;
    const pool = students.filter((u) => (spec.college.id === northfield.id ? rand() < 0.85 : rand() < 0.6));
    const target = Math.min(pool.length, Math.round(spec.capacity * spec.fill), spec.capacity);
    // The main demo student is registered for a curated set of events only.
    const demoStudentEvents = ["HackNorth", "Robotics", "Startup", "Data Science", "Building with LLMs"];
    const others = pool.filter((u) => u.id !== student.id).slice(0, target);
    const chosen = demoStudentEvents.some((t) => spec.title.startsWith(t)) ? [student, ...others] : others;

    const windowStart = Math.max(now - 45 * DAY, ev.startsAt.getTime() - 40 * DAY);
    const windowEnd = Math.min(now - HOUR, ev.startsAt.getTime() - 13 * HOUR);
    for (const u of chosen.slice(0, spec.capacity)) {
      const createdAt = new Date(windowStart + rand() * Math.max(HOUR, windowEnd - windowStart));
      const dept = depts.find((d) => d.id === u.departmentId);
      const college = u.collegeId === northfield.id ? northfield : riverside;
      const reg = await db.registration.create({
        data: {
          code: `REG-${code(8)}`, eventId: ev.id, userId: u.id, status: "CONFIRMED", qrToken: token(), amount: spec.fee,
          participantName: u.name, participantEmail: u.email, participantPhone: u.phone, collegeName: college.name,
          departmentName: dept?.name, year: u.year, studentId: u.studentId, confirmedAt: new Date(createdAt.getTime() + 5 * 60_000), createdAt,
        },
      });
      regCount++;
      if (spec.fee > 0) {
        await db.payment.create({
          data: {
            registrationId: reg.id, userId: u.id, eventId: ev.id, amount: spec.fee, currency: "INR", status: "CAPTURED", mode: "DEMO",
            receipt: `demo_rcpt_${code(10)}`, razorpayOrderId: `demo_order_${code(12)}`, razorpayPaymentId: `demo_pay_${code(12)}`,
            method: pick(["upi", "card", "netbanking", "upi"]), paidAt: new Date(createdAt.getTime() + 4 * 60_000), createdAt,
            gatewayMeta: { note: "Seeded demo payment — never processed by a gateway" },
          },
        });
      }
      const past = ev.endsAt.getTime() < now;
      const ongoing = ev.startsAt.getTime() < now && !past;
      const attended = (past && rand() < 0.82) || (ongoing && u.id !== student.id && rand() < 0.55);
      if (attended) {
        await db.attendance.create({
          data: { registrationId: reg.id, eventId: ev.id, userId: u.id, markedById: spec.organizerId, checkInAt: new Date(ev.startsAt.getTime() + rand() * 90 * 60_000), method: rand() < 0.93 ? "QR" : "MANUAL" },
        });
        if (past && (rand() < 0.6 || u.id === student.id) && !(u.id === student.id && spec.title.startsWith("Startup"))) {
          await db.feedback.create({
            data: {
              eventId: ev.id, userId: u.id, registrationId: reg.id, overall: 3 + Math.floor(rand() * 3), organization: 3 + Math.floor(rand() * 3),
              venue: 2 + Math.floor(rand() * 4), speakers: 3 + Math.floor(rand() * 3), experience: 3 + Math.floor(rand() * 3),
              comments: pick(["Loved the energy and the mentors!", "Well organised, but the venue was crowded.", "Great speakers — learned a lot.", "Would attend again.", null]),
              suggestions: pick(["More water stations please.", "Start on time.", "Share slides afterwards.", null]),
              createdAt: new Date(ev.endsAt.getTime() + rand() * 2 * DAY),
            },
          });
        }
        if (past && spec.title.startsWith("Data Science")) {
          await db.certificate.create({
            data: { code: `CEH-${new Date(ev.endsAt).getFullYear()}-${code(8)}`, eventId: ev.id, userId: u.id, registrationId: reg.id, type: "PARTICIPATION", recipientName: u.name, issuedById: organizer.id, issuedAt: new Date(ev.endsAt.getTime() + DAY) },
          });
        }
      }
    }
  }

  // A winner certificate for the demo student and a volunteer certificate.
  const ds = byTitle("Data Science");
  await db.certificate.create({ data: { code: `CEH-${new Date().getFullYear()}-${code(8)}`, eventId: ds.id, userId: student.id, type: "WINNER" as CertificateType, position: "First Place — Capstone Challenge", recipientName: student.name, issuedById: organizer.id, issuedAt: new Date(ds.endsAt.getTime() + DAY) } });
  await db.certificate.create({ data: { code: `CEH-${new Date().getFullYear()}-${code(8)}`, eventId: ds.id, userId: volunteer.id, type: "VOLUNTEER", recipientName: volunteer.name, issuedById: organizer.id, issuedAt: new Date(ds.endsAt.getTime() + DAY) } });

  // Notifications for the demo student
  const hack = byTitle("HackNorth");
  await db.notification.createMany({
    data: [
      { userId: student.id, type: "REGISTRATION_CONFIRMED", title: "You're registered for HackNorth 2026", body: "Your QR pass is ready. See you there!", link: "/my/registrations", createdAt: at(-3 * DAY), readAt: at(-3 * DAY) },
      { userId: student.id, type: "PAYMENT_CONFIRMED", title: "Payment received", body: "We received ₹299 for HackNorth 2026 (demo payment).", link: "/my/payments", createdAt: at(-3 * DAY) },
      { userId: student.id, type: "CERTIFICATE_AVAILABLE", title: "Your certificate for Data Science Bootcamp is ready", body: "Download it from your certificates page.", link: "/my/certificates", createdAt: at(-38 * DAY), readAt: at(-37 * DAY) },
      { userId: student.id, type: "FEEDBACK_REQUEST", title: "How was Startup Pitch Night?", body: "Share your feedback to help organizers improve.", link: "/my/registrations", createdAt: at(-9 * DAY) },
      { userId: student.id, type: "ANNOUNCEMENT", title: "Library hours extended during fest week", body: "The central library stays open until 11pm from Monday.", link: "/notifications", createdAt: at(-1 * DAY) },
    ],
  });
  await db.announcement.create({ data: { authorId: nAdmin.id, collegeId: northfield.id, title: "Library hours extended during fest week", body: "The central library stays open until 11pm from Monday.", audience: "ALL_STUDENTS", recipientCount: 45, createdAt: at(-1 * DAY) } });

  await db.systemSetting.create({
    data: { key: "platform", value: { platformName: "Campus Event Hub", supportEmail: "support@campuseventhub.app", seatHoldMinutes: 15, reminderOffsetsHours: [168, 24, 1], allowStudentSignup: true } },
  });

  await db.auditLog.createMany({
    data: [
      { actorId: organizer.id, action: "event.created", entityType: "event", entityId: hack.id, metadata: { title: hack.spec.title }, createdAt: at(-50 * DAY) },
      { actorId: organizer.id, action: "event.submit", entityType: "event", entityId: hack.id, createdAt: at(-49 * DAY) },
      { actorId: nAdmin.id, action: "event.approve", entityType: "event", entityId: hack.id, createdAt: at(-48 * DAY) },
      { actorId: superAdmin.id, action: "college.created", entityType: "college", entityId: riverside.id, createdAt: at(-120 * DAY) },
      { actorId: nAdmin.id, action: "announcement.sent", entityType: "announcement", createdAt: at(-1 * DAY) },
    ],
  });

  console.log(`✔ Seeded ${events.length} events, ${students.length} students, ${regCount} registrations.`);
  console.log(`  Demo password for all accounts: ${DEMO_PASSWORD}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
