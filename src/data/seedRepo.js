// Demo data for development, tests and the defence. Fixed ids make the seed
// idempotent: running it again restores a deleted demo event instead of duplicating one.
// Dates are relative to `now`, so the events stay in the future whenever it runs.

export const DEMO_IDS = {
  organizer1: '00000000-0000-4000-8000-000000000001',
  organizer2: '00000000-0000-4000-8000-000000000002',
  student1: '00000000-0000-4000-8000-000000000003',
  student2: '00000000-0000-4000-8000-000000000004',
  clubCode: '00000000-0000-4000-8000-0000000000c1',
  clubCulture: '00000000-0000-4000-8000-0000000000c2',
  eventHackathon: '00000000-0000-4000-8000-0000000000e1',
  eventGames: '00000000-0000-4000-8000-0000000000e2',
  eventCleanup: '00000000-0000-4000-8000-0000000000e3',
};

export const DEMO_USERS = [
  { id: DEMO_IDS.organizer1, email: 'organizer1@eventhub.test', displayName: 'Мария Организатор', role: 'organizer' },
  { id: DEMO_IDS.organizer2, email: 'organizer2@eventhub.test', displayName: 'Петър Организатор', role: 'organizer' },
  { id: DEMO_IDS.student1, email: 'student1@eventhub.test', displayName: 'Иван Студент', role: 'member' },
  { id: DEMO_IDS.student2, email: 'student2@eventhub.test', displayName: 'Елена Студент', role: 'member' },
];

const DAY = 24 * 60 * 60 * 1000;
const HOUR = 60 * 60 * 1000;

function demoEvents(now) {
  const at = (days, hour) => {
    const date = new Date(now.getTime() + days * DAY);
    date.setUTCHours(hour, 0, 0, 0);
    return date;
  };
  return [
    {
      id: DEMO_IDS.eventHackathon,
      clubId: DEMO_IDS.clubCode,
      organizerId: DEMO_IDS.organizer1,
      title: 'Хакатон: уеб приложение за 24 часа',
      description: 'Отбори по трима души изграждат работещо уеб приложение за един ден. Менторите са от клуба.',
      summary: 'Денонощен хакатон с ментори от клуба по програмиране.',
      category: 'technology',
      location: 'Блок 12, зала 1201',
      startsAt: at(7, 7),
      durationMs: 24 * HOUR,
      capacity: 30,
    },
    {
      id: DEMO_IDS.eventGames,
      clubId: DEMO_IDS.clubCulture,
      organizerId: DEMO_IDS.organizer2,
      title: 'Вечер на настолните игри',
      description: 'Малка вечер с настолни игри за двама. Местата са само две и вече са заети.',
      summary: 'Камерна вечер с настолни игри.',
      category: 'culture',
      location: 'Студентски клуб, ет. 2',
      startsAt: at(3, 16),
      durationMs: 3 * HOUR,
      capacity: 2,
    },
    {
      id: DEMO_IDS.eventCleanup,
      clubId: DEMO_IDS.clubCulture,
      organizerId: DEMO_IDS.organizer2,
      title: 'Доброволческо почистване на парка',
      description: 'Почистваме парка до Студентски град. Ръкавиците и чувалите са осигурени.',
      summary: 'Сутрешна доброволческа акция в парка.',
      category: 'volunteering',
      location: 'Входът на парка до блок 8',
      startsAt: at(10, 7),
      durationMs: 4 * HOUR,
      capacity: 20,
    },
  ];
}

// Games is the full event: both students hold its two seats. Student 1 is also at the hackathon.
const DEMO_REGISTRATIONS = [
  [DEMO_IDS.eventGames, DEMO_IDS.student1],
  [DEMO_IDS.eventGames, DEMO_IDS.student2],
  [DEMO_IDS.eventHackathon, DEMO_IDS.student1],
];

export async function seedDemoData(client, { passwordHash, now }) {
  for (const user of DEMO_USERS) {
    await client.query(
      `INSERT INTO users (id, email, display_name, password_hash, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO UPDATE
         SET email = EXCLUDED.email, display_name = EXCLUDED.display_name,
             password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
      [user.id, user.email, user.displayName, passwordHash, user.role],
    );
  }
  await client.query(
    `INSERT INTO clubs (id, owner_id, name, description) VALUES
       ($1, $2, 'Клуб по програмиране', 'Студенти, които пишат код заедно.'),
       ($3, $4, 'Културен клуб', 'Игри, кино и доброволчество.')
     ON CONFLICT (id) DO UPDATE SET owner_id = EXCLUDED.owner_id, name = EXCLUDED.name, description = EXCLUDED.description`,
    [DEMO_IDS.clubCode, DEMO_IDS.organizer1, DEMO_IDS.clubCulture, DEMO_IDS.organizer2],
  );
  for (const event of demoEvents(now)) {
    await client.query(
      `INSERT INTO events (id, club_id, organizer_id, title, description, summary, category, location, starts_at, ends_at, capacity)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE
         SET club_id = EXCLUDED.club_id, organizer_id = EXCLUDED.organizer_id, title = EXCLUDED.title,
             description = EXCLUDED.description, summary = EXCLUDED.summary, category = EXCLUDED.category,
             location = EXCLUDED.location, starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
             capacity = EXCLUDED.capacity, updated_at = now()`,
      [
        event.id,
        event.clubId,
        event.organizerId,
        event.title,
        event.description,
        event.summary,
        event.category,
        event.location,
        event.startsAt,
        new Date(event.startsAt.getTime() + event.durationMs),
        event.capacity,
      ],
    );
  }
  for (const [eventId, userId] of DEMO_REGISTRATIONS) {
    await client.query(
      'INSERT INTO registrations (event_id, user_id) VALUES ($1, $2) ON CONFLICT (event_id, user_id) DO NOTHING',
      [eventId, userId],
    );
  }
}
