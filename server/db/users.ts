// User management CLI. Stop the dev server first - PGlite is single-process,
// and the lockfile in client.ts will refuse to run otherwise.
//   node db/users.ts create <email> [full name] [--password <pw>]
//   node db/users.ts list
//   node db/users.ts password <email> [--password <pw>]
//   node db/users.ts activate <email>
//   node db/users.ts deactivate <email>
//   node db/users.ts delete <email>
// Without --password, the password is asked for interactively (input hidden).
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { db, ready, schema, close } from './client.ts';

const ADMIN_ROLE = 'Admin';

const USAGE = `usage: node db/users.ts <command>   (stop the dev server first)

  create <email> [full name] [--password <pw>]   add a user
  list                                           show all users
  password <email> [--password <pw>]             set a new password
  activate <email>                               re-enable login for a deactivated user
  deactivate <email>                             disable login immediately (existing sessions too - see middleware/auth.ts)
  delete <email>                                 remove a user permanently (prefer deactivate - see the Users page)

Without --password you are prompted interactively (input hidden).
Note: --password ends up in your shell history - prefer the prompt.`;

// pull `--password <pw>` out of argv, leaving positional args
const argv = process.argv.slice(2);
let passwordArg: string | undefined;
const pwIdx = argv.indexOf('--password');
if (pwIdx !== -1) {
  passwordArg = argv[pwIdx + 1];
  argv.splice(pwIdx, 2);
  console.warn('warning: --password is visible in shell history and process lists');
}
const [command, email, fullName] = argv;

const fail = (msg: string): never => { console.error(`error: ${msg}`); process.exit(1); };

function promptHidden(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    // piped input: read one line (echo isn't an issue without a terminal)
    return new Promise((resolve) => {
      let buf = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (c: string) => { buf += c; });
      process.stdin.on('end', () => resolve(buf.split('\n')[0]));
    });
  }
  return new Promise((resolve) => {
    process.stdout.write(question);
    const stdin = process.stdin;
    stdin.resume();
    stdin.setRawMode(true);
    let buf = '';
    const onData = (chunk: Buffer) => {
      const ch = chunk.toString('utf-8');
      if (ch === '\r' || ch === '\n' || ch === '\u0004') {
        stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData);
        process.stdout.write('\n');
        resolve(buf);
      } else if (ch === '\u0003') { // ctrl-c
        stdin.setRawMode(false);
        process.stdout.write('\n');
        process.exit(130);
      } else if (ch === '\u007f' || ch === '\b') {
        buf = buf.slice(0, -1);
      } else {
        buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function getPassword(): Promise<string> {
  const pw = passwordArg ?? await promptHidden('Password: ');
  if (pw.length < 8) fail('password must be at least 8 characters');
  // confirmation only makes sense interactively - piped stdin has one shot
  if (passwordArg === undefined && process.stdin.isTTY) {
    const again = await promptHidden('Repeat password: ');
    if (again !== pw) fail('passwords do not match');
  }
  return bcrypt.hash(pw, 10);
}

const findUser = async (mail: string) => {
  const [u] = await db.select().from(schema.users).where(eq(schema.users.email, mail));
  return u;
};

const requireEmail = (): string => {
  if (!email) { console.error(USAGE); process.exit(1); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(`"${email}" does not look like an email address`);
  return email.toLowerCase();
};

await ready();

switch (command) {
  case 'create': {
    const mail = requireEmail();
    if (await findUser(mail)) fail(`a user with email ${mail} already exists`);
    const isFirstUser = (await db.select().from(schema.users)).length === 0;
    const passwordHash = await getPassword();
    const [u] = await db.insert(schema.users).values({
      email: mail,
      passwordHash,
      fullName: fullName ?? null,
      createdAt: new Date().toISOString(),
    }).returning();
    console.log(`created user #${u.id} ${u.email}${u.fullName ? ` (${u.fullName})` : ''}`);
    // The very first user ever created is auto-assigned Admin, so a fresh
    // `npm run user:create` isn't locked out of their own app once RBAC
    // enforcement is on. Every subsequent user needs an explicit role:assign.
    if (isFirstUser) {
      const [admin] = await db.select().from(schema.roles).where(eq(schema.roles.name, ADMIN_ROLE));
      if (admin) {
        await db.insert(schema.userRoles).values({ userId: u.id, roleId: admin.id });
        console.log(`(first user - assigned role ${ADMIN_ROLE})`);
      }
    }
    break;
  }
  case 'list': {
    const rows = await db.select().from(schema.users).orderBy(schema.users.id);
    if (rows.length === 0) {
      console.log('no users');
    } else {
      for (const u of rows) {
        console.log(`#${u.id}\t${u.email}\t${u.fullName ?? '-'}\t${u.active ? 'active' : 'inactive'}\tcreated ${u.createdAt.slice(0, 10)}`);
      }
    }
    break;
  }
  case 'password': {
    const mail = requireEmail();
    const u = await findUser(mail);
    if (!u) fail(`no user with email ${mail}`);
    const passwordHash = await getPassword();
    await db.update(schema.users).set({ passwordHash }).where(eq(schema.users.id, u!.id));
    console.log(`password updated for ${mail}`);
    break;
  }
  case 'activate': {
    const mail = requireEmail();
    const u = await findUser(mail);
    if (!u) fail(`no user with email ${mail}`);
    await db.update(schema.users).set({ active: true }).where(eq(schema.users.id, u!.id));
    console.log(`${mail}: activated`);
    break;
  }
  case 'deactivate': {
    const mail = requireEmail();
    const u = await findUser(mail);
    if (!u) fail(`no user with email ${mail}`);
    await db.update(schema.users).set({ active: false }).where(eq(schema.users.id, u!.id));
    console.log(`${mail}: deactivated (existing sessions are rejected on their next request)`);
    break;
  }
  case 'delete': {
    const mail = requireEmail();
    const u = await findUser(mail);
    if (!u) fail(`no user with email ${mail}`);
    await db.delete(schema.users).where(eq(schema.users.id, u!.id));
    console.log(`deleted user ${mail}`);
    break;
  }
  default:
    console.error(USAGE);
    process.exit(1);
}

await close();
process.exit(0);
